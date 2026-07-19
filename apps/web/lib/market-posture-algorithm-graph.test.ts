import { describe, expect, it } from 'vitest';
import type { MarketHubModelHydration } from '@hftr/contracts';
import {
  buildLibraryProcessingFlows,
  buildLiveProcessingFlows,
} from './market-hub-processing-flows';
import { buildMarketPostureAlgorithmGraph } from './market-posture-algorithm-graph';

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

const hydration: MarketHubModelHydration = {
  liveSources,
  librarySources,
  processingFlows,
  stageOps: [
    {
      stageId: 'providers',
      operation: 'entitle lanes',
      amount: '1/2 ready',
    },
    {
      stageId: 'gather',
      operation: 'pull evidence',
      amount: '1 sealed · 8 lenses',
    },
    {
      stageId: 'thresholds',
      operation: 'LLM presets',
      amount: 'ints only',
    },
    {
      stageId: 'defaults',
      operation: 'fail-closed',
      amount: 'typical band',
    },
    {
      stageId: 'universe',
      operation: 'build set',
      amount: '3 seeds',
    },
    {
      stageId: 'rs',
      operation: 'score marks',
      amount: '2 live · 1 synth',
    },
    {
      stageId: 'rank',
      operation: 'compound rank',
      amount: '5 board',
    },
    {
      stageId: 'verify',
      operation: 'promote gates',
      amount: '2 watch',
    },
    {
      stageId: 'seal_movers',
      operation: 'seal stock',
      amount: '5 items',
    },
    {
      stageId: 'sector',
      operation: 'seal news',
      amount: '4 items',
    },
    {
      stageId: 'daily',
      operation: 'phase rollup',
      amount: 'calendar',
    },
    {
      stageId: 'narrative',
      operation: 'book↔tape',
      amount: '1 held',
    },
    {
      stageId: 'hub_ready',
      operation: 'project hub',
      amount: '2+1 src',
    },
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
};

describe('buildLiveProcessingFlows (D-156)', () => {
  it('splits alpaca_bars into entitlement vs OHLC→RS adapters', () => {
    const flows = buildLiveProcessingFlows(liveSources);
    const alpaca = flows.filter((f) => f.kind === 'alpaca_bars');
    expect(alpaca.map((f) => f.id)).toEqual(['alpaca_bars:entitle', 'alpaca_bars:ohlc']);
    expect(alpaca[1]?.analysisRoles).toContain('relative_strength');
    expect(alpaca[1]?.targetStages).toContain('rs');
    expect(alpaca[0]?.targetStages).not.toContain('rs');
  });

  it('routes GDELT into gather + movers/sector pipelines', () => {
    const gdelt = buildLiveProcessingFlows(liveSources).find((f) => f.kind === 'gdelt_news');
    expect(gdelt?.adapterLabel).toMatch(/GDELT/i);
    expect(gdelt?.pipelines).toEqual(['movers', 'sector']);
    expect(gdelt?.targetStages).toContain('gather');
    expect(gdelt?.targetStages).toContain('sector');
  });
});

describe('buildMarketPostureAlgorithmGraph (D-147 / D-156)', () => {
  it('wires live → adapter → distinctive stages (not all → providers)', () => {
    const graph = buildMarketPostureAlgorithmGraph({ hydration });
    const live = graph.nodes.filter((n) => n.data.nodeRole === 'live_source');
    const adapters = graph.nodes.filter((n) => n.data.nodeRole === 'adapter');
    const libs = graph.nodes.filter((n) => n.data.nodeRole === 'library_source');
    const stages = graph.nodes.filter((n) => n.data.nodeRole === 'stage');

    expect(live).toHaveLength(2);
    expect(libs).toHaveLength(1);
    expect(stages).toHaveLength(13);
    expect(adapters.length).toBeGreaterThanOrEqual(3);

    for (const n of graph.nodes) {
      expect(n.data.operation.length).toBeGreaterThan(0);
      expect(n.data.amount.length).toBeGreaterThan(0);
      expect(n.data.amount).not.toBe('pending');
    }

    // Alpaca: live → adapters (entitle + ohlc), ohlc → rs
    expect(graph.edges.some((e) => e.source === 'live:alpaca_bars' && e.target.startsWith('adapter:'))).toBe(
      true,
    );
    expect(
      graph.edges.some(
        (e) => e.source === 'adapter:alpaca_bars:ohlc' && e.target === 'rs',
      ),
    ).toBe(true);
    expect(
      graph.edges.some(
        (e) => e.source === 'adapter:gdelt_news:headline' && e.target === 'gather',
      ),
    ).toBe(true);
    // Library goes through Jaccard adapter, not directly into gather.
    expect(
      graph.edges.some((e) => e.source.startsWith('lib:') && e.target.startsWith('adapter:')),
    ).toBe(true);
    expect(
      graph.edges.some(
        (e) =>
          e.source.startsWith('adapter:library:') &&
          (e.target === 'thresholds' || e.target === 'rank' || e.target === 'seal_movers'),
      ),
    ).toBe(true);
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
