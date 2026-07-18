import { describe, expect, it, vi } from 'vitest';
import { createFixedClock } from '../clock';
import {
  mapOhlcBarsToCents,
  refreshAtrStreamForCompany,
  type RefreshAtrStreamDeps,
} from './refresh-atr-stream';

describe('mapOhlcBarsToCents', () => {
  it('maps dollar OHLC to integer cents', () => {
    expect(
      mapOhlcBarsToCents([{ high: 150.25, low: 149.5, close: 150.0 }]),
    ).toEqual([{ highCents: 15025, lowCents: 14950, closeCents: 15000 }]);
  });
});

describe('refreshAtrStreamForCompany', () => {
  const clock = createFixedClock(1_750_000_000_000);
  const companyId = '00000000-0000-4000-8000-000000000001';

  const baseDeps = (overrides: Partial<RefreshAtrStreamDeps> = {}): RefreshAtrStreamDeps => ({
    loadOpenPositionSymbols: async () => [
      { symbol: 'AAPL', moduleId: '00000000-0000-4000-8000-000000000002', markCents: 10_000 },
      { symbol: 'MSFT', moduleId: '00000000-0000-4000-8000-000000000003', markCents: 20_000 },
    ],
    loadAlpacaPaperCredentials: async () => ({ keyId: 'paper-key', secret: 'paper-secret' }),
    fetchBars: vi.fn(async ({ symbol }) => ({
      symbol,
      bars: Array.from({ length: 20 }, (_, i) => ({
        timestamp: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        open: 100 + i,
        high: 101 + i,
        low: 99 + i,
        close: 100 + i,
        volume: 1_000,
      })),
      feedClass: 'alpaca_iex_paper',
      requestId: null,
    })),
    resolveAtrCents: vi.fn(async () => ({ atrCents: 50, source: 'bars' as const })),
    ...overrides,
  });

  it('returns zero counts when no open positions', async () => {
    const result = await refreshAtrStreamForCompany({} as never, clock, companyId, {
      loadOpenPositionSymbols: async () => [],
    });
    expect(result).toEqual({ refreshed: 0, skipped: 0 });
  });

  it('skips all symbols when Alpaca paper credentials are unavailable', async () => {
    const result = await refreshAtrStreamForCompany({} as never, clock, companyId, {
      ...baseDeps({ loadAlpacaPaperCredentials: async () => null }),
    });
    expect(result).toEqual({ refreshed: 0, skipped: 2 });
  });

  it('refreshes each distinct symbol via fetchBars and resolveAtrCents', async () => {
    const deps = baseDeps();
    const result = await refreshAtrStreamForCompany({} as never, clock, companyId, deps);

    expect(result).toEqual({ refreshed: 2, skipped: 0 });
    expect(deps.fetchBars).toHaveBeenCalledTimes(2);
    expect(deps.fetchBars).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'AAPL',
        limit: 30,
        timeframe: '1Day',
        credentials: { keyId: 'paper-key', secret: 'paper-secret' },
      }),
    );
    expect(deps.resolveAtrCents).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        symbol: 'MSFT',
        markCents: 20_000,
        bars: expect.arrayContaining([
          expect.objectContaining({ highCents: expect.any(Number) }),
        ]),
      }),
    );
  });

  it('swallows per-symbol fetch errors and counts them as skipped', async () => {
    const fetchBars = vi.fn(async ({ symbol }: { symbol: string }) => {
      if (symbol === 'AAPL') {
        throw new Error('bars_fetch_failed');
      }
      return {
        symbol,
        bars: Array.from({ length: 20 }, () => ({
          timestamp: '2026-01-01T00:00:00Z',
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1,
        })),
        feedClass: 'alpaca_iex_paper',
        requestId: null,
      };
    });

    const result = await refreshAtrStreamForCompany(
      {} as never,
      clock,
      companyId,
      baseDeps({ fetchBars }),
    );

    expect(result).toEqual({ refreshed: 1, skipped: 1 });
  });
});
