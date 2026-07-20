import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AssistantGetResponse,
  AssistantMessage,
  AssistantPostInput,
  AssistantPostResponse,
  AssistantReadTool,
  AssistantToolResultSummary,
  normalizeAssistantToolResultsFromDb,
  parseAssistantToolResultsForPersistence,
} from './assistant';
import { ENVIRONMENT_REQUIREMENTS } from './env';
import { HandoffEnvelope } from './foundation';
import {
  admitsRetention,
  admitsStrategicContinuityFallback,
  CompanyLlmPolicy,
  DEFAULT_TIER_MODELS,
  lookupModelCapability,
  MODEL_CAPABILITY_REGISTRY,
  STRATEGIC_CONTINUITY_FALLBACK,
} from './llm';
import { ConceptBatch, ResearchDirective } from './research-artifacts';
import { leakLint } from './leak-lint';
import {
  CapitalAllocationInput,
  CreateCompanyInput,
  CreateModuleInput,
  deriveGeneratedModuleName,
  handleIdForLink,
  handleIdForStream,
  handleIdForTrendCandidate,
  isLegalFundRoute,
  LINK_KIND_ORDER,
  linkKindForHandlePair,
  missingModuleSetupFields,
  moduleFocusToken,
  moduleFunctionLabel,
  moduleRequiresMath,
  MODULE_CONFIG_SCHEMAS,
  moduleLinkPorts,
  moduleStreamPorts,
  isMathDockStreamPort,
  parseStreamHandle,
  parseTrendCandidateHandle,
  ModuleType,
  MAX_MODULES_PER_COMPANY,
  projectedModuleSlotsForCreate,
  splitCompactModuleName,
  requiredModuleSetupFields,
  UpdateModuleInput,
  allowedLinkKinds,
  humanizeResearchSourceKind,
  LiveApiModuleConfig,
  LibraryModuleConfig,
  isEngineDataHubConfig,
  resolveLiveApiSourceKind,
  resolveLiveApiQuery,
  TradingSubtype,
} from './modules';
import {
  CLOCK_IN_MODULE_TYPES,
  isLegalStreamPortPair,
  MODULE_PORT_CHANNELS,
  moduleHasClockIn,
  resolveExposedChannels,
} from './port-channels';
import { ValueRefHandle, CalcRequest } from './numeric';
import { ActionInstruction, TraceTimelineResponse } from './pipeline';
import {
  DEFAULT_PHILOSOPHY_PROFILE,
  normalizePhilosophyProfile,
  philosophyProfileToLeverState,
  PhilosophyProfile,
  RISK_APPETITE_SIZING_BPS,
} from './philosophy';
import { ControlSnapshot } from './control-snapshot';
import { GuardrailEvaluation } from './guardrails';
import { LimitsSnapshot, LiveGateEvidence } from './limits';
import {
  computeEngineBoundsFromPositions,
  defaultEngineCapitalEnvelope,
  defaultMemberSetupDrafts,
  DeleteEngineMode,
  ENGINE_GROUP_PADDING,
  InsertEngineInput,
  isMathToolAttachment,
  mathCanAttachTo,
  findParentExecutionForResearchPack,
  resolveResearchLibraryBindingForInsert,
  splitAllocationValues,
  UpdateEngineInstanceInput,
  withDefaultEngineSetup,
  resolveEngineSetupFromCompany,
} from './engines';
import { ResearchLibraryBinding } from './research-library-binding';
import {
  COMPANY_TEMPLATES,
  DEFAULT_EXECUTION_SIM_COUNT,
  ENGINE_TEMPLATES,
  expandEngineSeedsWithResearchDeps,
  expandEngineSeedsWithSimDeps,
  researchDependenciesForExecutionEngine,
  simDependenciesForExecutionEngine,
  templateInputTargets,
} from './templates';
import {
  CANVAS_LAYOUT,
  LAYOUT_COLUMN_STEP,
  LAYOUT_ROW_STEP,
  engineCanvasOffsetForOrigin,
  layoutCanvas,
  buildCanvasEngineFamilies,
  layoutEngineGroup,
  layoutEngineTemplateAtOrigin,
  placeEngineTimeHubPosition,
  placeDataHubOrigin,
  placeNextEngineOrigin,
  rankEngineMembers,
  reflowEngineAtOrigin,
  rectsOverlap,
  translateLayoutResultToOrigin,
} from './canvas-layout';
import {
  mimicParentEngineSetup,
  mimicParentModuleConfigs,
  shouldApplyMimicParent,
} from './simulation-mimic';

describe('env manifest', () => {
  it('matches .env.example exactly', () => {
    const example = readFileSync(join(__dirname, '../../../.env.example'), 'utf8');
    const exampleVars = new Set(
      example
        .split('\n')
        .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l))
        .map((l) => l.split('=')[0]!),
    );
    const manifestVars = new Set(ENVIRONMENT_REQUIREMENTS.map((r) => r.name));
    expect([...manifestVars].sort()).toEqual([...exampleVars].sort());
  });
});

describe('HandoffEnvelope', () => {
  it('round-trips a valid envelope', () => {
    const envelope = {
      contractVersion: '1.0.0',
      producerRunId: null,
      companyId: '00000000-0000-4000-8000-000000000001',
      moduleId: null,
      authorityClass: 'DETERMINISTIC',
      mutationClass: 'IMMUTABLE',
      queueClass: 'DISPATCH',
      priorityBand: 'CRITICAL',
      timeoutClass: 'SHORT',
      idempotencyKey: 'abcdefgh',
      replayHash: null,
      controlSnapshotRef: null,
      causationRefs: [],
      expiresAt: null,
    };
    expect(HandoffEnvelope.parse(envelope)).toMatchObject(envelope);
  });
});

describe('link rules', () => {
  it('allows library → trend data_feed and rejects reverse directive', () => {
    expect(allowedLinkKinds('library', 'trend')).toContain('data_feed');
    expect(allowedLinkKinds('trend', 'library')).toHaveLength(0);
  });

  it('has a config schema for every module type', () => {
    for (const type of ModuleType.options) {
      expect(MODULE_CONFIG_SCHEMAS[type]).toBeDefined();
    }
  });
});

describe('canvas link port helpers', () => {
  it('exposes canonical link kind display order', () => {
    expect(LINK_KIND_ORDER).toEqual(['data_feed', 'directive', 'verification', 'fund_route']);
  });

  it('derives trading inbound/outbound ports from LINK_RULES in canonical order', () => {
    expect(moduleLinkPorts('trading')).toEqual({
      inbound: ['data_feed', 'directive'],
      outbound: ['data_feed', 'directive', 'verification'],
    });
  });

  it('keeps fund_route ports only on Math and fund modules', () => {
    expect(moduleLinkPorts('math')).toEqual({
      inbound: ['data_feed', 'fund_route'],
      outbound: ['data_feed', 'fund_route'],
    });
    expect(moduleLinkPorts('holding_fund').outbound).toContain('fund_route');
    expect(moduleLinkPorts('holding_fund').inbound).toContain('fund_route');
    expect(moduleLinkPorts('fund_router').inbound).toContain('fund_route');
    expect(moduleLinkPorts('fund_router').outbound).toContain('fund_route');
    expect(moduleLinkPorts('trading').inbound).not.toContain('fund_route');
    expect(moduleLinkPorts('trading').outbound).not.toContain('fund_route');
    expect(moduleLinkPorts('research').inbound).not.toContain('fund_route');
  });

  it('requires fund routes to traverse Math', () => {
    expect(isLegalFundRoute('holding_fund', 'math')).toBe(true);
    expect(isLegalFundRoute('math', 'fund_router')).toBe(true);
    expect(isLegalFundRoute('fund_router', 'math')).toBe(true);
    expect(isLegalFundRoute('holding_fund', 'fund_router')).toBe(false);
    expect(isLegalFundRoute('fund_router', 'trading')).toBe(false);
    expect(isLegalFundRoute('math', 'trading')).toBe(false);
    expect(allowedLinkKinds('math', 'trading')).toEqual(['data_feed']);
  });

  it('derives trend ports with only kinds the type participates in', () => {
    expect(moduleLinkPorts('trend')).toEqual({
      inbound: ['data_feed', 'verification'],
      outbound: ['data_feed', 'directive', 'verification'],
    });
  });

  it('exposes reciprocal data ports for generator dedicated Math ownership', () => {
    expect(moduleLinkPorts('generator')).toEqual({
      inbound: ['data_feed'],
      outbound: ['data_feed'],
    });
  });

  it('builds stable handle ids from kind and direction', () => {
    expect(handleIdForLink('directive', 'out')).toBe('directive-out');
    expect(handleIdForLink('fund_route', 'in')).toBe('fund_route-in');
  });

  it('accepts matching new handle pairs and rejects mixed kinds', () => {
    expect(
      linkKindForHandlePair(
        handleIdForLink('directive', 'out'),
        handleIdForLink('directive', 'in'),
      ),
    ).toBe('directive');
    expect(
      linkKindForHandlePair(
        handleIdForLink('data_feed', 'out'),
        handleIdForLink('data_feed', 'in'),
      ),
    ).toBe('data_feed');
    expect(
      linkKindForHandlePair(
        handleIdForLink('directive', 'out'),
        handleIdForLink('data_feed', 'in'),
      ),
    ).toBeNull();
    expect(
      linkKindForHandlePair(
        handleIdForLink('directive', 'in'),
        handleIdForLink('directive', 'out'),
      ),
    ).toBeNull();
  });

  it('maps legacy handle pairs during migration', () => {
    expect(linkKindForHandlePair('data-out', 'data-in')).toBe('data_feed');
    expect(linkKindForHandlePair('data-out', 'control-in')).toBe('directive');
    expect(linkKindForHandlePair('tools-out', 'data-in')).toBe('verification');
    expect(linkKindForHandlePair('tools-out', 'control-in')).toBeNull();
  });

  it('returns null for missing or unknown handles', () => {
    expect(linkKindForHandlePair(null, 'data-in')).toBeNull();
    expect(linkKindForHandlePair('data-out', undefined)).toBeNull();
    expect(linkKindForHandlePair('unknown-out', 'data-in')).toBeNull();
  });

  it('builds bus vs stream handle ids', () => {
    expect(handleIdForStream('data_feed', 'in')).toBe('data_feed-in');
    expect(handleIdForStream('data_feed', 'out')).toBe('data_feed-out');
    const peer = '00000000-0000-4000-8000-000000000001';
    expect(handleIdForStream('directive', 'out', peer)).toBe(`directive-out__${peer}`);
    expect(handleIdForStream('verification', 'in', peer)).toBe(`verification-in__${peer}`);
  });

  it('round-trips stream handles via parseStreamHandle', () => {
    const peer = '00000000-0000-4000-8000-000000000002';
    const busOut = handleIdForStream('fund_route', 'out');
    expect(parseStreamHandle(busOut)).toEqual({
      kind: 'fund_route',
      direction: 'out',
      peerModuleId: null,
    });
    const streamIn = handleIdForStream('data_feed', 'in', peer);
    expect(parseStreamHandle(streamIn)).toEqual({
      kind: 'data_feed',
      direction: 'in',
      peerModuleId: peer,
    });
    expect(parseStreamHandle('not-a-handle')).toBeNull();
  });

  it('builds and parses D-077 trend-candidate directive handles', () => {
    const candidateId = '00000000-0000-4000-8000-0000000000c1';
    const handle = handleIdForTrendCandidate(candidateId);
    expect(handle).toBe(`directive-out__trend:${candidateId}`);
    expect(parseTrendCandidateHandle(handle)).toBe(candidateId);
    expect(
      parseTrendCandidateHandle(handleIdForStream('directive', 'out', candidateId)),
    ).toBeNull();
    expect(parseTrendCandidateHandle('directive-out')).toBeNull();
    expect(linkKindForHandlePair(handle, handleIdForStream('directive', 'in'))).toBe('directive');
  });

  it('emits bus then per-peer stream ports for trading inbound data_feed', () => {
    const tradingId = '00000000-0000-4000-8000-0000000000t1';
    const liveApiId = '00000000-0000-4000-8000-0000000000l1';
    const mathId = '00000000-0000-4000-8000-0000000000m1';
    const researchId = '00000000-0000-4000-8000-0000000000r1';
    const ports = moduleStreamPorts({
      type: 'trading',
      moduleId: tradingId,
      links: [
        {
          fromModuleId: liveApiId,
          toModuleId: tradingId,
          linkKind: 'data_feed',
          fromLabel: 'LiveAPI',
          toLabel: 'Trade',
          fromType: 'live_api',
          toType: 'trading',
        },
        {
          fromModuleId: mathId,
          toModuleId: tradingId,
          linkKind: 'data_feed',
          fromLabel: 'Math',
          toLabel: 'Trade',
          fromType: 'math',
          toType: 'trading',
        },
        {
          fromModuleId: researchId,
          toModuleId: tradingId,
          linkKind: 'data_feed',
          fromLabel: 'Research',
          toLabel: 'Trade',
          fromType: 'research',
          toType: 'trading',
        },
      ],
    });
    const dataInbound = ports.inbound.filter(
      (port) => port.kind === 'data_feed' && port.slot !== 'clock_in',
    );
    expect(dataInbound).toHaveLength(4);
    expect(dataInbound[0]).toMatchObject({
      role: 'bus',
      peerModuleId: null,
      handleId: 'data_feed-in',
    });
    // Pipeline lane order: research (0) → math/live_api (1, math row before live_api).
    expect(dataInbound.slice(1).map((port) => port.peerModuleId)).toEqual([
      researchId,
      mathId,
      liveApiId,
    ]);
    expect(dataInbound.slice(1).every((port) => port.role === 'stream')).toBe(true);
  });

  it('orders Math fund_route peers holding_fund → fund_router (capital flow)', () => {
    const mathId = '00000000-0000-4000-8000-0000000000m1';
    const fundId = '00000000-0000-4000-8000-0000000000f1';
    const routerId = '00000000-0000-4000-8000-0000000000r1';
    const ports = moduleStreamPorts({
      type: 'math',
      moduleId: mathId,
      links: [
        {
          fromModuleId: mathId,
          toModuleId: routerId,
          linkKind: 'fund_route',
          fromLabel: 'Math',
          toLabel: 'Router',
          fromType: 'math',
          toType: 'fund_router',
        },
        {
          fromModuleId: fundId,
          toModuleId: mathId,
          linkKind: 'fund_route',
          fromLabel: 'Fund',
          toLabel: 'Math',
          fromType: 'holding_fund',
          toType: 'math',
        },
      ],
    });
    const fundIn = ports.inbound.filter((p) => p.kind === 'fund_route' && p.role === 'stream');
    const fundOut = ports.outbound.filter((p) => p.kind === 'fund_route' && p.role === 'stream');
    expect(fundIn.map((p) => p.peerModuleId)).toEqual([fundId]);
    expect(fundOut.map((p) => p.peerModuleId)).toEqual([routerId]);
  });

  it('collapses owner↔Math data_feed to one Calc-ref dock port (D-088)', () => {
    const tradingId = '00000000-0000-4000-8000-0000000000t1';
    const mathId = '00000000-0000-4000-8000-0000000000m1';
    const trendId = '00000000-0000-4000-8000-0000000000r2';
    const ports = moduleStreamPorts({
      type: 'trading',
      moduleId: tradingId,
      links: [
        {
          fromModuleId: tradingId,
          toModuleId: mathId,
          linkKind: 'data_feed',
          fromLabel: 'Trade',
          toLabel: 'Math',
          fromType: 'trading',
          toType: 'math',
        },
        {
          fromModuleId: mathId,
          toModuleId: tradingId,
          linkKind: 'data_feed',
          fromLabel: 'Math',
          toLabel: 'Trade',
          fromType: 'math',
          toType: 'trading',
        },
        {
          fromModuleId: trendId,
          toModuleId: tradingId,
          linkKind: 'data_feed',
          fromLabel: 'Trend',
          toLabel: 'Trade',
          fromType: 'trend',
          toType: 'trading',
        },
      ],
    });
    const mathOut = ports.outbound.find((p) => p.peerModuleId === mathId);
    const mathIn = ports.inbound.find((p) => p.peerModuleId === mathId);
    const trendIn = ports.inbound.find((p) => p.peerModuleId === trendId);
    expect(mathOut).toBeUndefined();
    expect(mathIn?.peerType).toBe('math');
    expect(isMathDockStreamPort(mathIn!)).toBe(true);
    expect(isMathDockStreamPort(trendIn!)).toBe(false);
  });

  it('exposes clock and time link ports and parses configs (D-088)', () => {
    expect(allowedLinkKinds('clock', 'time')).toEqual(['data_feed']);
    expect(allowedLinkKinds('clock', 'math')).toEqual(['data_feed']);
    expect(allowedLinkKinds('clock', 'trading')).toEqual([]);
    expect(allowedLinkKinds('time', 'trading')).toEqual(['data_feed']);
    expect(allowedLinkKinds('clock', 'research')).toEqual([]);
    expect(MODULE_CONFIG_SCHEMAS.clock.parse({})).toMatchObject({
      timezone: 'America/New_York',
      displayMode: 'session',
    });
    expect(MODULE_CONFIG_SCHEMAS.time.parse({ transform: 'elapsed' })).toMatchObject({
      transform: 'elapsed',
    });
    expect(moduleLinkPorts('clock').outbound).toContain('data_feed');
    expect(moduleLinkPorts('time').outbound).toContain('data_feed');
  });

  it('adds additive clock_in without reducing data/system rails (D-108)', () => {
    const tradingId = '00000000-0000-4000-8000-0000000000t1';
    const liveApiId = '00000000-0000-4000-8000-0000000000l1';
    const ports = moduleStreamPorts({
      type: 'trading',
      moduleId: tradingId,
      links: [
        {
          fromModuleId: liveApiId,
          toModuleId: tradingId,
          linkKind: 'data_feed',
          fromLabel: 'Live',
          toLabel: 'Trade',
          fromType: 'live_api',
          toType: 'trading',
        },
      ],
    });
    const dataIn = ports.inbound.filter((p) => p.kind === 'data_feed' && p.slot !== 'clock_in');
    const clockIn = ports.inbound.filter((p) => p.slot === 'clock_in');
    expect(dataIn.length).toBeGreaterThanOrEqual(2);
    expect(clockIn.some((p) => p.role === 'bus')).toBe(true);
    expect(ports.inbound.some((p) => p.kind === 'directive')).toBe(true);
  });

  it('splits Time hub into Schedule (top) + Time bus (right) (D-108)', () => {
    const timeId = '00000000-0000-4000-8000-0000000000tm';
    const ports = moduleStreamPorts({ type: 'time', moduleId: timeId, links: [] });
    const schedule = ports.outbound.find((p) => p.slot === 'schedule_out');
    const bus = ports.outbound.find((p) => p.slot === 'time_bus_out');
    expect(schedule).toMatchObject({ edge: 'top', nature: 'time', label: 'Schedule' });
    expect(bus).toMatchObject({ edge: 'right', nature: 'time', label: 'Time bus' });
    expect(ports.inbound.every((p) => p.nature === 'time' && p.edge === 'left')).toBe(true);
  });

  it('covers every ModuleType in MODULE_PORT_CHANNELS and clock_in set (D-108)', () => {
    for (const type of ModuleType.options) {
      expect(MODULE_PORT_CHANNELS[type]?.length).toBeGreaterThan(0);
    }
    expect(moduleHasClockIn('trading')).toBe(true);
    expect(moduleHasClockIn('library')).toBe(true);
    expect(moduleHasClockIn('display')).toBe(true);
    expect(moduleHasClockIn('math')).toBe(false);
    expect(CLOCK_IN_MODULE_TYPES.has('math')).toBe(false);

    const schedule = handleIdForStream('data_feed', 'out', 'slot:schedule_out');
    const clockIn = handleIdForStream('data_feed', 'in', 'slot:clock_in');
    const dataOut = handleIdForStream('data_feed', 'out');
    const dataIn = handleIdForStream('data_feed', 'in');
    expect(
      isLegalStreamPortPair({
        fromType: 'time',
        toType: 'trading',
        sourceHandle: schedule,
        targetHandle: clockIn,
        linkKind: 'data_feed',
      }),
    ).toBe(true);
    expect(
      isLegalStreamPortPair({
        fromType: 'time',
        toType: 'trading',
        sourceHandle: schedule,
        targetHandle: dataIn,
        linkKind: 'data_feed',
      }),
    ).toBe(false);
    expect(
      isLegalStreamPortPair({
        fromType: 'research',
        toType: 'trading',
        sourceHandle: dataOut,
        targetHandle: clockIn,
        linkKind: 'data_feed',
      }),
    ).toBe(false);

    expect(resolveExposedChannels('analyzer', undefined).has('analyzer_concat')).toBe(true);
    expect(resolveExposedChannels('analyzer', []).has('analyzer_concat')).toBe(false);
    expect(resolveExposedChannels('analyzer', []).has('analyzer_clock')).toBe(true);

    const withConcat = moduleStreamPorts({
      type: 'analyzer',
      moduleId: '00000000-0000-4000-8000-0000000000a1',
      links: [],
    });
    expect(withConcat.outbound.some((p) => p.channelId === 'analyzer_concat')).toBe(true);
    const hidden = moduleStreamPorts({
      type: 'analyzer',
      moduleId: '00000000-0000-4000-8000-0000000000a1',
      links: [],
      exposedOutputChannels: [],
    });
    expect(hidden.outbound.some((p) => p.channelId === 'analyzer_concat')).toBe(false);
  });

  it('exposes analyzer emit modes and engine utility buses (D-091)', async () => {
    const {
      EngineUtilityBus,
      engineUtilityBusesForCategory,
      parseEngineUtilityHandle,
      engineUtilitySourceHandleId,
      engineUtilityTargetHandleId,
      engineCategoryExposesFunds,
    } = await import('./engines');
    const { AnalyzerModuleConfig, deriveLibraryDisplayName } = await import('./modules');
    expect(AnalyzerModuleConfig.parse({}).emitMode).toBe('verify_loopback');
    expect(AnalyzerModuleConfig.parse({ emitMode: 'to_desk_stream' }).emitMode).toBe(
      'to_desk_stream',
    );
    expect(allowedLinkKinds('library', 'analyzer')).toEqual(['data_feed']);
    expect(allowedLinkKinds('analyzer', 'library')).toEqual(['data_feed']);
    expect(engineUtilityBusesForCategory('research')).toContain('data_out');
    expect(engineUtilityBusesForCategory('day_trading')).toContain('funds');
    expect(engineCategoryExposesFunds('day_trading')).toBe(true);
    expect(engineCategoryExposesFunds('research')).toBe(false);
    expect(EngineUtilityBus.options).toContain('clock');
    expect(parseEngineUtilityHandle(engineUtilityTargetHandleId('data_in'))).toEqual({
      bus: 'data_in',
      direction: 'in',
    });
    expect(parseEngineUtilityHandle(engineUtilitySourceHandleId('data_out'))).toEqual({
      bus: 'data_out',
      direction: 'out',
    });
    expect(
      deriveLibraryDisplayName({
        topicSectors: ['Semiconductors'],
        sourceLabels: ['Alpaca', 'Research'],
      }),
    ).toBe('Semiconductors · Alpaca + Research');
  });

  it('orders engine template Math fund_route links into-Math then out-of-Math', () => {
    for (const engine of ENGINE_TEMPLATES) {
      const mathFund = engine.links.filter(
        (link) =>
          link.linkKind === 'fund_route' && (link.fromIndex === 'math' || link.toIndex === 'math'),
      );
      if (mathFund.length === 0) continue;
      const firstMathIdx = engine.links.findIndex(
        (link) =>
          link.linkKind === 'fund_route' && (link.fromIndex === 'math' || link.toIndex === 'math'),
      );
      const trailing = engine.links.slice(firstMathIdx);
      expect(trailing.every((link) => mathFund.includes(link))).toBe(true);
      const into = trailing.filter((link) => link.toIndex === 'math');
      const outOf = trailing.filter((link) => link.fromIndex === 'math');
      const intoEnd = trailing.findIndex((link) => link.fromIndex === 'math');
      if (into.length > 0 && outOf.length > 0) {
        expect(intoEnd).toBe(into.length);
      }
    }
  });

  it('resolves link kind for bus↔stream and stream↔stream handle pairs', () => {
    const peerA = '00000000-0000-4000-8000-0000000000a1';
    const peerB = '00000000-0000-4000-8000-0000000000b1';
    expect(
      linkKindForHandlePair(
        handleIdForStream('data_feed', 'out'),
        handleIdForStream('data_feed', 'in', peerA),
      ),
    ).toBe('data_feed');
    expect(
      linkKindForHandlePair(
        handleIdForStream('directive', 'out', peerA),
        handleIdForStream('directive', 'in'),
      ),
    ).toBe('directive');
    expect(
      linkKindForHandlePair(
        handleIdForStream('verification', 'out', peerA),
        handleIdForStream('verification', 'in', peerB),
      ),
    ).toBe('verification');
    expect(
      linkKindForHandlePair(
        handleIdForStream('data_feed', 'out', peerA),
        handleIdForStream('directive', 'in', peerB),
      ),
    ).toBeNull();
  });
});

