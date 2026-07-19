import { describe, expect, it } from 'vitest';
import type { MarketHubResponse } from '@hftr/contracts';
import { buildStageProcessingRows } from './market-posture-stage-processing';

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

describe('buildStageProcessingRows', () => {
  it('surfaces live lane data on live screen', () => {
    const rows = buildStageProcessingRows('live', emptyHub(), null);
    expect(rows.some((r) => r.label === 'Alpaca bars')).toBe(true);
    expect(rows[0]?.kind).toBe('live');
  });

  it('surfaces capital equity row', () => {
    const hub = emptyHub();
    hub.equity = {
      ...hub.equity,
      status: 'fresh',
      equityCents: '10000',
      asOfIso: '2026-07-19T12:00:00.000Z',
    };
    const rows = buildStageProcessingRows('capital', hub, null);
    expect(rows.some((r) => r.id === 'equity' && r.status === 'fresh')).toBe(true);
  });
});
