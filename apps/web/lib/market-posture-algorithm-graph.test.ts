import { describe, expect, it } from 'vitest';
import type { MarketHubModelHydration } from '@hftr/contracts';
import {
  buildLibraryProcessingFlows,
  buildLiveProcessingFlows,
  buildProcessStepsFromFlows,
  buildSharedCompoundProcessSteps,
} from './market-hub-processing-flows';
import {
  buildMarketPostureAlgorithmGraph,
  collectModelPulseIds,
  resolveModelEdgeState,
} from './market-posture-algorithm-graph';

const liveSources: MarketHubModelHydration['liveSources'] = [
  {
    kind: 'alpaca_bars',
    label: 'Alpaca bars',
    domain: 'market',
    status: 'ready',
    authMode: 'broker_paper',
    canvasBoundCount: 1,
    contributed: true,
    operation: 'hydrate · sealed',
    amount: '1 canvas · contrib',
  },
  {
    kind: 'gdelt_news',
    label: 'GDELT news',
    domain: 'news',
    status: 'missing_key',
    authMode: 'research_key',
    canvasBoundCount: 0,
    contributed: false,
    operation: 'need key',
    amount: '0 canvas',
  },
];

const librarySources: MarketHubModelHydration['librarySources'] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'System movers',
    topicScope: 'system:movers',
    shelf: 'system',
    conceptCount: 10,
    admittedCount: 8,
    operation: 'system corpus',
    amount: '8 adm / 10 concepts',
  },
];

const processingFlows = [
  ...buildLiveProcessingFlows(liveSources),
  ...librarySources.flatMap((lib) =>
    buildLibraryProcessingFlows({
      libraryId: lib.id,
      name: lib.name,
      admittedCount: lib.admittedCount,
      shelf: lib.shelf,
    }),
  ),
];

const processSteps = [
  ...buildProcessStepsFromFlows(processingFlows),
  ...buildSharedCompoundProcessSteps({
    liveReady: 1,
    liveTotal: 2,
    moversItemCount: 5,
    newsItemCount: 4,
    watchlistCount: 2,
    positionCount: 1,
    admittedConcepts: 8,
    usedLiveMarks: 2,
    syntheticMarks: 1,
  }),
];

const hydration: MarketHubModelHydration = {
  liveSources,
  librarySources,
  capitalSources: [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      name: 'Company pool',
      tier: 'company_root',
      kind: 'company_pool',
      operation: 'root fund',
      amount: '$10000.00',
      status: 'configured',
    },
  ],
  processingFlows,
  processSteps,
  stageOps: [
    { stageId: 'providers', operation: 'entitle lanes', amount: '1/2 ready' },
    { stageId: 'gather', operation: 'pull evidence', amount: '1 sealed · 8 lenses' },
    { stageId: 'thresholds', operation: 'LLM presets', amount: 'ints only' },
    { stageId: 'defaults', operation: 'fail-closed', amount: 'typical band' },
    { stageId: 'universe', operation: 'build set', amount: '3 seeds' },
    { stageId: 'rs', operation: 'score marks', amount: '2 live · 1 synth' },
    { stageId: 'rank', operation: 'compound rank', amount: '5 board' },
    { stageId: 'verify', operation: 'promote gates', amount: '2 watch' },
    { stageId: 'seal_movers', operation: 'seal stock', amount: '5 items' },
    { stageId: 'sector', operation: 'seal news', amount: '4 items' },
    { stageId: 'daily', operation: 'phase rollup', amount: 'calendar' },
    { stageId: 'narrative', operation: 'book↔tape', amount: '1 held' },
    { stageId: 'hub_ready', operation: 'project hub', amount: '2+1 src' },
  ],
  totals: {
    liveReady: 1,
    liveTotal: 2,
    libraryCount: 1,
    admittedConcepts: 8,
    contributedKinds: 1,
    usedLiveMarks: 2,
    syntheticMarks: 1,
  },
  asOfIso: '2026-07-19T05:00:00.000Z',
  livePatchedAt: null,
  sealStamps: {
    moversVerifiedAt: '2026-07-19T04:59:00.000Z',
    moversExpiresAt: '2026-07-19T06:00:00.000Z',
    newsVerifiedAt: null,
    newsExpiresAt: null,
    dailyExpiresAt: null,
  },
  panelSurfaces: [
    {
      id: 'positions',
      label: 'Open positions',
      panel: 'rail',
      status: 'ready',
      operation: 'rail inventory',
      amount: '1 open',
      sourceStageId: 'narrative',
      updatedAt: '2026-07-19T05:00:00.000Z',
      capitalBearing: true,
    },
    {
      id: 'capital',
      label: 'Funds outline',
      panel: 'rail',
      status: 'ready',
      operation: 'rail funds',
      amount: '$10000.00 · 0 desk',
      sourceStageId: 'hub_ready',
      updatedAt: '2026-07-19T05:00:00.000Z',
      capitalBearing: true,
    },
    {
      id: 'movers',
      label: 'Stock movers',
      panel: 'overlay',
      status: 'ready',
      operation: 'seal board',
      amount: '5 items',
      sourceStageId: 'seal_movers',
      updatedAt: '2026-07-19T04:59:00.000Z',
      capitalBearing: false,
    },
  ],
};