describe('generated module names', () => {
  it('keeps math names primary-only without neighbor refs', () => {
    expect(
      deriveGeneratedModuleName({
        type: 'math',
        baseName: 'Math',
        topicSectors: [],
        inboundLabels: ['Fund'],
        outboundLabels: ['Router'],
      }),
    ).toBe('Math · —');
  });

  it('returns Fn · Focus when disconnected', () => {
    expect(
      deriveGeneratedModuleName({
        type: 'trading',
        config: { subtype: 'day' },
        topicSectors: ['SPY'],
        inboundLabels: [],
        outboundLabels: ['', '  '],
      }),
    ).toBe('DayTrade · SPY');
  });

  it('uses short neighbor Fn labels and caps overflow', () => {
    expect(
      deriveGeneratedModuleName({
        type: 'trading',
        config: { subtype: 'day' },
        topicSectors: ['semis'],
        inboundLabels: ['Fund', 'Trend', 'Trend', 'LiveAPI'],
        outboundLabels: ['Policy', 'Analyze', 'Sim'],
      }),
    ).toBe('DayTrade · semis ← Fund · LiveAPI · +1 → Analyze · Policy · +1');
  });

  it('prefers dropping refs over slicing primary when over max length', () => {
    const longFocus = 'ABCDEFGHIJKLMNOP'; // 16 chars — within focus cap
    const derived = deriveGeneratedModuleName({
      type: 'trading',
      config: { subtype: 'day' },
      topicSectors: [longFocus],
      inboundLabels: ['UpstreamA', 'UpstreamB', 'UpstreamC', 'UpstreamD', 'UpstreamE'],
      outboundLabels: ['DownA', 'DownB', 'DownC'],
    });
    expect(derived.length).toBeLessThanOrEqual(80);
    expect(derived.startsWith('DayTrade · ')).toBe(true);
  });

  it('is deterministic for the same neighbor inputs', () => {
    const input = {
      type: 'trend' as const,
      topicSectors: ['equities'],
      inboundLabels: ['Research', 'LiveAPI'],
      outboundLabels: ['DayTrade'],
    };
    expect(deriveGeneratedModuleName(input)).toBe(deriveGeneratedModuleName(input));
    expect(deriveGeneratedModuleName(input)).toBe(
      'Trend · equities ← LiveAPI · Research → DayTrade',
    );
  });

  it('moduleFunctionLabel maps trading subtypes', () => {
    expect(moduleFunctionLabel('trading', { subtype: 'day' })).toBe('DayTrade');
    expect(moduleFunctionLabel('trading', { subtype: 'long_term' })).toBe('Swing');
    expect(moduleFunctionLabel('math')).toBe('Math');
  });

  it('moduleFunctionLabel maps research / library / analyzer specialties', () => {
    expect(moduleFunctionLabel('research', { researchSubtype: 'external_filings' })).toBe(
      'Filings',
    );
    expect(moduleFunctionLabel('research', { researchSubtype: 'event_catalyst' })).toBe('Catalyst');
    expect(moduleFunctionLabel('library', { libraryClass: 'topic_runtime' })).toBe('TopicLib');
    expect(moduleFunctionLabel('library', { libraryClass: 'specialty_evidence' })).toBe('SpecLib');
    expect(moduleFunctionLabel('analyzer', { emitMode: 'to_desk_stream' })).toBe('Concat');
    expect(moduleFunctionLabel('analyzer', { emitMode: 'verify_loopback' })).toBe('ExecMon');
    expect(moduleFunctionLabel('time', { transform: 'elapsed' })).toBe('Elapsed');
    expect(moduleFunctionLabel('time', { transform: 'session_window' })).toBe('Session');
  });

  it('LiveApiModuleConfig accepts optional sourceKind and legacy venue-only configs', () => {
    expect(
      LiveApiModuleConfig.parse({
        venue: 'alpaca',
        instruments: ['SPY'],
      }),
    ).toMatchObject({
      venue: 'alpaca',
      instruments: ['SPY'],
      queryPolicy: 'static_only',
      schedulePolicy: 'module_poll',
      outputWidgetKinds: ['generic'],
    });

    expect(
      LiveApiModuleConfig.parse({
        sourceKind: 'alpaca_bars',
        venue: 'alpaca',
        instruments: ['SPY'],
        queryPolicy: 'upstream_then_static',
        staticQuery: 'earnings',
        outputWidgetKinds: ['headline', 'series'],
      }),
    ).toMatchObject({ sourceKind: 'alpaca_bars', venue: 'alpaca' });
  });

  it('resolveLiveApiQuery honors queryPolicy (D-184)', () => {
    expect(
      resolveLiveApiQuery(
        { queryPolicy: 'static_only', staticQuery: 'desk' },
        'upstream',
      ),
    ).toBe('desk');
    expect(
      resolveLiveApiQuery(
        { queryPolicy: 'upstream_or_null', staticQuery: 'desk' },
        null,
      ),
    ).toBeNull();
    expect(
      resolveLiveApiQuery(
        { queryPolicy: 'upstream_then_static', staticQuery: 'desk' },
        'up',
      ),
    ).toBe('up');
  });

  it('moduleFunctionLabel prefers hydrator sourceKind over venue for live_api', () => {
    expect(
      moduleFunctionLabel('live_api', {
        sourceKind: 'alpaca_bars',
        venue: 'kalshi',
        instruments: ['SPY'],
      }),
    ).toBe('AlpacaBars');
    expect(moduleFunctionLabel('live_api', { venue: 'alpaca', instruments: ['SPY'] })).toBe(
      'AlpacaFeed',
    );
    expect(humanizeResearchSourceKind('frankfurter_fx')).toBe('FrankfurterFx');
    expect(resolveLiveApiSourceKind({ venue: 'alpaca', instruments: ['SPY'] })).toBe('alpaca_bars');
    expect(
      resolveLiveApiSourceKind({
        sourceKind: 'twelve_data',
        venue: 'alpaca',
        instruments: ['SPY'],
      }),
    ).toBe('twelve_data');
  });

  it('moduleFocusToken prefers topic then capital display', () => {
    expect(moduleFocusToken({ topicSectors: ['  SPY  '] })).toBe('SPY');
    expect(moduleFocusToken({ topicSectors: [], capitalAllocationDisplay: '25%' })).toBe('25%');
    expect(moduleFocusToken({ topicSectors: [] })).toBe('—');
  });

  it('splitCompactModuleName separates primary and refs', () => {
    expect(splitCompactModuleName('DayTrade · SPY ← Trend → Policy')).toEqual({
      primary: 'DayTrade · SPY',
      connectionRefs: '← Trend → Policy',
    });
    expect(splitCompactModuleName('Research · —')).toEqual({
      primary: 'Research · —',
      connectionRefs: null,
    });
    expect(splitCompactModuleName('MktNews · —')).toEqual({
      primary: 'MktNews · —',
      connectionRefs: null,
    });
  });
});

