import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketHubResponse } from '@hftr/contracts';
import { invalidateMarketHub, peekMarketHub, putMarketHubSnapshot } from './market-hub-cache';
import {
  acquireMarketHubLivePoll,
  beginMarketHubAnalyze,
  endMarketHubAnalyze,
  isMarketHubAnalyzeBusy,
} from './market-hub-live-runtime';

vi.mock('./client', () => ({
  api: vi.fn(),
}));

import { api } from './client';

const companyId = '11111111-1111-4111-8111-111111111111';
const key = { companyId };

function stubHub(): MarketHubResponse {
  return {
    sectorFocuses: [],
    universeExcludes: [],
    equity: {
      status: 'unavailable',
      equityCents: null,
      asOfIso: null,
      version: 0,
      series: [],
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
    },
    reports: [],
    watchlists: [],
    trendCandidates: [],
    positions: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        moduleId: '33333333-3333-4333-8333-333333333333',
        moduleName: 'Desk',
        symbol: 'AAPL',
        qty: '1',
        avgCostCents: 10000,
        markCents: 10000,
        unrealizedPnlCents: '0',
        engines: [],
        updatedAt: '2026-07-18T00:00:00.000Z',
        viz: {
          symbol: 'AAPL',
          spark: {
            points: [{ t: '2026-07-18T00:00:00.000Z', valueCents: '10000' }],
            feedClass: 'synthetic_sim',
          },
          direction: 'flat',
          strengthBand: 'medium',
          strengthTicks: 2,
          relevanceBand: 'medium',
          heldVsCost: 'flat',
          markCents: 10000,
          avgCostCents: 10000,
          unrealizedPnlCents: '0',
        },
      },
    ],
    pipeline: [],
    capitalSources: [],
    freshness: { moversExpiresAt: null, fetchedAt: '2026-07-18T00:00:00.000Z' },
    sources: {
      lanes: [],
      contributedKinds: [],
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
  };
}

describe('market-hub-live-runtime', () => {
  beforeEach(() => {
    invalidateMarketHub(key);
    putMarketHubSnapshot(key, stubHub());
    vi.useFakeTimers();
    vi.mocked(api).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateMarketHub(key);
  });

  it('ref-counts to a single interval and pauses during Analyze', async () => {
    vi.mocked(api).mockResolvedValue({
      fetchedAt: '2026-07-18T00:00:15.000Z',
      equity: {
        status: 'fresh',
        equityCents: '200',
        asOfIso: '2026-07-18T00:00:15.000Z',
        version: 2,
        series: [],
      },
      positions: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          symbol: 'AAPL',
          qty: '1',
          avgCostCents: 10000,
          markCents: 11000,
          unrealizedPnlCents: '1000',
          viz: {
            symbol: 'AAPL',
            spark: {
              points: [{ t: '2026-07-18T00:00:15.000Z', valueCents: '11000' }],
              feedClass: 'synthetic_sim',
            },
            direction: 'up',
            strengthBand: 'medium',
            strengthTicks: 2,
            relevanceBand: 'medium',
            heldVsCost: 'up',
            markCents: 11000,
            avgCostCents: 10000,
            unrealizedPnlCents: '1000',
          },
        },
      ],
    });

    const releaseA = acquireMarketHubLivePoll(companyId);
    const releaseB = acquireMarketHubLivePoll(companyId);

    beginMarketHubAnalyze(companyId);
    expect(isMarketHubAnalyzeBusy(companyId)).toBe(true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(api).not.toHaveBeenCalled();

    endMarketHubAnalyze(companyId);
    expect(isMarketHubAnalyzeBusy(companyId)).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(`/api/companies/${companyId}/market-hub/live`);

    expect(peekMarketHub(key)?.positions[0]?.markCents).toBe(11000);

    releaseA();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(api).toHaveBeenCalledTimes(2);

    releaseB();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
