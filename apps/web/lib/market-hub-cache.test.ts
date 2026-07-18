import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketHubResponse } from '@hftr/contracts';
import {
  invalidateMarketHub,
  loadMarketHub,
  marketHubAgeMs,
  peekMarketHub,
} from './market-hub-cache';

function stubHub(partial?: Partial<MarketHubResponse>): MarketHubResponse {
  return {
    sectorFocuses: [],
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
      verifiedAt: null,
      expiresAt: null,
      reportConceptId: null,
    },
    reports: [],
    watchlists: [],
    trendCandidates: [],
    positions: [],
    pipeline: [],
    freshness: { moversExpiresAt: null, fetchedAt: '2026-07-18T00:00:00.000Z' },
    sources: {
      lanes: [],
      contributedKinds: [],
      markFeedClass: 'synthetic',
      scannedAt: null,
    },
    ...partial,
  };
}

describe('market-hub-cache', () => {
  const key = { companyId: '00000000-0000-4000-8000-000000000001' };

  beforeEach(() => {
    invalidateMarketHub(key);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateMarketHub(key);
  });

  it('serves fresh cache without calling fetcher', async () => {
    const fetcher = vi.fn(async () => stubHub());
    await loadMarketHub(key, fetcher, { force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    const again = await loadMarketHub(key, fetcher, { force: false });
    expect(again.fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekMarketHub(key)?.equity.status).toBe('unavailable');
  });

  it('revalidates in background when stale but within staleMs', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(stubHub({ sectorFocuses: ['a'] }))
      .mockResolvedValueOnce(stubHub({ sectorFocuses: ['b'] }));

    await loadMarketHub(key, fetcher, { force: true });
    vi.advanceTimersByTime(16_000);

    const mid = await loadMarketHub(key, fetcher, { force: false, allowStale: true });
    expect(mid.fromCache).toBe(true);
    expect(mid.data.sectorFocuses).toEqual(['a']);

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(peekMarketHub(key)?.sectorFocuses).toEqual(['b']);
    expect(marketHubAgeMs(key)).toBeTypeOf('number');
  });

  it('dedupes concurrent force loads', async () => {
    let resolve!: (v: MarketHubResponse) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<MarketHubResponse>((r) => {
          resolve = r;
        }),
    );

    const p1 = loadMarketHub(key, fetcher, { force: true });
    const p2 = loadMarketHub(key, fetcher, { force: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(stubHub());
    await Promise.all([p1, p2]);
    expect(peekMarketHub(key)).not.toBeNull();
  });
});