describe('module payload schemas', () => {
  it('accepts optional generatedNameBase on create', () => {
    expect(
      CreateModuleInput.safeParse({
        type: 'trading',
        name: 'Paper Day-Trade Execution',
        generatedNameBase: 'Paper Day-Trade Execution',
        config: { subtype: 'day' },
      }).success,
    ).toBe(true);
    expect(
      CreateModuleInput.safeParse({
        type: 'trading',
        name: 'Paper Day-Trade Execution',
        generatedNameBase: '',
        config: { subtype: 'day' },
      }).success,
    ).toBe(false);
  });

  it('accepts optional restoreGeneratedName on update', () => {
    expect(UpdateModuleInput.safeParse({ restoreGeneratedName: true }).success).toBe(true);
    expect(UpdateModuleInput.safeParse({ name: 'Custom Label' }).success).toBe(true);
  });
});

describe('module inline setup', () => {
  it('requires capital and exit only for capital-bearing nodes', () => {
    expect(requiredModuleSetupFields('trading')).toEqual([
      'capital_allocation',
      'target_exit',
      'topic_sector',
    ]);
    expect(requiredModuleSetupFields('holding_fund')).toEqual([
      'capital_allocation',
      'target_exit',
    ]);
    expect(requiredModuleSetupFields('math')).toEqual([]);
  });

  it('splits engine capital envelopes equally across members', () => {
    expect(splitAllocationValues('amount', '100.00', 3)).toEqual(['33.34', '33.33', '33.33']);
    expect(defaultEngineCapitalEnvelope(1_000_000)).toEqual({
      mode: 'amount',
      value: '10000.00',
    });
    const drafts = defaultMemberSetupDrafts(
      ['research', 'trading', 'holding_fund', 'fund_router'],
      1_000_000,
      Date.parse('2026-07-17T12:00:00.000Z'),
    );
    expect(drafts[0]?.allocationValue).toBe('');
    expect(drafts[1]?.allocationValue).toBe('3333.34');
    expect(drafts[2]?.allocationValue).toBe('3333.33');
    expect(drafts[3]?.allocationValue).toBe('3333.33');
    expect(drafts[1]?.targetExitLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const skipped = withDefaultEngineSetup(
      undefined,
      1_000_000,
      Date.parse('2026-07-17T12:00:00.000Z'),
    );
    expect(skipped.capitalAllocation).toEqual({ mode: 'amount', value: '10000.00' });
    expect(skipped.targetExitAt).toBe('2026-07-24T12:00:00.000Z');
  });

  it('cascades company sector/seed into engine setup by default (D-176)', () => {
    const cascaded = resolveEngineSetupFromCompany(
      undefined,
      { sectorFocuses: ['technology', 'semiconductors'], seedCreditsCents: 250_000 },
      true,
      Date.parse('2026-07-17T12:00:00.000Z'),
    );
    expect(cascaded.topicSectors).toEqual(['technology', 'semiconductors']);
    expect(cascaded.capitalAllocation).toEqual({ mode: 'amount', value: '2500.00' });

    const operatorWins = resolveEngineSetupFromCompany(
      {
        topicSectors: ['energy'],
        capitalAllocation: { mode: 'percentage', value: '50' },
      },
      { sectorFocuses: ['technology'], seedCreditsCents: 250_000 },
      true,
    );
    expect(operatorWins.topicSectors).toEqual(['energy']);
    expect(operatorWins.capitalAllocation).toEqual({ mode: 'percentage', value: '50' });

    const off = resolveEngineSetupFromCompany(
      undefined,
      { sectorFocuses: ['technology'], seedCreditsCents: 250_000 },
      false,
      Date.parse('2026-07-17T12:00:00.000Z'),
    );
    expect(off.topicSectors).toBeUndefined();
    expect(off.capitalAllocation).toEqual({ mode: 'percentage', value: '100' });
  });

  it('reserves option-anchor column in engine right padding (D-176 / D-217)', () => {
    expect(ENGINE_GROUP_PADDING.right).toBeGreaterThanOrEqual(
      CANVAS_LAYOUT.optionAnchorColumnWidth,
    );
    expect(CANVAS_LAYOUT.horizontalGutter).toBeGreaterThanOrEqual(
      CANVAS_LAYOUT.decisionOwnerGap + CANVAS_LAYOUT.decisionNodeWidth,
    );
    expect(CANVAS_LAYOUT.researchToExecGap).toBe(380);
    expect(CANVAS_LAYOUT.topLevelGutter).toBe(176);
  });

  it('inflates template layout bounds for decision column (D-218)', () => {
    const day = ENGINE_TEMPLATES.find((engine) => engine.id === 'engine_day_trading')!;
    const laid = layoutEngineTemplateAtOrigin(
      day.modules,
      day.links,
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
      { templateId: day.id },
    );
    const without = layoutEngineTemplateAtOrigin(
      day.modules,
      day.links,
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
    );
    expect(laid.canvasBounds.height).toBeGreaterThanOrEqual(without.canvasBounds.height);
  });

  it('derives missing setup fields without raw numeric values', () => {
    expect(
      missingModuleSetupFields('trading', {
        topicSectors: [],
        capitalAllocationRef: null,
        targetExitRef: 'nv_exit',
      }),
    ).toEqual(['capital_allocation', 'topic_sector']);
  });

  it('validates fixed and percentage allocation strings', () => {
    expect(CapitalAllocationInput.safeParse({ mode: 'amount', value: '1250.50' }).success).toBe(
      true,
    );
    expect(CapitalAllocationInput.safeParse({ mode: 'percentage', value: '25.125' }).success).toBe(
      true,
    );
    expect(CapitalAllocationInput.safeParse({ mode: 'percentage', value: '100.01' }).success).toBe(
      false,
    );
  });
});

describe('LLM capability registry (D-026)', () => {
  it('defaults execution to groq gpt-oss-20b with strict schema', () => {
    const def = DEFAULT_TIER_MODELS.execution;
    const cap = lookupModelCapability(def.provider, def.modelId);
    expect(cap?.schemaMode).toBe('json_schema_strict');
    expect(cap?.retentionClass).toBe('default_zdr');
  });

  it('blocks Mistral under strict_zdr and admits Cerebras', () => {
    const policy = CompanyLlmPolicy.parse({ privacyMode: 'strict_zdr' });
    const mistral = MODEL_CAPABILITY_REGISTRY.find((m) => m.provider === 'mistral')!;
    const cerebras = lookupModelCapability('cerebras', 'zai-glm-4.7')!;
    expect(admitsRetention(mistral, policy)).toBe(false);
    expect(admitsRetention(cerebras, policy)).toBe(true);
  });

  it('allows Mistral Large as strategic continuity fallback under strict_zdr (D-067)', () => {
    const policy = CompanyLlmPolicy.parse({ privacyMode: 'strict_zdr' });
    const large = lookupModelCapability(
      STRATEGIC_CONTINUITY_FALLBACK.provider,
      STRATEGIC_CONTINUITY_FALLBACK.modelId,
    )!;
    expect(large.tiers).toContain('strategic');
    expect(admitsRetention(large, policy)).toBe(false);
    expect(admitsStrategicContinuityFallback(large, policy)).toBe(true);
  });

  it('admits Anthropic only with ZDR attestation', () => {
    const blocked = CompanyLlmPolicy.parse({
      privacyMode: 'strict_zdr',
      anthropicZdrAttested: false,
    });
    const allowed = CompanyLlmPolicy.parse({
      privacyMode: 'strict_zdr',
      anthropicZdrAttested: true,
    });
    const claude = lookupModelCapability('anthropic', 'claude-sonnet-4-5')!;
    expect(admitsRetention(claude, blocked)).toBe(false);
    expect(admitsRetention(claude, allowed)).toBe(true);
  });

  it('parses research concept batches without numeric fields', () => {
    const batch = ConceptBatch.parse({
      concepts: [{ title: 'Regime thesis', body: 'Qualitative note only', tags: ['regime'] }],
      links: [],
    });
    expect(batch.concepts).toHaveLength(1);
    expect(ResearchDirective.parse({ topicScope: 'equities' }).catalogHints).toEqual([]);
  });

  it('exports leakLint that rejects raw digits', () => {
    expect(leakLint({ note: 'allocate 500 dollars' }, []).ok).toBe(false);
    expect(leakLint({ note: 'allocate via nv_abc' }, []).ok).toBe(true);
  });
});

describe('NRA typing', () => {
  it('rejects raw numbers where ValueRefHandle is required', () => {
    expect(ValueRefHandle.safeParse({ ref: 'nv_abc' }).success).toBe(true);
    expect(ValueRefHandle.safeParse(42).success).toBe(false);
    expect(ValueRefHandle.safeParse({ ref: 'raw_42' }).success).toBe(false);
  });

  it('ActionInstruction quantity must be a ref, never a number', () => {
    const parsed = ActionInstruction.shape.quantityRef.safeParse(100);
    expect(parsed.success).toBe(false);
  });

  it('TraceTimelineResponse carries optional valueRefs for lineage deep links', () => {
    const ok = TraceTimelineResponse.safeParse({
      timeline: [
        {
          stage: 'trace',
          at: '2026-07-17T00:00:00.000Z',
          status: 'filled',
          summary: 'paper fill',
          refId: '00000000-0000-4000-8000-000000000099',
        },
      ],
      valueRefs: {
        quantityRef: 'nv_qty',
        limitPriceRef: null,
        fillTimeoutRef: 'nv_timeout',
      },
    });
    expect(ok.success).toBe(true);
  });

  it('TraceTimelineResponse accepts optional simulatorGapTags (D-188)', () => {
    const ok = TraceTimelineResponse.safeParse({
      timeline: [
        {
          stage: 'trace',
          at: '2026-07-19T00:00:00.000Z',
          status: 'filled',
          summary: 'paper fill',
          refId: '00000000-0000-4000-8000-000000000099',
        },
      ],
      valueRefs: null,
      simulatorGapTags: ['live_market_quote', 'prior_session_mark'],
    });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.simulatorGapTags).toEqual([
      'live_market_quote',
      'prior_session_mark',
    ]);
  });

  it('parses a nested calc expression', () => {
    const req = {
      kind: 'expr',
      expr: {
        op: 'mul',
        args: [
          { op: 'ref', ref: 'nv_a' },
          { op: 'ref', ref: 'nv_b' },
        ],
      },
      outputKind: 'usd_cents',
      outputUnit: 'USD_cents',
    };
    expect(CalcRequest.safeParse(req).success).toBe(true);
  });
});

describe('company templates', () => {
  it('every template module config passes its module-type schema', () => {
    for (const template of Object.values(COMPANY_TEMPLATES)) {
      for (const m of template.modules) {
        const result = MODULE_CONFIG_SCHEMAS[m.type].safeParse(m.config);
        expect(result.success, `${template.id}/${m.name}`).toBe(true);
      }
      for (const l of template.links) {
        const from =
          l.fromIndex === 'math' ? ({ type: 'math' } as const) : template.modules[l.fromIndex];
        const to = l.toIndex === 'math' ? ({ type: 'math' } as const) : template.modules[l.toIndex];
        expect(from, `${template.id} link from`).toBeDefined();
        expect(to, `${template.id} link to`).toBeDefined();
        expect(
          allowedLinkKinds(from!.type, to!.type),
          `${template.id}: ${from!.type}->${to!.type}`,
        ).toContain(l.linkKind);
        if (l.linkKind === 'fund_route') {
          // Seed fund path must traverse shared Math (holding → math → router).
          expect(
            l.fromIndex === 'math' || l.toIndex === 'math',
            `${template.id} fund must involve math`,
          ).toBe(true);
          expect(isLegalFundRoute(from!.type, to!.type)).toBe(true);
        }
      }
    }
  });
});

