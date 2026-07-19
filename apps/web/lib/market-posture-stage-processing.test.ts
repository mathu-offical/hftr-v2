import { describe, expect, it } from 'vitest';
import type { MarketHubResponse } from '@hftr/contracts';
import { buildStageNodeNumberFlow } from './market-posture-stage-processing';

function emptyHub(): MarketHubResponse {
  return {
    sectorFocuses: [],
    universeExcludes: [],
    equity: {
      status: 'unavailable',
      equityCents: null,
      asOfIso: null,
      version: 0,
      series: [],
      sourceChips: [],
    },
    movers: {
      status: 'missing',
      title: null,
      sealId: null,
      corroborationBand: null,
      items: [],
      itemViz: [],
      verifiedAt: null,
      expiresAt: null,
      reportConceptId: null,
      sourceChips: [],
    },
    reports: [],
    watchlists: [],
    trendCandidates: [],
    positions: [],
    pipeline: [],
    capitalSources: [],
    news: {
      status: 'missing',
      title: null,
      sealId: null,
      corroborationBand: null,
      items: [],
      verifiedAt: null,
      expiresAt: null,
      reportConceptId: null,
      sourceChips: [],
    },
    freshness: {
      fetchedAt: '2026-07-19T12:00:00.000Z',
      moversExpiresAt: null,
      dailyExpiresAt: null,
      sectorExpiresAt: null,
    },
    sources: {
      lanes: [
        {
          kind: 'alpaca_bars',
          domain: 'bars',
          label: 'Alpaca bars',
          authMode: 'broker_paper',
          status: 'ready',
          contributed: true,
        },
      ],
      contributedKinds: ['alpaca_bars'],
      markFeedClass: 'synthetic',
      scannedAt: null,
    },
    charts: {
      allocation: [],
      watchlistTiers: [],
      trendStrength: [],
      moverDirections: [],
      sourceReady: [],
    },
  } as unknown as MarketHubResponse;
}

describe('buildStageNodeNumberFlow', () => {
  it('traces live lanes into numeric/amount readouts', () => {
    const steps = buildStageNodeNumberFlow('live', emptyHub());
    expect(steps.some((s) => s.nodeLabel === 'Alpaca bars')).toBe(true);
    expect(
      steps.some(
        (s) =>
          s.transform.includes('query/filter') ||
          s.transform.includes('normalize') ||
          s.transform.includes('entitle'),
      ),
    ).toBe(true);
    expect(steps.every((s) => !('status' in s && (s as { status?: string }).status === 'ready'))).toBe(
      true,
    );
  });

  it('traces capital equity into a dollar readout', () => {
    const hub = emptyHub();
    hub.equity = {
      ...hub.equity,
      status: 'fresh',
      equityCents: '10000',
      asOfIso: '2026-07-19T12:00:00.000Z',
    };
    const steps = buildStageNodeNumberFlow('capital', hub);
    const equity = steps.find((s) => s.id === 'equity');
    expect(equity?.valueLabel).toBe('$100.00');
    expect(equity?.transform).toContain('ledger');
  });

  it('omits unavailable live lanes and need-key adapters', () => {
    const hub = emptyHub();
    hub.sources = {
      ...hub.sources,
      lanes: [
        {
          kind: 'alpaca_bars',
          domain: 'equity_bars',
          label: 'Alpaca bars',
          authMode: 'broker_paper',
          status: 'ready',
          contributed: false,
        },
        {
          kind: 'newsapi',
          domain: 'news',
          label: 'Market news',
          authMode: 'research_key',
          status: 'missing_key',
          contributed: false,
        },
      ],
      contributedKinds: [],
    };
    hub.modelHydration = {
      liveSources: [
        {
          kind: 'alpaca_bars',
          label: 'Alpaca bars',
          domain: 'equity_bars',
          status: 'ready',
          authMode: 'broker_paper',
          canvasBoundCount: 0,
          contributed: false,
          operation: 'idle',
          amount: '0 canvas',
        },
      ],
      librarySources: [],
      processingFlows: [
        {
          id: 'brave',
          kind: 'brave_web',
          adapterLabel: 'Brave web adapter',
          analysisRoles: ['web_corpus'],
          operation: 'Brave query',
          amount: 'ready',
          route: 'web_search',
          processStepIds: [],
          targetStages: ['gather'],
          pipelines: ['movers'],
          status: 'ready',
          contributed: true,
        },
        {
          id: 'news',
          kind: 'newsapi',
          adapterLabel: 'Market news adapter',
          analysisRoles: ['news_corpus'],
          operation: 'API/DOC pull',
          amount: 'need key',
          route: 'news_headline',
          processStepIds: [],
          targetStages: ['gather'],
          pipelines: ['movers'],
          status: 'missing_key',
          contributed: false,
        },
      ],
      processSteps: [],
      stageOps: [],
      capitalSources: [],
      panelSurfaces: [],
      totals: {
        liveReady: 1,
        liveTotal: 2,
        libraryCount: 0,
        admittedConcepts: 0,
        contributedKinds: 0,
        usedLiveMarks: 0,
        syntheticMarks: 0,
      },
      asOfIso: '2026-07-19T12:00:00.000Z',
      sealStamps: [],
    } as unknown as MarketHubResponse['modelHydration'];
    const steps = buildStageNodeNumberFlow('live', hub);
    expect(steps.some((s) => s.nodeLabel === 'Alpaca bars')).toBe(false);
    expect(steps.some((s) => s.nodeLabel.includes('Market news'))).toBe(false);
    expect(steps.some((s) => s.nodeLabel === 'Brave web adapter')).toBe(true);
  });
});
