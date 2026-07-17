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
  CompanyLlmPolicy,
  DEFAULT_TIER_MODELS,
  lookupModelCapability,
  MODEL_CAPABILITY_REGISTRY,
} from './llm';
import { ConceptBatch, ResearchDirective } from './research-artifacts';
import { leakLint } from './leak-lint';
import {
  allowedLinkKinds,
  CapitalAllocationInput,
  CreateModuleInput,
  deriveGeneratedModuleName,
  handleIdForLink,
  isLegalFundRoute,
  LINK_KIND_ORDER,
  linkKindForHandlePair,
  missingModuleSetupFields,
  moduleRequiresMath,
  MODULE_CONFIG_SCHEMAS,
  moduleLinkPorts,
  ModuleType,
  requiredModuleSetupFields,
  UpdateModuleInput,
} from './modules';
import { ValueRefHandle, CalcRequest } from './numeric';
import { ActionInstruction } from './pipeline';
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
  splitAllocationValues,
  UpdateEngineInstanceInput,
  withDefaultEngineSetup,
} from './engines';
import { COMPANY_TEMPLATES, ENGINE_TEMPLATES } from './templates';
import {
  CANVAS_LAYOUT,
  LAYOUT_COLUMN_STEP,
  LAYOUT_ROW_STEP,
  layoutCanvas,
  rankEngineMembers,
  reflowEngineAtOrigin,
} from './canvas-layout';

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
      outbound: ['data_feed', 'directive'],
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
});

describe('generated module names', () => {
  const mathBase = 'Deterministic Math Calculator';

  it('keeps math names stable without neighbor suffixes', () => {
    expect(
      deriveGeneratedModuleName({
        type: 'math',
        baseName: mathBase,
        inboundNames: ['Paper Seed Holding Fund'],
        outboundNames: ['Fund Router'],
      }),
    ).toBe(mathBase);
  });

  it('returns base only when disconnected', () => {
    expect(
      deriveGeneratedModuleName({
        type: 'trading',
        baseName: 'Paper Day-Trade Execution',
        inboundNames: [],
        outboundNames: ['  ', ''],
      }),
    ).toBe('Paper Day-Trade Execution');
  });

  it('deduplicates, sorts, and formats inbound/outbound neighbor context', () => {
    expect(
      deriveGeneratedModuleName({
        type: 'trading',
        baseName: 'Paper Day-Trade Execution',
        inboundNames: ['  Fund B ', 'Trend Alpha', 'Trend Alpha', 'Fund A'],
        outboundNames: ['Policy', 'Analyzer'],
      }),
    ).toBe('Paper Day-Trade Execution ← Fund A · Fund B · Trend Alpha → Analyzer · Policy');
  });

  it('caps generated names at 80 characters', () => {
    const longInbound = Array.from({ length: 6 }, (_, index) => `Upstream Module ${index + 1}`);
    const derived = deriveGeneratedModuleName({
      type: 'trading',
      baseName: 'Paper Day-Trade Execution',
      inboundNames: longInbound,
      outboundNames: [],
    });
    expect(derived.length).toBeLessThanOrEqual(80);
    expect(derived.startsWith('Paper Day-Trade Execution ← ')).toBe(true);
  });

  it('is deterministic for the same neighbor inputs', () => {
    const input = {
      type: 'trend' as const,
      baseName: 'Market Trend Scanner',
      inboundNames: ['Research Hub', 'Live API Feed'],
      outboundNames: ['Paper Day-Trade Execution'],
    };
    expect(deriveGeneratedModuleName(input)).toBe(deriveGeneratedModuleName(input));
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
});

describe('Libraries and research graph (M2)', () => {
  it('parses CreateLibraryInput and ResearchGraphResponse', async () => {
    const { CreateLibraryInput, ResearchGraphResponse, CurationStatus } =
      await import('./libraries');
    expect(
      CreateLibraryInput.parse({ name: 'Semiconductors', topicScope: 'chips' }).masterLibrary,
    ).toBe(false);
    expect(CurationStatus.options).toContain('proposed');
    const graph = ResearchGraphResponse.parse({
      nodes: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          moduleId: '22222222-2222-2222-2222-222222222222',
          title: 'Supply',
          body: 'Qualitative note',
          tags: ['chips'],
          sourceClass: 'deterministic_placeholder',
          status: 'active',
        },
      ],
      links: [],
      tags: ['chips'],
    });
    expect(graph.nodes).toHaveLength(1);
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
    expect(bounds.y + bounds.height).toBeGreaterThan(
      mathPos.y + CANVAS_LAYOUT.mathToolHeight,
    );
  });

  it('uses owner/tool envelopes for vertical row spacing', () => {
    expect(LAYOUT_ROW_STEP).toBe(
      CANVAS_LAYOUT.moduleHeight +
        CANVAS_LAYOUT.mathAttachmentGap +
        CANVAS_LAYOUT.mathToolHeight +
        CANVAS_LAYOUT.verticalGutter,
    );
  });

  it('ranks members downstream from their producers', () => {
    const a = '00000000-0000-4000-8000-0000000000a1';
    const b = '00000000-0000-4000-8000-0000000000a2';
    const c = '00000000-0000-4000-8000-0000000000a3';
    const modulesById = new Map([a, b, c].map((id) => [id, mkModule(id)]));
    const ranked = rankEngineMembers([a, b, c], modulesById, [
      { fromModuleId: a, toModuleId: b, linkKind: 'data_feed' },
      { fromModuleId: b, toModuleId: c, linkKind: 'data_feed' },
    ]);
    const rankOf = (id: string) => ranked.find((r) => r.id === id)!.rank;
    expect(rankOf(a)).toBe(0);
    expect(rankOf(b)).toBe(1);
    expect(rankOf(c)).toBe(2);
  });

  it('aligns producers with their specific consumers (barycenter crossing reduction)', () => {
    // p (id a1) → y (id b2); q (id a2) → x (id b1). Pure id ordering would place
    // x above y and cross the edges. Connection-aware ordering must instead put
    // each producer in the same row as the consumer it feeds.
    const p = '00000000-0000-4000-8000-0000000000a1';
    const q = '00000000-0000-4000-8000-0000000000a2';
    const x = '00000000-0000-4000-8000-0000000000b1';
    const y = '00000000-0000-4000-8000-0000000000b2';
    const modulesById = new Map([p, q, x, y].map((id) => [id, mkModule(id)]));
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

  it('reflows an engine preserving its origin with connection-safe spacing', () => {
    const a = '00000000-0000-4000-8000-0000000000c1';
    const b = '00000000-0000-4000-8000-0000000000c2';
    const modules = [mkModule(a), mkModule(b)];
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
    // Downstream node sits one full column to the right.
    expect(posB.x - posA.x).toBe(LAYOUT_COLUMN_STEP);
  });

  it('lays out multiple engines side by side without overlap', () => {
    const a = '00000000-0000-4000-8000-0000000000d1';
    const b = '00000000-0000-4000-8000-0000000000d2';
    const engineTwo = '00000000-0000-4000-8000-00000000e002';
    const modules = [
      { ...mkModule(a), engineInstanceId: engineId },
      { ...mkModule(b), engineInstanceId: engineTwo },
    ];
    const result = layoutCanvas(
      [
        { id: engineId, memberModuleIds: [a] },
        { id: engineTwo, memberModuleIds: [b] },
      ],
      modules,
      [],
      ENGINE_GROUP_PADDING,
    );
    const [first, second] = result.engines;
    expect(second!.canvasBounds.x).toBeGreaterThanOrEqual(
      first!.canvasBounds.x + first!.canvasBounds.width,
    );
  });
});