describe('engine templates', () => {
  it('available engines have valid configs, legal links, and resolvable inputs', () => {
    for (const engine of ENGINE_TEMPLATES) {
      if (!engine.available) {
        expect(engine.unavailableReason, engine.id).toBeTruthy();
        continue;
      }
      expect(engine.modules.length, engine.id).toBeGreaterThan(0);
      for (const m of engine.modules) {
        const result = MODULE_CONFIG_SCHEMAS[m.type].safeParse(m.config);
        expect(result.success, `${engine.id}/${m.name}`).toBe(true);
      }
      for (const l of engine.links) {
        const from =
          l.fromIndex === 'math' ? ({ type: 'math' } as const) : engine.modules[l.fromIndex];
        const to = l.toIndex === 'math' ? ({ type: 'math' } as const) : engine.modules[l.toIndex];
        expect(from, `${engine.id} link from`).toBeDefined();
        expect(to, `${engine.id} link to`).toBeDefined();
        expect(
          allowedLinkKinds(from!.type, to!.type),
          `${engine.id}: ${from!.type}->${to!.type}`,
        ).toContain(l.linkKind);
        // Holding → shared Math → fund_router; trading owner Math is wired at insert.
        if (l.linkKind === 'fund_route') {
          expect(
            l.fromIndex === 'math' || l.toIndex === 'math',
            `${engine.id} fund must involve math`,
          ).toBe(true);
          expect(isLegalFundRoute(from!.type, to!.type)).toBe(true);
        }
      }
      for (const input of engine.inputs) {
        expect(engine.modules[input.target.moduleIndex], `${engine.id}/${input.key}`).toBeDefined();
      }
    }
  });

  it('duplicate ModuleTypes in one template have distinct function labels', () => {
    for (const engine of ENGINE_TEMPLATES) {
      if (engine.modules.length === 0) continue;
      const byType = new Map<string, string[]>();
      for (const m of engine.modules) {
        const parsed = MODULE_CONFIG_SCHEMAS[m.type].parse(m.config);
        const fn = moduleFunctionLabel(m.type, parsed);
        const list = byType.get(m.type) ?? [];
        list.push(fn);
        byType.set(m.type, list);
      }
      for (const [type, labels] of byType) {
        if (labels.length < 2) continue;
        expect(new Set(labels).size, `${engine.id} duplicate ${type}: ${labels.join(',')}`).toBe(
          labels.length,
        );
      }
    }
  });

  function linkEndpointTypes(
    engine: { modules: Array<{ type: string }> },
    link: { fromIndex: number | 'math'; toIndex: number | 'math'; linkKind: string },
  ): { from: string | undefined; to: string | undefined } {
    const from =
      link.fromIndex === 'math'
        ? 'math'
        : typeof link.fromIndex === 'number'
          ? engine.modules[link.fromIndex]?.type
          : undefined;
    const to =
      link.toIndex === 'math'
        ? 'math'
        : typeof link.toIndex === 'number'
          ? engine.modules[link.toIndex]?.type
          : undefined;
    return { from, to };
  }

  it('requires librarian spine when research and library both present (D-109)', () => {
    for (const engine of ENGINE_TEMPLATES) {
      if (engine.modules.length === 0) continue;
      const types = engine.modules.map((m) => m.type);
      if (!types.includes('research') || !types.includes('library')) continue;

      expect(
        types.filter((t) => t === 'librarian').length,
        `${engine.id} missing librarian`,
      ).toBeGreaterThanOrEqual(1);

      const hasResearchToLibrarian = engine.links.some((link) => {
        if (link.linkKind !== 'data_feed') return false;
        const { from, to } = linkEndpointTypes(engine, link);
        return from === 'research' && to === 'librarian';
      });
      const hasLibrarianToLibrary = engine.links.some((link) => {
        if (link.linkKind !== 'data_feed') return false;
        const { from, to } = linkEndpointTypes(engine, link);
        return from === 'librarian' && to === 'library';
      });

      expect(hasResearchToLibrarian, `${engine.id} research→librarian`).toBe(true);
      expect(hasLibrarianToLibrary, `${engine.id} librarian→library`).toBe(true);
    }
  });

  it('wires every non-fund module into at least one link (D-109)', () => {
    const fundTypes = new Set(['holding_fund', 'fund_router', 'math']);
    for (const engine of ENGINE_TEMPLATES) {
      if (engine.modules.length === 0) continue;

      for (let i = 0; i < engine.modules.length; i++) {
        const mod = engine.modules[i]!;
        if (fundTypes.has(mod.type)) continue;

        const linked = engine.links.some((link) => link.fromIndex === i || link.toIndex === i);
        expect(linked, `${engine.id} orphan ${mod.type} idx ${i} (${mod.name})`).toBe(true);
      }
    }
  });

  it('uses context-specific analyzer and fund-router prose names (D-109)', () => {
    const banned = ['Research Concat', 'Deterministic Fund Router'];
    for (const engine of ENGINE_TEMPLATES) {
      for (const m of engine.modules) {
        expect(banned, `${engine.id}/${m.name}`).not.toContain(m.name);
      }
    }
    for (const template of Object.values(COMPANY_TEMPLATES)) {
      for (const m of template.modules) {
        expect(banned, `${template.id}/${m.name}`).not.toContain(m.name);
      }
    }
  });

  it('routes research only through librarian when library is present (D-143)', () => {
    const templates: Array<{
      id: string;
      modules: (typeof ENGINE_TEMPLATES)[number]['modules'];
      links: (typeof ENGINE_TEMPLATES)[number]['links'];
    }> = [...ENGINE_TEMPLATES, ...Object.values(COMPANY_TEMPLATES)];
    for (const template of templates) {
      if (template.modules.length === 0) continue;
      const researchIdx = new Set(
        template.modules.map((m, i) => (m.type === 'research' ? i : -1)).filter((i) => i >= 0),
      );
      const libraryIdx = new Set(
        template.modules.map((m, i) => (m.type === 'library' ? i : -1)).filter((i) => i >= 0),
      );
      if (researchIdx.size === 0 || libraryIdx.size === 0) continue;

      for (const link of template.links) {
        if (link.linkKind !== 'data_feed') continue;
        if (typeof link.fromIndex !== 'number' || typeof link.toIndex !== 'number') continue;
        expect(
          researchIdx.has(link.fromIndex) && libraryIdx.has(link.toIndex),
          `${template.id} research→library bypass ${link.fromIndex}→${link.toIndex}`,
        ).toBe(false);
      }
    }
  });

  it('targets engine_crypto philosophy at trend focus (D-143)', () => {
    const crypto = ENGINE_TEMPLATES.find((e) => e.id === 'engine_crypto');
    expect(crypto).toBeDefined();
    const philosophy = crypto!.inputs.find((i) => i.key === 'philosophy');
    expect(philosophy?.target).toEqual({ moduleIndex: 4, configKey: 'focus' });
    expect(crypto!.modules[4]?.type).toBe('trend');
  });

  it('fans topicScope across research librarian library (D-143)', () => {
    for (const engine of ENGINE_TEMPLATES) {
      if (engine.modules.length === 0) continue;
      const types = engine.modules.map((m) => m.type);
      if (
        !types.includes('research') ||
        !types.includes('library') ||
        !types.includes('librarian')
      ) {
        continue;
      }
      const scopeInput = engine.inputs.find((i) => i.key === 'topicScope');
      expect(scopeInput, `${engine.id} missing topicScope input`).toBeDefined();
      const targets = new Set(templateInputTargets(scopeInput!).map((t) => t.moduleIndex));
      for (let i = 0; i < engine.modules.length; i++) {
        const type = engine.modules[i]!.type;
        if (type === 'research' || type === 'librarian' || type === 'library') {
          expect(targets.has(i), `${engine.id} topicScope misses ${type}@${i}`).toBe(true);
        }
      }
    }
  });

  it('keeps company starters on librarian spines (D-143)', () => {
    for (const template of Object.values(COMPANY_TEMPLATES)) {
      if (template.modules.length === 0) continue;
      const types = template.modules.map((m) => m.type);
      if (!types.includes('research') || !types.includes('library')) continue;
      expect(types.includes('librarian'), `${template.id} missing librarian`).toBe(true);
      const hasResearchToLibrarian = template.links.some((link) => {
        if (link.linkKind !== 'data_feed') return false;
        const { from, to } = linkEndpointTypes(template, link);
        return from === 'research' && to === 'librarian';
      });
      const hasLibrarianToLibrary = template.links.some((link) => {
        if (link.linkKind !== 'data_feed') return false;
        const { from, to } = linkEndpointTypes(template, link);
        return from === 'librarian' && to === 'library';
      });
      expect(hasResearchToLibrarian, `${template.id} research→librarian`).toBe(true);
      expect(hasLibrarianToLibrary, `${template.id} librarian→library`).toBe(true);
    }
  });
});

describe('engine instances (D-028)', () => {
  it('parses insert/update/delete payloads', () => {
    expect(
      InsertEngineInput.parse({
        templateId: 'engine_day_trading',
        inputs: { philosophy: 'momentum' },
        setup: { topicSectors: ['semiconductors'] },
      }),
    ).toMatchObject({ templateId: 'engine_day_trading' });
    expect(
      UpdateEngineInstanceInput.parse({
        masterTopicSectors: ['energy'],
        canvasBounds: { x: 0, y: 0, width: 800, height: 600 },
      }),
    ).toMatchObject({ masterTopicSectors: ['energy'] });
    expect(DeleteEngineMode.parse('cascade')).toBe('cascade');
    expect(DeleteEngineMode.parse('ungroup')).toBe('ungroup');
  });

  it('parses research library binding on insert (D-184 §1)', () => {
    const execId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const libId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect(
      ResearchLibraryBinding.parse({
        mode: 'attach_execution',
        engineInstanceId: execId,
      }),
    ).toMatchObject({ mode: 'attach_execution', engineInstanceId: execId });
    expect(
      InsertEngineInput.parse({
        templateId: 'research_market_regime_lab',
        researchLibraryBinding: { mode: 'connect_library', libraryId: libId },
      }),
    ).toMatchObject({
      researchLibraryBinding: { mode: 'connect_library', libraryId: libId },
    });
    expect(() =>
      ResearchLibraryBinding.parse({ mode: 'connect_library' }),
    ).toThrow();
    expect(ResearchLibraryBinding.parse({ mode: 'create_internal' })).toEqual({
      mode: 'create_internal',
    });
  });

  it('resolves default research binding from execution deps (D-184 §1)', () => {
    const execId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const existing = [{ id: execId, templateId: 'engine_day_trading' }];
    expect(
      findParentExecutionForResearchPack('research_market_regime_lab', existing)?.id,
    ).toBe(execId);
    expect(
      resolveResearchLibraryBindingForInsert({
        researchTemplateId: 'research_market_regime_lab',
        existingEngines: existing,
      }),
    ).toEqual({ mode: 'attach_execution', engineInstanceId: execId });
    expect(
      resolveResearchLibraryBindingForInsert({
        researchTemplateId: 'research_crypto_context',
        existingEngines: [],
      }),
    ).toEqual({ mode: 'create_internal' });
  });

  it('allows Math multi-attach tool links to consumers', () => {
    expect(mathCanAttachTo('trading')).toBe(true);
    expect(mathCanAttachTo('research')).toBe(true);
    expect(mathCanAttachTo('holding_fund')).toBe(false);
    expect(isMathToolAttachment('math', 'trading', 'data_feed')).toBe(true);
    expect(isMathToolAttachment('math', 'fund_router', 'fund_route')).toBe(false);
    expect(allowedLinkKinds('math', 'research')).toContain('data_feed');
    expect(allowedLinkKinds('math', 'analyzer')).toContain('data_feed');
  });

  it('computes padded engine bounds from member positions', () => {
    const bounds = computeEngineBoundsFromPositions([
      { x: 100, y: 200 },
      { x: 400, y: 200 },
    ]);
    expect(bounds.x).toBe(100 - ENGINE_GROUP_PADDING.left);
    expect(bounds.y).toBe(200 - ENGINE_GROUP_PADDING.top);
    expect(bounds.width).toBeGreaterThan(500);
    expect(bounds.height).toBeGreaterThan(200);
  });

  it('accepts engineInstanceId and restoreEngineTopic on module payloads', () => {
    expect(
      CreateModuleInput.parse({
        type: 'research',
        name: 'R',
        config: { topicScope: 'x' },
        engineInstanceId: '00000000-0000-4000-8000-000000000099',
      }).engineInstanceId,
    ).toBe('00000000-0000-4000-8000-000000000099');
    expect(UpdateModuleInput.parse({ restoreEngineTopic: true }).restoreEngineTopic).toBe(true);
  });
});

describe('assistant contracts', () => {
  const messageId = '00000000-0000-4000-8000-000000000001';
  const createdAt = '2026-07-17T12:00:00.000Z';

  it('parses POST input bounds', () => {
    expect(AssistantPostInput.safeParse({ message: 'hi' }).success).toBe(true);
    expect(AssistantPostInput.safeParse({ message: '' }).success).toBe(false);
    expect(AssistantPostInput.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('accepts ok and failed summary cards', () => {
    expect(
      AssistantToolResultSummary.parse({
        tool: 'queue_status',
        summary: 'No pending or active jobs for this company',
        status: 'ok',
      }),
    ).toMatchObject({ status: 'ok' });

    expect(
      AssistantToolResultSummary.parse({
        tool: 'positions',
        summary: 'Lookup failed for positions. Try again or rephrase.',
        status: 'failed',
      }),
    ).toMatchObject({ status: 'failed' });
  });

  it('rejects detailed data fields on persistence parse', () => {
    expect(() =>
      parseAssistantToolResultsForPersistence([
        {
          tool: 'company_summary',
          summary: 'Acme · paper · 3 modules',
          data: { seedCreditsCents: '10000' },
        },
      ]),
    ).toThrow();

    expect(
      AssistantToolResultSummary.safeParse({
        tool: 'trends',
        summary: '2 trend candidates',
        extra: 'unexpected',
      }).success,
    ).toBe(false);
  });

  it('strips legacy detailed data when normalizing from db', () => {
    const normalized = normalizeAssistantToolResultsFromDb([
      {
        tool: 'queue_status',
        summary: '0 pending · 0 active jobs',
        data: { stats: [{ status: 'pending', count: 0 }] },
      },
    ]);
    expect(normalized).toEqual([
      { tool: 'queue_status', summary: '0 pending · 0 active jobs', status: 'ok' },
    ]);
    expect(normalized?.[0]).not.toHaveProperty('data');
  });

  it('round-trips GET and POST responses with summary cards only', () => {
    const card = {
      tool: 'capabilities' as const,
      summary: 'company summary, module status, recent executions',
      status: 'ok' as const,
    };
    const message = {
      id: messageId,
      role: 'assistant' as const,
      content: 'Read-only lookup via queue status: none.',
      toolResults: [card],
      createdAt,
    };
    expect(AssistantMessage.parse(message)).toEqual(message);

    const getResponse = AssistantGetResponse.parse({ messages: [message] });
    expect(getResponse.messages).toHaveLength(1);

    const postResponse = AssistantPostResponse.parse({
      userMessage: { ...message, id: '00000000-0000-4000-8000-000000000002', role: 'user' },
      assistantMessage: message,
    });
    expect(postResponse.assistantMessage.toolResults?.[0]?.tool).toBe('capabilities');
  });

  it('enumerates all read tools including capabilities', () => {
    expect(AssistantReadTool.options).toContain('capabilities');
    expect(AssistantReadTool.options).toContain('queue_status');
  });
});

describe('PhilosophyProfile', () => {
  it('round-trips the default profile and maps to lever band settings', () => {
    const profile = PhilosophyProfile.parse(DEFAULT_PHILOSOPHY_PROFILE);
    expect(profile.version).toBe(1);
    expect(RISK_APPETITE_SIZING_BPS.typical).toBe(75);
    const levers = philosophyProfileToLeverState(profile);
    expect(levers.risk_per_trade_pct_band?.mode).toBe('band');
    expect(normalizePhilosophyProfile(null).axes.risk_appetite).toBe('typical');
  });
});

describe('dynamic safety contracts (D-028)', () => {
  it('round-trips LimitsSnapshot and LiveGateEvidence', () => {
    const limits = {
      schemaVersion: 1 as const,
      companyId: '00000000-0000-4000-8000-000000000003',
      moduleId: null,
      mode: 'paper' as const,
      evaluatedAt: '2026-07-17T12:00:00.000Z',
      sessionPhase: 'open' as const,
      limits: [
        {
          domain: 'buying_power' as const,
          status: 'pass' as const,
          valueInt: '50000',
          unit: 'USD_cents',
          evidence: 'test',
          hardEnvelopeRef: null,
          operatorCapInt: null,
          calcValueInt: '50000',
        },
      ],
      overallPass: true,
    };
    expect(LimitsSnapshot.parse(limits)).toEqual(limits);

    const gate = {
      schemaVersion: 1 as const,
      companyId: '00000000-0000-4000-8000-000000000003',
      mode: 'live' as const,
      catalogVersion: 'testing_baseline_v1_not_live_signoff',
      evaluatedAt: '2026-07-17T12:00:00.000Z',
      checklist: [
        {
          gateId: 'broker_connection_verified' as const,
          required: true,
          pass: false,
          evidence: 'not verified',
          requiredAction: 'connect broker',
        },
      ],
      overallPass: false,
      evidenceAsOfMs: 1_750_000_000_000,
    };
    expect(LiveGateEvidence.parse(gate)).toEqual(gate);

    const guardrail = {
      schemaVersion: 1 as const,
      packageRef: {
        packageId: 'grd-001',
        catalogVersion: 'v1_snapshot_2026_07_16',
        name: 'event_conflict_blackout',
        class: 'catalyst_conflict_guardrail',
      },
      outcome: 'pass' as const,
      firedTriggers: [],
      failureCodes: [],
      evidence: 'no triggers',
      evaluatedAt: '2026-07-17T12:00:00.000Z',
    };
    expect(GuardrailEvaluation.parse(guardrail)).toEqual(guardrail);

    const control = {
      schemaVersion: 1 as const,
      companyId: '00000000-0000-4000-8000-000000000003',
      moduleId: null,
      philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE,
      leverState: philosophyProfileToLeverState(DEFAULT_PHILOSOPHY_PROFILE),
      envelopeVersions: {
        policyEnvelopeVersion: 'paper_balanced_general_v1',
        brokerEnvelopeVersion: 'bpe-001',
        sessionCatalogVersion: 'v1_snapshot_2026_07_16',
        guardrailCatalogVersion: 'v1_snapshot_2026_07_16',
        liveGateBandsVersion: 'testing_baseline_v1_not_live_signoff',
      },
      contentHash: 'abc123',
      capturedAt: '2026-07-17T12:00:00.000Z',
    };
    expect(ControlSnapshot.parse(control)).toMatchObject({
      schemaVersion: 1,
      contentHash: 'abc123',
    });
  });

  it('parses WeightEnvelope and clamps into band', async () => {
    const { WeightEnvelope, clampWeightEnvelope } = await import('./weight-envelope');
    const env = WeightEnvelope.parse({
      profileId: 'strat-a',
      scope: 'strategy',
      baselineWeight: 0.4,
      runtimeWeightBand: [0.1, 0.9],
      currentWeight: 1.2,
    });
    expect(clampWeightEnvelope(env).currentWeight).toBe(0.9);
  });
});

describe('Libraries and research graph (M2)', () => {
  it('parses CreateLibraryInput and ResearchGraphResponse', async () => {
    const { CreateLibraryInput, ResearchGraphResponse, CurationStatus } =
      await import('./libraries');
    expect(
      CreateLibraryInput.parse({ name: 'Semiconductors', topicScope: 'chips' }).masterLibrary,
    ).toBe(false);
    expect(CurationStatus.options).toContain('proposed');
    expect(CurationStatus.options).toContain('auto_admitted');
    const { ConceptSourceClass } = await import('./libraries');
    expect(ConceptSourceClass.options).toContain('catalog_seed');
    expect(ConceptSourceClass.options).toContain('deterministic_placeholder');
    const graph = ResearchGraphResponse.parse({
      nodes: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          moduleId: '22222222-2222-2222-2222-222222222222',
          title: 'Supply',
          body: 'Qualitative note',
          tags: ['chips'],
          sourceClass: 'catalog_seed',
          status: 'active',
          primaryLibraryId: '33333333-3333-3333-3333-333333333333',
          queryCount: 1,
          referenceCount: 2,
        },
      ],
      links: [],
      tags: ['chips'],
      libraries: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          name: 'Master',
          masterLibrary: true,
          topicScope: '',
          conceptCount: 1,
        },
      ],
      folders: [
        {
          folderKey: 'strategy_families',
          libraryId: '33333333-3333-3333-3333-333333333333',
          label: 'Strategy families',
          mass: 4,
          memberConceptIds: ['11111111-1111-1111-1111-111111111111'],
        },
      ],
      articles: [
        {
          topicId: '44444444-4444-4444-4444-444444444444',
          title: 'Thesis',
          libraryId: '33333333-3333-3333-3333-333333333333',
          folderKey: 'strategy_families',
          memberConceptIds: ['11111111-1111-1111-1111-111111111111'],
        },
      ],
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.libraries).toHaveLength(1);
    expect(graph.folders).toHaveLength(1);
    expect(graph.articles).toHaveLength(1);

    const { PutTopicConceptsInput, PatchResearchTopicInput, ResearchTopicDetail } =
      await import('./libraries');
    expect(
      PutTopicConceptsInput.parse({
        concepts: [{ conceptId: '11111111-1111-1111-1111-111111111111', sortOrder: 0 }],
      }).concepts,
    ).toHaveLength(1);
    expect(
      PatchResearchTopicInput.parse({ synopsisMd: '## Overview\nSee [[Supply]].' }).synopsisMd,
    ).toContain('Supply');
    expect(
      ResearchTopicDetail.parse({
        id: '44444444-4444-4444-4444-444444444444',
        companyId: '55555555-5555-5555-5555-555555555555',
        moduleId: '22222222-2222-2222-2222-222222222222',
        parentTopicId: null,
        title: 'Chips supply',
        status: 'active',
        priority: 'normal',
        provenance: null,
        synopsisMd: 'Overview',
        queryCount: 0,
        lastQueriedAt: null,
        referenceCount: 0,
        lastReferencedAt: null,
        engineInstanceId: '66666666-6666-4666-8666-666666666666',
        engineLabel: 'Research Alpha',
        researchModuleName: 'Desk research',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberships: [],
      }).engineLabel,
    ).toBe('Research Alpha');
  });
});

