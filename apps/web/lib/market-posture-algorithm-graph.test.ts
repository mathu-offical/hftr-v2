import { describe, expect, it } from 'vitest';
import type { MarketHubModelHydration } from '@hftr/contracts';
import { buildMarketPostureAlgorithmGraph } from './market-posture-algorithm-graph';

const hydration: MarketHubModelHydration = {
  liveSources: [
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
  ],
  librarySources: [
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
  ],
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

describe('buildMarketPostureAlgorithmGraph (D-147)', () => {
  it('includes live + library sources with operation and amount on every node', () => {
    const graph = buildMarketPostureAlgorithmGraph({ hydration });
    const live = graph.nodes.filter((n) => n.data.nodeRole === 'live_source');
    const libs = graph.nodes.filter((n) => n.data.nodeRole === 'library_source');
    const stages = graph.nodes.filter((n) => n.data.nodeRole === 'stage');

    expect(live).toHaveLength(2);
    expect(libs).toHaveLength(1);
    expect(stages).toHaveLength(13);

    for (const n of graph.nodes) {
      expect(n.data.operation.length).toBeGreaterThan(0);
      expect(n.data.amount.length).toBeGreaterThan(0);
      expect(n.data.amount).not.toBe('pending');
    }

    expect(graph.edges.some((e) => e.source === 'live:alpaca_bars')).toBe(true);
    expect(graph.edges.some((e) => e.target === 'gather' && e.source.startsWith('lib:'))).toBe(
      true,
    );
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
