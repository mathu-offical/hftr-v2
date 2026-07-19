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
    expect(steps.some((s) => s.transform.includes('seal') || s.valueLabel.includes('seal'))).toBe(
      true,
    );
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

  it('traces day plan into counts not statuses', () => {
    const hub = emptyHub();
    hub.movers = {
      ...hub.movers,
      status: 'ready',
      items: [
        {
          symbolOrSector: 'AAPL',
          headline: 'up',
          directionBand: 'high',
          strengthBand: 'high',
        },
      ],
    };
    const steps = buildStageNodeNumberFlow('day', hub);
    expect(steps.find((s) => s.id === 'day-move')?.valueLabel).toBe('1');
  });
});