describe('Research bus (D-039)', () => {
  it('parses ResearchRequest, EvidencePackage, ConceptValidationResult, AdmissionMode', async () => {
    const {
      ResearchRequest,
      EvidencePackage,
      ConceptValidationResult,
      AdmissionMode,
      ResearchQueryMode,
      CreateResearchQueryInput,
      RESEARCH_SOURCE_FEED_CLASS,
      ResearchKeyProvider,
      ResearchSourceKind,
    } = await import('./research-bus');
    const { HandoffEnvelope } = await import('./foundation');
    const { ResearchModuleConfig } = await import('./modules');

    expect(AdmissionMode.options).toContain('auto_admit_validated');
    expect(ResearchQueryMode.options).toContain('manual');
    expect(RESEARCH_SOURCE_FEED_CLASS.brave_search).toBe('brave_search');
    expect(RESEARCH_SOURCE_FEED_CLASS.finnhub_news).toBe('finnhub_company_news');
    expect(RESEARCH_SOURCE_FEED_CLASS.polygon_news).toBe('polygon_reference_news');
    expect(ResearchKeyProvider.options).toContain('finnhub');
    expect(ResearchKeyProvider.options).toContain('polygon');
    expect(ResearchKeyProvider.options).toContain('fred');
    expect(ResearchKeyProvider.options).toContain('alpha_vantage');
    expect(ResearchKeyProvider.options).toContain('twelve_data');
    expect(ResearchKeyProvider.options).toContain('marketstack');
    expect(ResearchSourceKind.options).toContain('finnhub_news');
    expect(ResearchSourceKind.options).toContain('polygon_news');
    expect(ResearchSourceKind.options).toContain('fred_macro');
    expect(ResearchSourceKind.options).toContain('frankfurter_fx');
    expect(ResearchSourceKind.options).toContain('coingecko_crypto');
    expect(ResearchSourceKind.options).toContain('alpha_vantage_news');

    const envelope = HandoffEnvelope.parse({
      contractVersion: '1',
      producerRunId: null,
      companyId: '11111111-1111-4111-8111-111111111111',
      moduleId: '22222222-2222-4222-8222-222222222222',
      authorityClass: 'DETERMINISTIC',
      mutationClass: 'IMMUTABLE',
      queueClass: 'RESEARCH',
      priorityBand: 'NORMAL',
      timeoutClass: 'MEDIUM',
      idempotencyKey: 'research-req-test-01',
      replayHash: null,
      controlSnapshotRef: null,
      causationRefs: [],
      expiresAt: null,
    });

    const req = ResearchRequest.parse({
      mode: 'manual',
      companyId: envelope.companyId,
      moduleId: envelope.moduleId,
      queryText: 'semiconductor supply qualitative outlook',
      envelope,
    });
    expect(req.maxEvidence).toBe(8);

    expect(
      ResearchRequest.safeParse({
        mode: 'manual',
        companyId: envelope.companyId,
        moduleId: envelope.moduleId,
        queryText: 'test',
        sourceKinds: Array.from({ length: 24 }, (_, i) =>
          i % 2 === 0 ? 'sec_edgar' : 'frankfurter_fx',
        ),
        envelope,
      }).success,
    ).toBe(true);
    expect(
      ResearchRequest.safeParse({
        mode: 'manual',
        companyId: envelope.companyId,
        moduleId: envelope.moduleId,
        queryText: 'test',
        sourceKinds: Array.from({ length: 25 }, () => 'sec_edgar'),
        envelope,
      }).success,
    ).toBe(false);

    const evidence = EvidencePackage.parse({
      sourceKind: 'brave_search',
      feedClass: 'brave_search',
      title: 'Supply chain note',
      summary: 'Qualitative outlook without raw money figures.',
      digest: 'abc12345digest',
      artifactRefs: ['evidence:abc12345digest'],
    });
    expect(evidence.legalUseClass).toBe('ALLOWED');

    const validation = ConceptValidationResult.parse({
      overallPass: true,
      gates: [
        { gateId: 'relevance', passed: true, scoreBand: 'high', reason: 'topic overlap' },
        { gateId: 'leak_recheck', passed: true, scoreBand: 'high', reason: 'clean' },
      ],
      relevanceBand: 'high',
    });
    expect(validation.overallPass).toBe(true);

    expect(
      CreateResearchQueryInput.parse({
        queryText: 'research chips',
        moduleId: envelope.moduleId!,
      }).mode,
    ).toBe('manual');

    const { InitiateTopicResearchInput, InitiateTopicResearchResult, QueueClass } =
      await import('./index');
    expect(QueueClass.options).toEqual(
      expect.arrayContaining(['LIBRARY_RESEARCH', 'POSTURE_RESEARCH']),
    );
    expect(InitiateTopicResearchInput.parse({ all: true })).toEqual({ all: true });
    expect(
      InitiateTopicResearchInput.parse({ topicIds: [envelope.moduleId!] }).topicIds,
    ).toHaveLength(1);
    expect(() => InitiateTopicResearchInput.parse({})).toThrow();
    expect(
      InitiateTopicResearchResult.parse({
        queued: 1,
        topicIds: [envelope.moduleId!],
        queueClass: 'LIBRARY_RESEARCH',
      }).queueClass,
    ).toBe('LIBRARY_RESEARCH');

    expect(
      ResearchModuleConfig.parse({
        topicScope: 'chips',
      }).admissionMode,
    ).toBe('auto_admit_validated');
  });
});

describe('live data sources contracts', () => {
  it('resolveLiveDataSourceStatus maps implementation and readiness', async () => {
    const { resolveLiveDataSourceStatus, defaultBrowseQueryForDomain, LiveDataSourceQueryRequest } =
      await import('./live-data-sources');
    const { RESEARCH_SOURCE_REGISTRY } = await import('./research-source-registry');

    expect(resolveLiveDataSourceStatus(RESEARCH_SOURCE_REGISTRY.sec_edgar, true)).toBe('public');
    expect(resolveLiveDataSourceStatus(RESEARCH_SOURCE_REGISTRY.fred_macro, true)).toBe('ready');
    expect(resolveLiveDataSourceStatus(RESEARCH_SOURCE_REGISTRY.fred_macro, false)).toBe(
      'missing_key',
    );
    expect(defaultBrowseQueryForDomain('filings')).toBe('10-K');
    expect(LiveDataSourceQueryRequest.parse({}).mode).toBe('search');
    expect(LiveDataSourceQueryRequest.parse({}).maxResults).toBe(12);
  });

  it('isActiveLiveDataSource keeps ready/public only', async () => {
    const { isActiveLiveDataSource } = await import('./live-data-sources');
    expect(isActiveLiveDataSource({ status: 'ready' })).toBe(true);
    expect(isActiveLiveDataSource({ status: 'public' })).toBe(true);
    expect(isActiveLiveDataSource({ status: 'missing_key' })).toBe(false);
    expect(isActiveLiveDataSource({ status: 'stub' })).toBe(false);
    expect(isActiveLiveDataSource({ status: 'researched' })).toBe(false);
  });

  it('provider UI presets and widget mapping', async () => {
    const {
      liveDataSourcePresetsForDomain,
      liveDataSourceFormForDomain,
      evidenceToLiveDataSourceWidget,
      widgetKindForDomain,
      liveDataSourceIsCompleteList,
      resolveLiveDataSourceMaxResults,
      LIVE_DATA_SOURCE_FULL_LIST_CAP,
    } = await import('./live-data-sources');
    expect(liveDataSourcePresetsForDomain('filings').some((p) => p.id === '10k')).toBe(true);
    expect(liveDataSourceFormForDomain('equity_bars').fieldLabel).toBe('Symbol');
    expect(widgetKindForDomain('news')).toBe('headline');
    expect(liveDataSourceIsCompleteList('frankfurter_fx')).toBe(true);
    expect(liveDataSourceIsCompleteList('coingecko_crypto')).toBe(true);
    expect(liveDataSourceIsCompleteList('brave_search')).toBe(false);
    expect(resolveLiveDataSourceMaxResults('frankfurter_fx', 12)).toBe(
      LIVE_DATA_SOURCE_FULL_LIST_CAP,
    );
    expect(resolveLiveDataSourceMaxResults('brave_search', 8)).toBe(8);
    const w = evidenceToLiveDataSourceWidget(
      {
        digest: 'abcdefghijklmnop',
        title: 'Sample',
        summary: 'Summary text',
        feedClass: 'brave_search',
        authorityClass: 'web',
        externalRef: 'https://example.com',
        expiresAt: null,
      },
      { domain: 'web_search', index: 0, query: 'markets' },
    );
    expect(w.widgetKind).toBe('headline');
    expect(w.fields.some((f) => f.label === 'Query')).toBe(true);
  });
});

describe('paper engine binding (D-122)', () => {
  it('defaults routing to funds_only', async () => {
    const {
      EngineExecutionBinding,
      resolveTradingExecutionBinding,
      shouldSubmitToProvider,
      shouldShadowVerifyOnProvider,
      usesProviderAsPrimaryBook,
    } = await import('./paper-engine');
    const b = EngineExecutionBinding.parse({});
    expect(b.routingMode).toBe('funds_only');
    expect(b.useProviderLedgerAsFundsSource).toBe(true);
    expect(resolveTradingExecutionBinding({}).routingMode).toBe('funds_only');
    expect(shouldSubmitToProvider('funds_only')).toBe(false);
    expect(shouldSubmitToProvider('execute_on_service')).toBe(true);
    expect(shouldSubmitToProvider('both_verify')).toBe(true);
    expect(usesProviderAsPrimaryBook('execute_on_service')).toBe(true);
    expect(usesProviderAsPrimaryBook('both_verify')).toBe(false);
    expect(shouldShadowVerifyOnProvider('both_verify')).toBe(true);
    expect(shouldShadowVerifyOnProvider('funds_only')).toBe(false);
  });

  it('parses PaperTradeQuotePreviewResponse (D-192)', async () => {
    const { PaperTradeQuotePreviewResponse } = await import('./paper-engine');
    const preview = PaperTradeQuotePreviewResponse.parse({
      symbol: 'AAPL',
      usedLive: true,
      priorSessionMark: true,
      sourceClass: 'broker_state',
      feedClass: 'alpaca_iex_paper',
      markCents: '19025',
      honestyTags: ['live_market_quote', 'prior_session_mark', 'funds_only_routing'],
      impactProxyLikely: true,
    });
    expect(preview.impactProxyLikely).toBe(true);
    expect(preview.honestyTags).toContain('live_market_quote');
  });

  it('computes fill price delta bps', async () => {
    const { fillPriceDeltaBps, buildFillPriceBookDeltaDimension } = await import('./paper-engine');
    expect(fillPriceDeltaBps({ internalPriceCents: 10_000, referencePriceCents: 10_050 })).toBe(50);
    expect(
      buildFillPriceBookDeltaDimension({
        internalPriceCents: 100,
        referencePriceCents: 101,
      }).kind,
    ).toBe('fill_price_bps');
  });

  it('computeInternalPaperFill matches 2 bps taker model', async () => {
    const { computeInternalPaperFill } = await import('./paper-engine');
    const buy = computeInternalPaperFill({
      actionVerb: 'buy',
      orderType: 'market',
      limitPriceCents: null,
      quote: { bidCents: 100, askCents: 100, lastCents: 100 },
    });
    expect(buy).toEqual({ ok: true, priceCents: 100 });
    const sell = computeInternalPaperFill({
      actionVerb: 'sell',
      orderType: 'market',
      limitPriceCents: null,
      quote: { bidCents: 10_000, askCents: 10_020, lastCents: 10_010 },
      slippageBps: 2,
    });
    expect(sell.ok).toBe(true);
    if (sell.ok) expect(sell.priceCents).toBe(9_998);
  });

  it('parses BookDelta with dimensions', async () => {
    const { BookDelta } = await import('./paper-engine');
    const d = BookDelta.parse({
      companyId: '00000000-0000-4000-8000-000000000001',
      engineModuleId: '00000000-0000-4000-8000-000000000002',
      instructionId: '00000000-0000-4000-8000-000000000003',
      routingMode: 'both_verify',
      dimensions: [{ kind: 'fill_price_bps', internalValue: 10, referenceValue: 25, unit: 'bps' }],
    });
    expect(d.dimensions[0]?.kind).toBe('fill_price_bps');
  });

  it('TradingModuleConfig accepts executionBinding', () => {
    const parsed = MODULE_CONFIG_SCHEMAS.trading.parse({
      subtype: 'day',
      executionBinding: { routingMode: 'execute_on_service' },
    });
    expect(parsed.executionBinding?.routingMode).toBe('execute_on_service');
  });

  it('computeEngineSpendCapCents isolates engine envelopes', async () => {
    const { computeEngineSpendCapCents } = await import('./paper-engine');
    expect(
      computeEngineSpendCapCents({
        companyPoolCents: 1_000_000n,
        engineLedgerCents: 0n,
        allocationCapCents: 250_000n,
        engineScoped: true,
      }),
    ).toEqual({
      spendCapCents: 250_000n,
      source: 'engine_allocation',
      isolationActive: true,
    });
    expect(
      computeEngineSpendCapCents({
        companyPoolCents: 1_000_000n,
        engineLedgerCents: 80_000n,
        allocationCapCents: 250_000n,
        engineScoped: true,
      }).spendCapCents,
    ).toBe(80_000n);
    expect(
      computeEngineSpendCapCents({
        companyPoolCents: 1_000_000n,
        engineLedgerCents: 0n,
        allocationCapCents: null,
        engineScoped: false,
      }).isolationActive,
    ).toBe(false);
  });
});

