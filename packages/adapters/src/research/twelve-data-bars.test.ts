import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { gatherTwelveDataBarsEvidence, TwelveDataBarsError } from './twelve-data-bars';

describe('gatherTwelveDataBarsEvidence', () => {
  it('throws missing_credentials when api key absent', async () => {
    await expect(
      gatherTwelveDataBarsEvidence({
        query: 'AAPL outlook',
        apiKey: '',
      }),
    ).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('throws missing_symbol without ticker token', async () => {
    await expect(
      gatherTwelveDataBarsEvidence({
        query: 'semiconductor outlook',
        apiKey: 'test-twelve-key',
      }),
    ).rejects.toMatchObject({ code: 'missing_symbol' });
  });

  it('returns qualitative entitlement evidence without OHLC digits', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('api.twelvedata.com/time_series');
      expect(u).toContain('symbol=NVDA');
      expect(u).toContain('apikey=test-twelve-key');

      return new Response(
        JSON.stringify({
          status: 'ok',
          meta: { symbol: 'NVDA' },
          values: [{ datetime: '2026-07-17', open: '100.5', high: '101', low: '99', close: '100' }],
        }),
        { status: 200 },
      );
    };

    const packages = await gatherTwelveDataBarsEvidence({
      query: 'NVDA sector outlook',
      apiKey: 'test-twelve-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(1);
    expect(packages[0]!.sourceKind).toBe('twelve_data');
    expect(packages[0]!.summary).toContain('NVDA');
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
  });

  it('throws rate_limited on HTTP 429', async () => {
    const fetchImpl = async () => new Response('rate limited', { status: 429 });

    await expect(
      gatherTwelveDataBarsEvidence({
        query: 'AAPL',
        apiKey: 'test-twelve-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(TwelveDataBarsError);
    await expect(
      gatherTwelveDataBarsEvidence({
        query: 'AAPL',
        apiKey: 'test-twelve-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