describe('resolveModelEdgeState (D-160)', () => {
  it('marks blocked when source missing key', () => {
    expect(
      resolveModelEdgeState({
        edgeType: 'adapt',
        sourceBlocked: true,
        sourceReady: false,
      }),
    ).toEqual({ activation: 'blocked', status: 'blocked' });
  });

  it('marks active when target stage is running', () => {
    expect(
      resolveModelEdgeState({
        edgeType: 'pipeline',
        sourceStageStatus: 'succeeded',
        targetStageStatus: 'running',
      }),
    ).toEqual({ activation: 'active', status: 'running' });
  });

  it('pulses when requested', () => {
    expect(
      resolveModelEdgeState({
        edgeType: 'hydrate',
        sourceReady: true,
        pulsed: true,
      }).activation,
    ).toBe('pulsing');
  });
});

describe('buildLiveProcessingFlows (D-156 / D-162)', () => {
  it('splits alpaca_bars into entitlement vs OHLC→RS adapters with processStepIds', () => {
    const flows = buildLiveProcessingFlows(liveSources);
    const alpaca = flows.filter((f) => f.kind === 'alpaca_bars');
    expect(alpaca.map((f) => f.id)).toEqual(['alpaca_bars:entitle', 'alpaca_bars:ohlc']);
    expect(alpaca[0]?.route).toBe('bars_entitle');
    expect(alpaca[1]?.route).toBe('bars_ohlc');
    expect(alpaca[1]?.processStepIds).toContain('alpaca_bars:rs');
    expect(alpaca[1]?.analysisRoles).toContain('relative_strength');
    expect(alpaca[1]?.targetStages).toContain('rs');
  });
});