describe('research source registry', () => {
  it('selectReadySourceKinds returns public shipped sources without keys', async () => {
    const { selectReadySourceKinds, RESEARCH_SOURCE_REGISTRY, listSourcesByDomain } =
      await import('./research-source-registry');

    const ready = selectReadySourceKinds({ researchKeys: [], hasAlpacaPaper: false });
    expect(ready).toContain('sec_edgar');
    expect(ready).toContain('frankfurter_fx');
    expect(ready).toContain('coingecko_crypto');
    expect(ready).toContain('world_bank_indicator');
    expect(ready).toContain('gdelt_news');
    expect(ready).not.toContain('catalog');
    expect(ready).not.toContain('library');
    expect(ready).not.toContain('operator');
    expect(ready).not.toContain('fred_macro');
    expect(ready).not.toContain('twelve_data');
    expect(ready).not.toContain('marketstack');
    expect(ready.length).toBeLessThanOrEqual(24);

    const withFred = selectReadySourceKinds(
      { researchKeys: ['fred'], hasAlpacaPaper: false },
      undefined,
    );
    expect(withFred).toContain('fred_macro');

    const explicitInternal = selectReadySourceKinds({ researchKeys: [], hasAlpacaPaper: false }, [
      'catalog',
      'sec_edgar',
    ]);
    expect(explicitInternal).toContain('catalog');
    expect(explicitInternal).toContain('sec_edgar');

    expect(RESEARCH_SOURCE_REGISTRY.frankfurter_fx.implementation).toBe('shipped');
    expect(RESEARCH_SOURCE_REGISTRY.world_bank_indicator.implementation).toBe('shipped');
    expect(RESEARCH_SOURCE_REGISTRY.gdelt_news.implementation).toBe('shipped');
    expect(RESEARCH_SOURCE_REGISTRY.twelve_data.implementation).toBe('shipped');
    expect(RESEARCH_SOURCE_REGISTRY.marketstack.implementation).toBe('shipped');
    expect(listSourcesByDomain('fx').map((d) => d.kind)).toContain('frankfurter_fx');
  });
});

