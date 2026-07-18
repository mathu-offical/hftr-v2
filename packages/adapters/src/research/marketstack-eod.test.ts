import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { gatherMarketstackEodEvidence, MarketstackEodError } from './marketstack-eod';

describe('gatherMarketstackEodEvidence', () => {
  it('throws missing_credentials when api key absent', async () => {
    await expect(
      gatherMarketstackEodEvidence({
        query: 'AAPL outlook',
        apiKey: '',
      }),
    ).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('throws missing_symbol without ticker token', async () => {
    await expect(
      gatherMarketstackEodEvidence({
        query: 'semiconductor outlook',
        apiKey: 'test-marketstack-key',
      }),
    ).rejects.toMatchObject({ code: 'missing_symbol' });
  });

  it('returns qualitative entitlement evidence without EOD digits', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('api.marketstack.com/v1/eod');
      expect(u).toContain('symbols=MSFT');
      expect(u).toContain('access_key=test-marketstack-key');

      return new Response(
        JSON.stringify({
          data: [
            {
              symbol: 'MSFT',
              open: 420.5,
              high: 425,
              low: 418,
              close: 422.1,
            },
          ],
        }),
        { status: 200 },
      );
    };

    const packages = await gatherMarketstackEodEvidence({
      query: 'MSFT outlook',
      apiKey: 'test-marketstack-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(1);
    expect(packages[0]!.sourceKind).toBe('marketstack');
    expect(packages[0]!.summary).toContain('MSFT');
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({ error: { code: 'invalid_access_key', message: 'Invalid access key' } }),
        { status: 200 },
      );

    await expect(
      gatherMarketstackEodEvidence({
        query: 'AAPL',
        apiKey: 'bad-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