describe('buildMarketPostureAlgorithmGraph (D-147 / D-156 / D-160 / D-162 / D-163)', () => {
  it('wires typed edges with activation/status/track and granular process nodes', () => {
    const graph = buildMarketPostureAlgorithmGraph({
      hydration,
      nowMs: Date.parse('2026-07-19T05:00:30.000Z'),
    });
    expect(graph.tracks.map((t) => t.id)).toContain('compound');
    expect(graph.asOfIso).toBe(hydration.asOfIso);

    for (const e of graph.edges) {
      expect(e.data.edgeType).toBeTruthy();
      expect(e.data.activation).toBeTruthy();
      expect(e.data.status).toBeTruthy();
      expect(e.data.track).toBeTruthy();
    }
    for (const n of graph.nodes) {
      expect(n.data.layer).toBeTruthy();
      expect(n.data.track).toBeTruthy();
    }

    // D-163: missing_key GDELT is omitted; alpaca ready remains
    expect(graph.nodes.some((n) => n.id === 'live:gdelt_news')).toBe(false);
    expect(graph.nodes.some((n) => n.id === 'live:alpaca_bars')).toBe(true);
    expect(graph.nodes.some((n) => n.data.nodeRole === 'capital_source')).toBe(true);
    expect(
      graph.nodes.find((n) => n.data.nodeRole === 'capital_source')?.data.amount,
    ).toBe('$10000.00');
    expect(
      graph.nodes.find((n) => n.id === 'panel:capital')?.data.capitalBearing,
    ).toBe(true);

    const processNodes = graph.nodes.filter((n) => n.data.nodeRole === 'process');
    expect(processNodes.length).toBeGreaterThan(4);
    expect(processNodes.some((n) => n.id === 'process:alpaca_bars:rs')).toBe(true);
    expect(processNodes.some((n) => n.id === 'process:gdelt_news:fetch')).toBe(false);
    expect(processNodes.some((n) => n.id === 'process:shared:universe_build:evidence')).toBe(
      true,
    );

    const ohlcAdapt = graph.edges.find(
      (e) => e.source === 'adapter:alpaca_bars:ohlc' && e.target.startsWith('process:'),
    );
    expect(ohlcAdapt?.data.edgeType).toBe('adapt');
    expect(ohlcAdapt?.data.track).toBe('compound');
    expect(
      graph.edges.some(
        (e) => e.source === 'process:alpaca_bars:volume' && e.target === 'rs',
      ),
    ).toBe(true);

    const pipe = graph.edges.find((e) => e.id === 'e-shared:compound_rank:0');
    expect(pipe?.data.edgeType).toBe('pipeline');

    const panels = graph.nodes.filter((n) => n.data.nodeRole === 'panel_surface');
    expect(panels.length).toBe(3);
    expect(graph.edges.some((e) => e.data.edgeType === 'panel')).toBe(true);

    expect(
      graph.edges.some(
        (e) => e.source === 'adapter:gdelt_news:headline' && e.target === 'gather',
      ),
    ).toBe(false);
  });

  it('omits sector track when no news providers are available (D-163)', () => {
    const graph = buildMarketPostureAlgorithmGraph({
      hydration,
      nowMs: Date.parse('2026-07-19T05:00:30.000Z'),
    });
    expect(graph.tracks.map((t) => t.id)).not.toContain('sector');
    expect(graph.nodes.some((n) => n.id === 'sector')).toBe(false);
    expect(graph.tracks.map((t) => t.id)).toContain('entitle');
    expect(graph.tracks.map((t) => t.id)).toContain('compound');
  });

  it('activates pipeline edges from running stages', () => {
    const graph = buildMarketPostureAlgorithmGraph({
      hydration,
      stages: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          runId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          stageId: 'rs',
          label: 'Rel-strength / volume',
          kind: 'deterministic',
          status: 'running',
          startedAt: '2026-07-19T05:00:10.000Z',
          finishedAt: null,
          summary: 'Scoring 3 live marks',
          justificationLines: [],
          jobId: null,
          sortOrder: 5,
        },
      ],
      nowMs: Date.parse('2026-07-19T05:00:30.000Z'),
    });
    const edge = graph.edges.find((e) => e.id === 'e-uni-rs');
    expect(edge?.data.activation).toBe('active');
    expect(edge?.data.status).toBe('running');
    const rsNode = graph.nodes.find((n) => n.id === 'rs');
    expect(rsNode?.data.activation).toBe('active');
  });

  it('prefers stage summary counts when a run is present', () => {
    const graph = buildMarketPostureAlgorithmGraph({
      hydration,
      stages: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          runId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          stageId: 'gather',
          label: 'Gather evidence',
          kind: 'data',
          status: 'succeeded',
          startedAt: null,
          finishedAt: null,
          summary: 'Gathered 12 usable packages across 4 ready kinds',
          justificationLines: [],
          jobId: null,
          sortOrder: 1,
        },
      ],
    });
    const gather = graph.nodes.find((n) => n.id === 'gather');
    expect(gather?.data.amount).toBe('12 usable');
  });
});

describe('collectModelPulseIds (D-160)', () => {
  it('pulses hydrate edges when asOf changes', () => {
    const ids = collectModelPulseIds({
      prevAsOf: '2026-07-19T05:00:00.000Z',
      nextAsOf: '2026-07-19T05:01:00.000Z',
      prevStageSig: '',
      nextStageSig: '',
      edgeIds: ['e-live:alpaca_bars-adapter:alpaca_bars:ohlc', 'e-rs-rank'],
      stageIds: ['rs'],
    });
    expect(ids.has('e-live:alpaca_bars-adapter:alpaca_bars:ohlc')).toBe(true);
    expect(ids.has('e-rs-rank')).toBe(false);
  });

  it('pulses pipeline edges when stage signature changes', () => {
    const ids = collectModelPulseIds({
      prevAsOf: 'a',
      nextAsOf: 'a',
      prevStageSig: 'rs:queued:',
      nextStageSig: 'rs:running:x',
      edgeIds: ['e-rs-rank', 'e-live:x-adapter:y'],
      stageIds: ['rs'],
    });
    expect(ids.has('rs')).toBe(true);
    expect(ids.has('e-rs-rank')).toBe(true);
  });

  it('pulses panel edges when livePatchedAt changes', () => {
    const ids = collectModelPulseIds({
      prevAsOf: 'a',
      nextAsOf: 'a',
      prevStageSig: '',
      nextStageSig: '',
      prevLivePatchedAt: null,
      nextLivePatchedAt: '2026-07-19T05:02:00.000Z',
      edgeIds: ['e-hub_ready-panel:equity', 'e-rs-rank'],
      stageIds: [],
      panelNodeIds: ['panel:equity'],
    });
    expect(ids.has('panel:equity')).toBe(true);
    expect(ids.has('e-hub_ready-panel:equity')).toBe(true);
    expect(ids.has('e-rs-rank')).toBe(false);
  });
});