describe('canvas layout (D-033)', () => {
  const engineId = '00000000-0000-4000-8000-00000000e001';
  const mkModule = (id: string, type: ModuleType = 'research') => ({
    id,
    type,
    engineInstanceId: engineId,
    toolOwnerModuleId: null,
    position: { x: 0, y: 0 },
  });

  it('requires dedicated Math only for model-bearing analytical owners', () => {
    expect(moduleRequiresMath('research')).toBe(true);
    expect(moduleRequiresMath('trend')).toBe(true);
    expect(moduleRequiresMath('trading')).toBe(true);
    expect(moduleRequiresMath('simulator')).toBe(true);
    expect(moduleRequiresMath('analyzer')).toBe(true);
    expect(moduleRequiresMath('generator')).toBe(true);
    expect(moduleRequiresMath('library')).toBe(false);
    expect(moduleRequiresMath('math')).toBe(false);
  });

  it('projects create module slots under the company cap for day trading + deps', () => {
    const day = ENGINE_TEMPLATES.find((engine) => engine.id === 'engine_day_trading');
    const regime = ENGINE_TEMPLATES.find((engine) => engine.id === 'research_market_regime_lab');
    const desk = ENGINE_TEMPLATES.find((engine) => engine.id === 'research_desk_aligned');
    expect(day && regime && desk).toBeTruthy();
    const slots = projectedModuleSlotsForCreate({
      engineModuleTypes: [day!, regime!, desk!].map((engine) =>
        engine.modules.map((module) => module.type),
      ),
    });
    expect(slots).toBe(39);
    expect(slots).toBeLessThanOrEqual(MAX_MODULES_PER_COMPANY);
  });

  it('docks explicit dedicated Math below its measured owner without link inference', () => {
    const ownerId = '00000000-0000-4000-8000-0000000000e1';
    const mathId = '00000000-0000-4000-8000-0000000000e2';
    const owner = { ...mkModule(ownerId), width: 300, height: 340 };
    const math = {
      ...mkModule(mathId, 'math'),
      engineInstanceId: null,
      toolOwnerModuleId: ownerId,
    };
    const result = reflowEngineAtOrigin(
      { id: engineId, memberModuleIds: [ownerId] },
      [owner, math],
      [],
      { x: 100, y: 100 },
      ENGINE_GROUP_PADDING,
    );
    const ownerPos = result.modules.find((module) => module.id === ownerId)!.canvasPosition;
    const mathPos = result.modules.find((module) => module.id === mathId)!.canvasPosition;
    expect(mathPos.x).toBe(ownerPos.x + (owner.width - CANVAS_LAYOUT.mathToolWidth) / 2);
    expect(mathPos.y).toBe(ownerPos.y + owner.height + CANVAS_LAYOUT.mathAttachmentGap);
    const bounds = result.engines[0]!.canvasBounds;
    // Group chrome must cover the Math dock, not only the owner card.
    expect(bounds.y + bounds.height).toBeGreaterThan(mathPos.y + CANVAS_LAYOUT.mathToolHeight);
  });

  it('uses owner/tool envelopes for vertical row spacing', () => {
    expect(LAYOUT_ROW_STEP).toBe(
      CANVAS_LAYOUT.moduleHeight +
        CANVAS_LAYOUT.mathAttachmentGap +
        CANVAS_LAYOUT.mathToolHeight +
        CANVAS_LAYOUT.verticalGutter,
    );
    expect(LAYOUT_COLUMN_STEP).toBe(CANVAS_LAYOUT.moduleWidth + CANVAS_LAYOUT.horizontalGutter);
  });

  it('places type-preferred lanes left-to-right regardless of link direction', () => {
    const researchId = '00000000-0000-4000-8000-0000000000a1';
    const tradingId = '00000000-0000-4000-8000-0000000000a2';
    const modulesById = new Map([
      [researchId, mkModule(researchId, 'research')],
      [tradingId, mkModule(tradingId, 'trading')],
    ]);
    const ranked = rankEngineMembers([researchId, tradingId], modulesById, [
      { fromModuleId: tradingId, toModuleId: researchId, linkKind: 'verification' },
    ]);
    const rankOf = (id: string) => ranked.find((r) => r.id === id)!.rank;
    expect(rankOf(researchId)).toBeLessThan(rankOf(tradingId));
  });

  it('stacks same-lane types by MODULE_LANE_ROW', () => {
    const researchId = '00000000-0000-4000-8000-0000000000b1';
    const librarianId = '00000000-0000-4000-8000-0000000000b2';
    const modulesById = new Map([
      [researchId, mkModule(researchId, 'research')],
      [librarianId, mkModule(librarianId, 'librarian')],
    ]);
    const ranked = rankEngineMembers([researchId, librarianId], modulesById, []);
    const rankOf = (id: string) => ranked.find((r) => r.id === id)!.rank;
    const orderOf = (id: string) => ranked.find((r) => r.id === id)!.order;
    expect(rankOf(researchId)).toBe(rankOf(librarianId));
    expect(orderOf(researchId)).toBeLessThan(orderOf(librarianId));
  });

  it('keeps capital and verification modules on the right without links', () => {
    const researchId = '00000000-0000-4000-8000-0000000000c1';
    const tradingId = '00000000-0000-4000-8000-0000000000c2';
    const policyId = '00000000-0000-4000-8000-0000000000c3';
    const modulesById = new Map([
      [researchId, mkModule(researchId, 'research')],
      [tradingId, mkModule(tradingId, 'trading')],
      [policyId, mkModule(policyId, 'policy')],
    ]);
    const ranked = rankEngineMembers([researchId, tradingId, policyId], modulesById, []);
    const rankOf = (id: string) => ranked.find((r) => r.id === id)!.rank;
    expect(rankOf(researchId)).toBe(0);
    expect(rankOf(tradingId)).toBeGreaterThan(rankOf(researchId));
    expect(rankOf(policyId)).toBeGreaterThan(rankOf(tradingId));
  });

  it('snaps chip zones research → data → trend → execution → verification', () => {
    const research = '00000000-0000-4000-8000-0000000000z1';
    const library = '00000000-0000-4000-8000-0000000000z2';
    const live = '00000000-0000-4000-8000-0000000000z3';
    const trend = '00000000-0000-4000-8000-0000000000z4';
    const trading = '00000000-0000-4000-8000-0000000000z5';
    const analyzer = '00000000-0000-4000-8000-0000000000z6';
    const modulesById = new Map([
      [research, mkModule(research, 'research')],
      [library, mkModule(library, 'library')],
      [live, mkModule(live, 'live_api')],
      [trend, mkModule(trend, 'trend')],
      [trading, mkModule(trading, 'trading')],
      [analyzer, mkModule(analyzer, 'analyzer')],
    ]);
    const ranked = rankEngineMembers(
      [research, library, live, trend, trading, analyzer],
      modulesById,
      [],
    );
    const rankOf = (id: string) => ranked.find((r) => r.id === id)!.rank;
    const orderOf = (id: string) => ranked.find((r) => r.id === id)!.order;
    expect(rankOf(research)).toBeLessThan(rankOf(library));
    expect(rankOf(library)).toBe(rankOf(live));
    expect(orderOf(library)).toBeLessThan(orderOf(live));
    expect(rankOf(library)).toBeLessThan(rankOf(trend));
    expect(rankOf(trend)).toBeLessThan(rankOf(trading));
    expect(rankOf(trading)).toBeLessThan(rankOf(analyzer));
  });

  it('excludes funds from process ranks and shelves them under the process envelope', () => {
    const research = '00000000-0000-4000-8000-0000000000f1';
    const trend = '00000000-0000-4000-8000-0000000000f2';
    const trading = '00000000-0000-4000-8000-0000000000f3';
    const fund = '00000000-0000-4000-8000-0000000000f4';
    const router = '00000000-0000-4000-8000-0000000000f5';
    const timeHub = '00000000-0000-4000-8000-0000000000f6';
    const modules = [
      mkModule(research, 'research'),
      mkModule(trend, 'trend'),
      mkModule(trading, 'trading'),
      mkModule(fund, 'holding_fund'),
      mkModule(router, 'fund_router'),
      mkModule(timeHub, 'time'),
    ];
    const ranked = rankEngineMembers(
      [research, trend, trading, fund, router, timeHub],
      new Map(modules.map((m) => [m.id, m])),
      [],
    );
    expect(ranked.every((r) => r.id !== fund && r.id !== router && r.id !== timeHub)).toBe(true);

    const laid = layoutEngineGroup(
      engineId,
      [research, trend, trading, fund, router, timeHub],
      new Map(modules.map((m) => [m.id, m])),
      [],
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
    );
    const pos = (id: string) => laid.modules.find((m) => m.id === id)!.canvasPosition;
    const trendBottom = pos(trend).y + CANVAS_LAYOUT.moduleHeight;
    expect(pos(fund).y).toBeGreaterThanOrEqual(trendBottom + CANVAS_LAYOUT.engineFundsShelfGap);
    expect(pos(router).y).toBe(pos(fund).y);
    expect(pos(timeHub).y).toBeGreaterThanOrEqual(
      pos(fund).y + CANVAS_LAYOUT.moduleHeight + CANVAS_LAYOUT.engineTimeHubGap,
    );
  });

  it('aligns producers with their specific consumers (barycenter crossing reduction)', () => {
    // p (research) → y (trading); q (research) → x (trading). Pure id ordering would
    // place x above y and cross the edges. Connection-aware ordering must instead put
    // each producer in the same row as the consumer it feeds.
    const p = '00000000-0000-4000-8000-0000000000a1';
    const q = '00000000-0000-4000-8000-0000000000a2';
    const x = '00000000-0000-4000-8000-0000000000b1';
    const y = '00000000-0000-4000-8000-0000000000b2';
    const modulesById = new Map([
      [p, mkModule(p, 'research')],
      [q, mkModule(q, 'research')],
      [x, mkModule(x, 'trading')],
      [y, mkModule(y, 'trading')],
    ]);
    const ranked = rankEngineMembers([p, q, x, y], modulesById, [
      { fromModuleId: p, toModuleId: y, linkKind: 'data_feed' },
      { fromModuleId: q, toModuleId: x, linkKind: 'data_feed' },
    ]);
    const orderOf = (id: string) => ranked.find((r) => r.id === id)!.order;
    expect(orderOf(p)).toBe(orderOf(y));
    expect(orderOf(q)).toBe(orderOf(x));
    // The edges do not cross: y (fed by the top producer p) sits above x.
    expect(orderOf(y)).toBeLessThan(orderOf(x));
  });

  it('keeps MODULE_LANE_ROW when cross-column neighbors would invert research/librarian', () => {
    const research = '00000000-0000-4000-8000-0000000000d1';
    const librarian = '00000000-0000-4000-8000-0000000000d2';
    const library = '00000000-0000-4000-8000-0000000000d3';
    const live = '00000000-0000-4000-8000-0000000000d4';
    const modulesById = new Map([
      [research, mkModule(research, 'research')],
      [librarian, mkModule(librarian, 'librarian')],
      [library, mkModule(library, 'library')],
      [live, mkModule(live, 'live_api')],
    ]);
    const ranked = rankEngineMembers(
      [research, librarian, library, live],
      modulesById,
      [
        { fromModuleId: research, toModuleId: librarian, linkKind: 'data_feed' },
        { fromModuleId: librarian, toModuleId: library, linkKind: 'data_feed' },
      ],
    );
    const orderOf = (id: string) => ranked.find((r) => r.id === id)!.order;
    expect(orderOf(research)).toBeLessThan(orderOf(librarian));
    expect(orderOf(library)).toBeLessThan(orderOf(live));
  });

  it('orders dual hub-feed analyzers analyzed above direct (D-216)', () => {
    const analyzed = '00000000-0000-4000-8000-0000000000f1';
    const direct = '00000000-0000-4000-8000-0000000000f2';
    const modulesById = new Map([
      [analyzed, { ...mkModule(analyzed, 'analyzer'), hubFeedClass: 'analyzed' as const }],
      [direct, { ...mkModule(direct, 'analyzer'), hubFeedClass: 'direct' as const }],
    ]);
    const ranked = rankEngineMembers([direct, analyzed], modulesById, []);
    const orderOf = (id: string) => ranked.find((r) => r.id === id)!.order;
    expect(orderOf(analyzed)).toBeLessThan(orderOf(direct));
  });

  it('layoutEngineGroup places research above librarian for standard desk spine', () => {
    const research = '00000000-0000-4000-8000-0000000000e1';
    const librarian = '00000000-0000-4000-8000-0000000000e2';
    const library = '00000000-0000-4000-8000-0000000000e3';
    const live = '00000000-0000-4000-8000-0000000000e4';
    const trend = '00000000-0000-4000-8000-0000000000e5';
    const trading = '00000000-0000-4000-8000-0000000000e6';
    const analyzer = '00000000-0000-4000-8000-0000000000e7';
    const policy = '00000000-0000-4000-8000-0000000000e8';
    const modules = [
      mkModule(research, 'research'),
      mkModule(librarian, 'librarian'),
      mkModule(library, 'library'),
      mkModule(live, 'live_api'),
      mkModule(trend, 'trend'),
      mkModule(trading, 'trading'),
      mkModule(analyzer, 'analyzer'),
      mkModule(policy, 'policy'),
    ];
    const links = [
      { fromModuleId: research, toModuleId: librarian, linkKind: 'data_feed' as const },
      { fromModuleId: librarian, toModuleId: library, linkKind: 'data_feed' as const },
      { fromModuleId: library, toModuleId: trend, linkKind: 'data_feed' as const },
      { fromModuleId: live, toModuleId: trend, linkKind: 'data_feed' as const },
      { fromModuleId: trend, toModuleId: trading, linkKind: 'data_feed' as const },
      { fromModuleId: trading, toModuleId: analyzer, linkKind: 'data_feed' as const },
      { fromModuleId: analyzer, toModuleId: policy, linkKind: 'data_feed' as const },
    ];
    const laid = layoutEngineGroup(
      engineId,
      [research, librarian, library, live, trend, trading, analyzer, policy],
      new Map(modules.map((m) => [m.id, m])),
      links,
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
    );
    const pos = (id: string) => laid.modules.find((m) => m.id === id)!.canvasPosition;
    expect(pos(research).y).toBeLessThan(pos(librarian).y);
    expect(pos(library).y).toBeLessThan(pos(live).y);
    expect(pos(analyzer).y).toBeLessThan(pos(policy).y);
    expect(pos(research).x).toBeLessThan(pos(library).x);
    expect(pos(library).x).toBeLessThan(pos(trend).x);
    expect(pos(trend).x).toBeLessThan(pos(trading).x);
    expect(pos(trading).x).toBeLessThan(pos(analyzer).x);
  });

  it('every ENGINE_TEMPLATE respects lane-row and chip-zone order after layout (D-212)', () => {
    for (const engine of ENGINE_TEMPLATES) {
      const { modulePositions } = layoutEngineTemplateAtOrigin(
        engine.modules,
        engine.links,
        { x: 0, y: 0 },
        ENGINE_GROUP_PADDING,
      );
      const byType = new Map<string, { x: number; y: number }[]>();
      engine.modules.forEach((module, index) => {
        const pos = modulePositions[index]!;
        const list = byType.get(module.type) ?? [];
        list.push(pos);
        byType.set(module.type, list);
      });
      const minY = (type: string) =>
        Math.min(...(byType.get(type) ?? [{ y: Number.POSITIVE_INFINITY }]).map((p) => p.y));
      const minX = (type: string) =>
        Math.min(...(byType.get(type) ?? [{ x: Number.POSITIVE_INFINITY }]).map((p) => p.x));
      if (byType.has('research') && byType.has('librarian')) {
        expect(minY('research'), engine.id).toBeLessThan(minY('librarian'));
      }
      if (byType.has('library') && byType.has('live_api')) {
        expect(minY('library'), engine.id).toBeLessThan(minY('live_api'));
      }
      if (byType.has('analyzer') && byType.has('policy')) {
        expect(minY('analyzer'), engine.id).toBeLessThan(minY('policy'));
      }
      if (byType.has('research') && byType.has('trend')) {
        expect(minX('research'), engine.id).toBeLessThan(minX('trend'));
      }
      if (byType.has('trend') && byType.has('trading')) {
        expect(minX('trend'), engine.id).toBeLessThan(minX('trading'));
      }
      if (byType.has('trading') && byType.has('analyzer')) {
        expect(minX('trading'), engine.id).toBeLessThan(minX('analyzer'));
      }
    }
  });

  it('pins engine Time hubs to the bottom-left of the member envelope', () => {
    const research = '00000000-0000-4000-8000-0000000000t1';
    const library = '00000000-0000-4000-8000-0000000000t2';
    const analyzer = '00000000-0000-4000-8000-0000000000t3';
    const timeHub = '00000000-0000-4000-8000-0000000000t4';
    const modules = [
      mkModule(research, 'research'),
      mkModule(library, 'library'),
      mkModule(analyzer, 'analyzer'),
      mkModule(timeHub, 'time'),
    ];
    const laid = layoutEngineGroup(
      engineId,
      [research, library, analyzer, timeHub],
      new Map(modules.map((m) => [m.id, m])),
      [
        { fromModuleId: research, toModuleId: library, linkKind: 'data_feed' },
        { fromModuleId: library, toModuleId: analyzer, linkKind: 'data_feed' },
      ],
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
    );
    const timePos = laid.modules.find((m) => m.id === timeHub)!.canvasPosition;
    const others = laid.modules.filter((m) => m.id !== timeHub).map((m) => m.canvasPosition);
    const maxOtherBottom = Math.max(...others.map((p) => p.y + CANVAS_LAYOUT.moduleHeight));
    expect(timePos.y).toBeGreaterThanOrEqual(maxOtherBottom);
    const minX = Math.min(...others.map((p) => p.x));
    expect(timePos.x).toBe(minX);
    expect(
      rankEngineMembers(
        [research, library, analyzer, timeHub],
        new Map(modules.map((m) => [m.id, m])),
        [],
      ).every((r) => r.id !== timeHub),
    ).toBe(true);
  });

  it('placeEngineTimeHubPosition docks bottom-left under the envelope', () => {
    expect(
      placeEngineTimeHubPosition([
        { x: 0, y: 0, width: 220, height: 168 },
        { x: 340, y: 0, width: 220, height: 168 },
      ]),
    ).toEqual({
      x: 0,
      y: 168 + CANVAS_LAYOUT.engineTimeHubGap,
    });
  });

  it('reflows an engine preserving its origin with connection-safe spacing', () => {
    const a = '00000000-0000-4000-8000-0000000000c1';
    const b = '00000000-0000-4000-8000-0000000000c2';
    const modules = [mkModule(a, 'research'), mkModule(b, 'library')];
    const result = reflowEngineAtOrigin(
      { id: engineId, memberModuleIds: [a, b] },
      modules,
      [{ fromModuleId: a, toModuleId: b, linkKind: 'data_feed' }],
      { x: 500, y: 300 },
      ENGINE_GROUP_PADDING,
    );
    const bounds = result.engines[0]!.canvasBounds;
    expect(bounds.x).toBe(500);
    expect(bounds.y).toBe(300);
    const posA = result.modules.find((m) => m.id === a)!.canvasPosition;
    const posB = result.modules.find((m) => m.id === b)!.canvasPosition;
    // Library sits one full column to the right of research.
    expect(posB.x - posA.x).toBe(LAYOUT_COLUMN_STEP);
  });

  it('lays out day-trading engine template at origin (research left, policy right, multi-row)', () => {
    const day = ENGINE_TEMPLATES.find((engine) => engine.id === 'engine_day_trading');
    expect(day).toBeTruthy();
    const { modulePositions, canvasBounds } = layoutEngineTemplateAtOrigin(
      day!.modules,
      day!.links,
      { x: 100, y: 200 },
      ENGINE_GROUP_PADDING,
    );
    expect(canvasBounds.x).toBe(100);
    expect(canvasBounds.y).toBe(200);

    const researchIdx = day!.modules.findIndex((module) => module.type === 'research');
    const policyIdx = day!.modules.findIndex((module) => module.type === 'policy');
    const librarianIdx = day!.modules.findIndex((module) => module.type === 'librarian');
    expect(modulePositions[researchIdx]!.x).toBeLessThan(modulePositions[policyIdx]!.x);
    expect(modulePositions[researchIdx]!.y).not.toBe(modulePositions[librarianIdx]!.y);
  });

  it('stacks execution engines vertically with research on the left (D-159)', () => {
    const a = '00000000-0000-4000-8000-0000000000d1';
    const b = '00000000-0000-4000-8000-0000000000d2';
    const c = '00000000-0000-4000-8000-0000000000d3';
    const engineTwo = '00000000-0000-4000-8000-00000000e002';
    const researchEng = '00000000-0000-4000-8000-00000000e003';
    const modules = [
      { ...mkModule(a), engineInstanceId: engineId },
      { ...mkModule(b), engineInstanceId: engineTwo },
      { ...mkModule(c, 'research'), engineInstanceId: researchEng },
    ];
    const result = layoutCanvas(
      [
        {
          id: engineId,
          memberModuleIds: [a],
          templateId: 'engine_day_trading',
        },
        {
          id: engineTwo,
          memberModuleIds: [b],
          templateId: 'engine_hft',
        },
        {
          id: researchEng,
          memberModuleIds: [c],
          templateId: 'research_market_regime_lab',
        },
      ],
      modules,
      [],
      ENGINE_GROUP_PADDING,
    );
    const day = result.engines.find((e) => e.id === engineId)!;
    const hft = result.engines.find((e) => e.id === engineTwo)!;
    const research = result.engines.find((e) => e.id === researchEng)!;
    // Research dep claimed by day-trading sits left of day execution.
    expect(research.canvasBounds.x).toBeLessThan(day.canvasBounds.x);
    // Separate execution engines stack vertically (similar x, greater y).
    expect(Math.abs(day.canvasBounds.x - hft.canvasBounds.x)).toBeLessThan(50);
    expect(hft.canvasBounds.y).toBeGreaterThanOrEqual(day.canvasBounds.y + day.canvasBounds.height);
  });

  it('places Data Hub between research and execution (D-159)', () => {
    const researchMod = '00000000-0000-4000-8000-0000000000h1';
    const tradingMod = '00000000-0000-4000-8000-0000000000h2';
    const hubMod = '00000000-0000-4000-8000-0000000000h3';
    const researchEng = '00000000-0000-4000-8000-00000000e0r1';
    const modules = [
      { ...mkModule(researchMod, 'research'), engineInstanceId: researchEng },
      { ...mkModule(tradingMod, 'trading'), engineInstanceId: engineId },
      {
        ...mkModule(hubMod, 'library'),
        engineInstanceId: null,
        position: { x: 0, y: 0 },
      },
    ];
    const result = layoutCanvas(
      [
        {
          id: engineId,
          memberModuleIds: [tradingMod],
          templateId: 'engine_day_trading',
          dataHubModuleId: hubMod,
        },
        {
          id: researchEng,
          memberModuleIds: [researchMod],
          templateId: 'research_market_regime_lab',
        },
      ],
      modules,
      [],
      ENGINE_GROUP_PADDING,
    );
    const exec = result.engines.find((e) => e.id === engineId)!;
    const research = result.engines.find((e) => e.id === researchEng)!;
    const hubPos = result.modules.find((m) => m.id === hubMod)!.canvasPosition;
    expect(hubPos.x).toBeGreaterThanOrEqual(research.canvasBounds.x);
    expect(hubPos.x + CANVAS_LAYOUT.dataHubWidth).toBeLessThanOrEqual(
      exec.canvasBounds.x + exec.canvasBounds.width,
    );
    expect(hubPos.x).toBeLessThan(exec.canvasBounds.x);
    // Biased toward execution (past gap midpoint).
    const researchRight = research.canvasBounds.x + research.canvasBounds.width;
    const gapMid = researchRight + (exec.canvasBounds.x - researchRight) / 2;
    expect(hubPos.x + CANVAS_LAYOUT.dataHubWidth / 2).toBeGreaterThan(gapMid);
    // Vertically near data_in handle (~18% from exec top).
    const handleY =
      exec.canvasBounds.y +
      exec.canvasBounds.height * CANVAS_LAYOUT.engineDataInHandleTopFrac;
    expect(Math.abs(hubPos.y + CANVAS_LAYOUT.dataHubHeight / 2 - handleY)).toBeLessThan(40);
  });

  it('biases placeDataHubOrigin toward execution data_in (D-168)', () => {
    const research = { x: 40, y: 40, width: 400, height: 300 };
    const exec = { x: 720, y: 40, width: 600, height: 500 };
    const origin = placeDataHubOrigin([research], exec);
    const gapMid = research.x + research.width + (exec.x - (research.x + research.width)) / 2;
    expect(origin.x + CANVAS_LAYOUT.dataHubWidth / 2).toBeGreaterThan(gapMid);
    expect(origin.x + CANVAS_LAYOUT.dataHubWidth).toBeLessThanOrEqual(exec.x);
    const handleY = exec.y + exec.height * CANVAS_LAYOUT.engineDataInHandleTopFrac;
    expect(Math.abs(origin.y + CANVAS_LAYOUT.dataHubHeight / 2 - handleY)).toBeLessThan(8);
  });

  it('claims linked sim children on execution families (D-189)', () => {
    const execId = '00000000-0000-4000-8000-00000000e101';
    const preSimId = '00000000-0000-4000-8000-00000000e201';
    const postSimId = '00000000-0000-4000-8000-00000000e202';
    const adhocSimId = '00000000-0000-4000-8000-00000000e203';
    const engines = [
      { id: execId, memberModuleIds: ['m-exec'], templateId: 'engine_day_trading' },
      {
        id: preSimId,
        memberModuleIds: ['m-pre'],
        templateId: 'sim_gate_strategy_spread',
        simulationBinding: {
          role: 'gate' as const,
          placement: 'pre' as const,
          parentExecutionEngineId: execId,
          mimicParent: true,
        },
      },
      {
        id: postSimId,
        memberModuleIds: ['m-post'],
        templateId: 'sim_train_policy_replay',
        simulationBinding: {
          role: 'training' as const,
          placement: 'post' as const,
          parentExecutionEngineId: execId,
          mimicParent: true,
        },
      },
      {
        id: adhocSimId,
        memberModuleIds: ['m-adhoc'],
        templateId: 'sim_adhoc_paper_desk',
        simulationBinding: { role: 'adhoc' as const, mimicParent: false },
      },
    ];
    const { families, orphans } = buildCanvasEngineFamilies(engines);
    expect(families).toHaveLength(1);
    expect(families[0]!.execution.id).toBe(execId);
    expect(families[0]!.simChildren.pre.map((sim) => sim.id)).toEqual([preSimId]);
    expect(families[0]!.simChildren.post.map((sim) => sim.id)).toEqual([postSimId]);
    expect(orphans.map((sim) => sim.id)).toEqual([adhocSimId]);
  });

  it('places pre sim left of exec and post sim right of exec (D-189)', () => {
    const execId = '00000000-0000-4000-8000-00000000e301';
    const preSimId = '00000000-0000-4000-8000-00000000e302';
    const postSimId = '00000000-0000-4000-8000-00000000e303';
    const execMod = '00000000-0000-4000-8000-0000000000s1';
    const preMod = '00000000-0000-4000-8000-0000000000s2';
    const postMod = '00000000-0000-4000-8000-0000000000s3';
    const modules = [
      { ...mkModule(execMod, 'trading'), engineInstanceId: execId },
      { ...mkModule(preMod, 'simulator'), engineInstanceId: preSimId },
      { ...mkModule(postMod, 'simulator'), engineInstanceId: postSimId },
    ];
    const result = layoutCanvas(
      [
        {
          id: execId,
          memberModuleIds: [execMod],
          templateId: 'engine_day_trading',
        },
        {
          id: preSimId,
          memberModuleIds: [preMod],
          templateId: 'sim_gate_strategy_spread',
          simulationBinding: {
            role: 'gate',
            placement: 'pre',
            parentExecutionEngineId: execId,
            mimicParent: true,
          },
        },
        {
          id: postSimId,
          memberModuleIds: [postMod],
          templateId: 'sim_train_policy_replay',
          simulationBinding: {
            role: 'training',
            placement: 'post',
            parentExecutionEngineId: execId,
            mimicParent: true,
          },
        },
      ],
      modules,
      [],
      ENGINE_GROUP_PADDING,
    );
    const exec = result.engines.find((engine) => engine.id === execId)!;
    const pre = result.engines.find((engine) => engine.id === preSimId)!;
    const post = result.engines.find((engine) => engine.id === postSimId)!;
    expect(pre.canvasBounds.x + pre.canvasBounds.width).toBeLessThanOrEqual(exec.canvasBounds.x);
    expect(post.canvasBounds.x).toBeGreaterThanOrEqual(exec.canvasBounds.x + exec.canvasBounds.width);
  });

  it('mimicParent clones parent setup and module policy/strategy fields (D-189)', () => {
    expect(
      shouldApplyMimicParent({
        role: 'gate',
        placement: 'pre',
        parentExecutionEngineId: '00000000-0000-4000-8000-00000000e001',
        mimicParent: true,
      }),
    ).toBe(true);
    expect(shouldApplyMimicParent({ role: 'adhoc', mimicParent: false })).toBe(false);

    const mimicked = mimicParentEngineSetup(
      {
        setupSnapshot: {
          topicSectors: ['tech'],
          allocationMode: 'percentage',
          allocationValue: '25',
          targetExitLocal: '2026-12-31T16:00',
        },
        modules: [],
      },
      {
        topicSectors: [],
        allocationMode: 'amount',
        allocationValue: '',
        targetExitLocal: '',
      },
    );
    expect(mimicked.topicSectors).toEqual(['tech']);
    expect(mimicked.allocationValue).toBe('25');

    const configs = mimicParentModuleConfigs(
      [
        {
          type: 'trading',
          config: { subtype: 'hft', strategyFamilies: ['strat-001', 'strat-007'] },
        },
        { type: 'policy', config: { policyEnvelopeRef: 'paper_hft_swarm_v1' } },
      ],
      [
        { type: 'trading', config: { subtype: 'day', strategyFamilies: [] } },
        { type: 'policy', config: { policyEnvelopeRef: 'paper_balanced_general_v1' } },
      ],
    );
    expect(configs[0]!.config.strategyFamilies).toEqual(['strat-001', 'strat-007']);
    expect(configs[0]!.config.subtype).toBe('hft');
    expect(configs[1]!.config.policyEnvelopeRef).toBe('paper_hft_swarm_v1');
  });

  it('places the next execution engine origin below occupied envelopes (D-159)', () => {
    const first = { x: 40, y: 40, width: 800, height: 600 };
    const size = { width: 700, height: 500 };
    const origin = placeNextEngineOrigin([first], size, { section: 'execution' });
    expect(rectsOverlap({ ...origin, ...size }, first)).toBe(false);
    expect(origin.y).toBeGreaterThanOrEqual(first.y + first.height);
  });

  it('keeps a preferred origin when it already clears occupied engines', () => {
    const occupied = [{ x: 40, y: 40, width: 400, height: 300 }];
    const preferred = { x: 800, y: 40 };
    expect(placeNextEngineOrigin(occupied, { width: 300, height: 300 }, { preferred })).toEqual(
      preferred,
    );
  });

  it('derives canvas offset so template envelopes land at the chosen origin', () => {
    const { offset, bounds } = engineCanvasOffsetForOrigin(
      [
        { x: 100, y: 200 },
        { x: 400, y: 200 },
      ],
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
    );
    expect(bounds.x).toBe(40);
    expect(bounds.y).toBe(40);
    expect(offset.x).toBe(40 - (100 - ENGINE_GROUP_PADDING.left));
    expect(offset.y).toBe(40 - (200 - ENGINE_GROUP_PADDING.top));
  });

  it('translates a reflowed engine to a collision-free origin', () => {
    const a = '00000000-0000-4000-8000-0000000000f1';
    const laid = reflowEngineAtOrigin(
      { id: engineId, memberModuleIds: [a] },
      [mkModule(a)],
      [],
      { x: 40, y: 40 },
      ENGINE_GROUP_PADDING,
    );
    const moved = translateLayoutResultToOrigin(laid, engineId, { x: 900, y: 40 });
    expect(moved.engines[0]!.canvasBounds.x).toBe(900);
    expect(moved.modules[0]!.canvasPosition.x - laid.modules[0]!.canvasPosition.x).toBe(860);
  });
});

