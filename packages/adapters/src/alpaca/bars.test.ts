import { describe, expect, it } from 'vitest';
import { createAlpacaClient } from './client';
import { BarsFetchError, fetchBars } from './bars';

describe('fetchBars', () => {
  it('fetches and maps OHLC bars with honest feedClass', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      expect(u).toContain('/v2/stocks/AAPL/bars');
      expect(u).toContain('timeframe=1Min');
      expect(u).toContain('limit=30');
      expect(u).toContain('feed=iex');
      expect(init?.method ?? 'GET').toBe('GET');
      const headers = new Headers(init?.headers);
      expect(headers.get('APCA-API-KEY-ID')).toBe('PKTESTKEY1');
      expect(headers.get('APCA-API-SECRET-KEY')).toBe('secret-test');

      return new Response(
        JSON.stringify({
          bars: [
            {
              t: '2026-07-17T14:00:00Z',
              o: 150,
              h: 151,
              l: 149.5,
              c: 150.5,
              v: 1200,
            },
            {
              t: '2026-07-17T14:01:00Z',
              o: 150.5,
              h: 152,
              l: 150.25,
              c: 151.75,
              v: 980,
            },
          ],
          symbol: 'AAPL',
        }),
        { status: 200, headers: { 'X-Request-ID': 'req-bars-1' } },
      );
    };

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await fetchBars({
      symbol: 'aapl',
      limit: 30,
      credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
      client,
    });

    expect(result.symbol).toBe('AAPL');
    expect(result.feedClass).toBe('alpaca_iex_paper');
    expect(result.requestId).toBe('req-bars-1');
    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]).toEqual({
      timestamp: '2026-07-17T14:00:00Z',
      open: 150,
      high: 151,
      low: 149.5,
      close: 150.5,
      volume: 1200,
    });
  });

  it('throws BarsFetchError when the API rejects the request', async () => {
    const fetchImpl = async () => new Response('forbidden', { status: 403 });

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      fetchBars({
        symbol: 'AAPL',
        limit: 10,
        credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
        client,
      }),
    ).rejects.toBeInstanceOf(BarsFetchError);
  });

  it('returns empty bars array when API responds with no bars', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ bars: null, symbol: 'AAPL' }), { status: 200 });

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await fetchBars({
      symbol: 'AAPL',
      limit: 5,
      credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
      client,
    });
    expect(result.bars).toEqual([]);
  });
});