describe('CreateCompanyInput (D-043)', () => {
  it('requires at least one engine', () => {
    const empty = CreateCompanyInput.safeParse({
      name: 'Desk',
      philosophyPrompt: 'Patient paper desk.',
      engines: [],
    });
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues.some((issue) => /at least one engine/i.test(issue.message))).toBe(
        true,
      );
    }
  });

  it('accepts a single engine seed', () => {
    const ok = CreateCompanyInput.safeParse({
      name: 'Desk',
      philosophyPrompt: 'Patient paper desk.',
      engines: [{ templateId: 'engine_day_trading', inputs: {} }],
    });
    expect(ok.success).toBe(true);
  });

  it('all ENGINE_TEMPLATES trading modules use valid TradingSubtype (D-189 seed fix)', () => {
    const failures: string[] = [];
    for (const eng of ENGINE_TEMPLATES) {
      for (const mod of eng.modules) {
        if (mod.type !== 'trading') continue;
        const subtype = (mod.config as { subtype?: unknown }).subtype;
        const parsed = TradingSubtype.safeParse(subtype);
        if (!parsed.success) {
          failures.push(`${eng.id}/${mod.name}: ${String(subtype)}`);
        }
        const schema = MODULE_CONFIG_SCHEMAS.trading.safeParse(mod.config);
        if (!schema.success) {
          failures.push(
            `${eng.id}/${mod.name} schema: ${schema.error.issues.map((i) => i.message).join('; ')}`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('accepts predefined sector focuses and rejects unknown labels', () => {
    const ok = CreateCompanyInput.safeParse({
      name: 'Desk',
      philosophyPrompt: 'Patient paper desk.',
      sectorFocuses: ['Semiconductors', 'Macro · rates & FX'],
      engines: [{ templateId: 'engine_day_trading', inputs: {} }],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.sectorFocuses).toEqual(['Semiconductors', 'Macro · rates & FX']);
    }

    const bad = CreateCompanyInput.safeParse({
      name: 'Desk',
      philosophyPrompt: 'Patient paper desk.',
      sectorFocuses: ['Not a real sector'],
      engines: [{ templateId: 'engine_day_trading', inputs: {} }],
    });
    expect(bad.success).toBe(false);
  });

  it('maps execution engines to research dependency packs', () => {
    const deps = researchDependenciesForExecutionEngine('engine_day_trading');
    expect(deps).toEqual(
      expect.arrayContaining(['research_market_regime_lab', 'research_desk_aligned']),
    );
    for (const dep of deps) {
      expect(ENGINE_TEMPLATES.some((engine) => engine.id === dep)).toBe(true);
    }
  });

  it('maps each execution engine to use-case research packs (D-153)', () => {
    expect(researchDependenciesForExecutionEngine('engine_long_term')).toEqual([
      'research_filings_fundamentals',
      'research_event_catalyst',
    ]);
    expect(researchDependenciesForExecutionEngine('engine_crypto')).toEqual([
      'research_crypto_context',
    ]);
    expect(researchDependenciesForExecutionEngine('engine_prediction')).toEqual([
      'research_prediction_niche',
    ]);
    expect(researchDependenciesForExecutionEngine('engine_hft')).toEqual([
      'research_microstructure_lab',
    ]);
  });

  it('ships usable paper HFT spine with microstructure lab (D-157)', () => {
    const hft = ENGINE_TEMPLATES.find((engine) => engine.id === 'engine_hft');
    expect(hft?.available).toBe(true);
    expect(hft?.modules.length).toBeGreaterThanOrEqual(10);
    expect(
      hft?.modules.some(
        (m) => m.type === 'trading' && (m.config as { subtype?: string }).subtype === 'hft',
      ),
    ).toBe(true);
    const lab = ENGINE_TEMPLATES.find((engine) => engine.id === 'research_microstructure_lab');
    expect(lab?.available).toBe(true);
    expect(
      lab?.modules.some(
        (m) =>
          m.type === 'research' &&
          (m.config as { researchSubtype?: string }).researchSubtype === 'microstructure_context',
      ),
    ).toBe(true);
    const expanded = expandEngineSeedsWithResearchDeps([{ templateId: 'engine_hft' }]);
    expect(expanded.map((s) => s.templateId)).toEqual([
      'research_microstructure_lab',
      'engine_hft',
    ]);
  });

  it('expands create seeds with research deps ahead of execution (D-153)', () => {
    const expanded = expandEngineSeedsWithResearchDeps([
      { templateId: 'engine_day_trading', inputs: { focus: 'tech' } },
    ]);
    expect(expanded.map((s) => s.templateId)).toEqual([
      'research_market_regime_lab',
      'research_desk_aligned',
      'engine_day_trading',
    ]);
    expect(expanded[2]?.inputs).toEqual({ focus: 'tech' });
    // D-213: auto research deps inherit sector focus into topicScope/focus inputs
    expect(expanded[0]?.inputs?.topicScope).toBe('tech');
    expect(expanded[0]?.inputs?.focus).toBe('tech');
    expect(expanded[1]?.inputs?.topicScope).toBe('tech');
    // Idempotent when deps already present
    const again = expandEngineSeedsWithResearchDeps(expanded);
    expect(again.map((s) => s.templateId)).toEqual(expanded.map((s) => s.templateId));
  });

  it('maps execution engines to default simulation children (D-189)', () => {
    const deps = simDependenciesForExecutionEngine('engine_day_trading');
    expect(deps).toEqual([
      { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
      { templateId: 'sim_train_policy_replay', placement: 'post' },
    ]);
    for (const dep of deps) {
      expect(ENGINE_TEMPLATES.some((engine) => engine.id === dep.templateId)).toBe(true);
    }
  });

  it('maps each execution engine to gate + training sim packs (D-189)', () => {
    for (const templateId of [
      'engine_day_trading',
      'engine_crypto',
      'engine_prediction',
      'engine_long_term',
      'engine_hft',
    ] as const) {
      expect(simDependenciesForExecutionEngine(templateId)).toEqual([
        { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
        { templateId: 'sim_train_policy_replay', placement: 'post' },
      ]);
    }
  });

  it('respects DEFAULT_EXECUTION_SIM_COUNT and simCount override (D-189)', () => {
    expect(DEFAULT_EXECUTION_SIM_COUNT).toBe(2);
    expect(simDependenciesForExecutionEngine('engine_day_trading', 0)).toEqual([]);
    expect(simDependenciesForExecutionEngine('engine_day_trading', 1)).toEqual([
      { templateId: 'sim_gate_strategy_spread', placement: 'pre' },
    ]);
    expect(simDependenciesForExecutionEngine('engine_day_trading', 2)).toHaveLength(2);
    expect(simDependenciesForExecutionEngine('engine_day_trading', 99)).toHaveLength(2);
  });

  it('expands create seeds with sim deps after execution seeds (D-189)', () => {
    const expanded = expandEngineSeedsWithSimDeps([{ templateId: 'engine_day_trading', inputs: {} }]);
    expect(expanded.map((s) => s.templateId)).toEqual([
      'engine_day_trading',
      'sim_gate_strategy_spread',
      'sim_train_policy_replay',
    ]);
    expect(expanded[1]).toMatchObject({
      templateId: 'sim_gate_strategy_spread',
      simulationPlacement: 'pre',
      simulationRole: 'gate',
    });
    expect(expanded[2]).toMatchObject({
      templateId: 'sim_train_policy_replay',
      simulationPlacement: 'post',
      simulationRole: 'training',
    });
    const again = expandEngineSeedsWithSimDeps(expanded);
    expect(again.map((s) => s.templateId)).toEqual(expanded.map((s) => s.templateId));
  });

  it('skips sim expansion when simCount is 0 (D-189)', () => {
    const expanded = expandEngineSeedsWithSimDeps(
      [{ templateId: 'engine_hft', inputs: {} }],
      { simCount: 0 },
    );
    expect(expanded).toEqual([{ templateId: 'engine_hft', inputs: {} }]);
  });

  it('execution trading modules use funds_only executionBinding (D-191)', () => {
    const executionIds = [
      'engine_day_trading',
      'engine_crypto',
      'engine_prediction',
      'engine_long_term',
      'engine_hft',
    ] as const;
    for (const id of executionIds) {
      const engine = ENGINE_TEMPLATES.find((entry) => entry.id === id);
      expect(engine).toBeDefined();
      const trading = engine!.modules.find((mod) => mod.type === 'trading');
      expect(trading).toBeDefined();
      expect((trading!.config as { executionBinding?: { routingMode?: string } }).executionBinding)
        .toEqual({ routingMode: 'funds_only' });
    }
  });

  it('gates engine_prediction until dedicated prediction strategy families seed (D-191)', () => {
    const prediction = ENGINE_TEMPLATES.find((engine) => engine.id === 'engine_prediction');
    expect(prediction?.available).toBe(false);
    expect(prediction?.unavailableReason).toMatch(/prediction/i);
    expect(prediction?.unavailableReason).toMatch(/strategy famil/i);
    const trading = prediction?.modules.find((mod) => mod.type === 'trading');
    // Interim reversion+RV palette (D-207) — still gated until dedicated prediction families.
    expect((trading?.config as { strategyFamilies?: string[] }).strategyFamilies).toEqual([
      'strat-005',
      'strat-008',
    ]);
  });

  it('every research to_desk_stream analyzer has a distinct streamDescriptor (D-191)', () => {
    const descriptors = new Set<string>();
    for (const engine of ENGINE_TEMPLATES) {
      for (const mod of engine.modules) {
        if (mod.type !== 'analyzer') continue;
        const config = mod.config as { emitMode?: string; streamDescriptor?: string };
        if (config.emitMode !== 'to_desk_stream') continue;
        expect(config.streamDescriptor, `${engine.id}/${mod.name}`).toBeTruthy();
        expect(descriptors.has(config.streamDescriptor!)).toBe(false);
        descriptors.add(config.streamDescriptor!);
      }
    }
  });

  it('sim_gate_strategy_spread uses day-horizon strategy families (D-191)', () => {
    const gate = ENGINE_TEMPLATES.find((engine) => engine.id === 'sim_gate_strategy_spread');
    const trading = gate?.modules.find((mod) => mod.type === 'trading');
    expect((trading?.config as { strategyFamilies?: string[] }).strategyFamilies).toEqual([
      'strat-001',
      'strat-002',
      'strat-005',
    ]);
  });

  it('allows Engine Data Hub link pairs (D-140)', () => {
    expect(allowedLinkKinds('library', 'library')).toEqual(['data_feed']);
    expect(allowedLinkKinds('library', 'trading')).toEqual(['data_feed']);
    expect(allowedLinkKinds('trading', 'library')).toEqual(['data_feed']);
    expect(allowedLinkKinds('policy', 'library')).toEqual(
      expect.arrayContaining(['verification', 'data_feed']),
    );
  });

  it('parses LibraryModuleConfig engine data hub fields (D-140)', () => {
    const parsed = LibraryModuleConfig.parse({
      topicScope: 'engine:data_hub',
      libraryClass: 'engine_data_hub',
      engineDataHub: true,
      ownerEngineInstanceId: '11111111-1111-4111-8111-111111111111',
      nestedModuleIds: ['22222222-2222-4222-8222-222222222222'],
    });
    expect(parsed.engineDataHub).toBe(true);
    expect(parsed.libraryClass).toBe('engine_data_hub');
    expect(moduleFunctionLabel('library', parsed)).toBe('DataHub');
    expect(isEngineDataHubConfig(parsed)).toBe(true);
  });

  it('default sim templates ship dual hub feed analyzers (D-216)', () => {
    for (const id of [
      'sim_gate_strategy_spread',
      'sim_train_policy_replay',
      'sim_adhoc_paper_desk',
    ] as const) {
      const tpl = ENGINE_TEMPLATES.find((engine) => engine.id === id);
      expect(tpl).toBeDefined();
      const analyzers = (tpl?.modules ?? []).filter((mod) => mod.type === 'analyzer');
      expect(analyzers.length).toBeGreaterThanOrEqual(2);
      const classes = new Set(
        analyzers.map(
          (mod) => (mod.config as { hubFeedClass?: string }).hubFeedClass,
        ),
      );
      expect(classes.has('direct')).toBe(true);
      expect(classes.has('analyzed')).toBe(true);
    }
  });

  it('parses LibraryModuleConfig compound shelf fields (D-216)', () => {
    const parsed = LibraryModuleConfig.parse({
      topicScope: 'engine:data_hub',
      libraryClass: 'engine_data_hub',
      engineDataHub: true,
      shelves: [{ origin: 'research_in', stream: 'semantic' }],
      shelfOutputs: [
        {
          origin: 'research_in',
          stream: 'semantic',
          bus: 'data_out',
          enabled: true,
        },
      ],
      topicFeed: { enabled: true },
    });
    expect(parsed.shelves).toHaveLength(1);
    expect(parsed.shelfOutputs?.[0]?.enabled).toBe(true);
    expect(parsed.topicFeed?.enabled).toBe(true);
  });
});
