import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchFrankfurterFx, FrankfurterFxError } from './frankfurter-fx';

describe('fetchFrankfurterFx', () => {
  it('maps Frankfurter rates to qualitative evidence without digits', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      expect(String(url)).toContain('api.frankfurter.dev/v2/rates');
      return new Response(
        JSON.stringify([
          { date: '2026-07-17', base: 'USD', quote: 'EUR', rate: 0.91 },
          { date: '2026-07-17', base: 'USD', quote: 'GBP', rate: 0.78 },
          { date: '2026-07-17', base: 'USD', quote: 'JPY', rate: 157.2 },
        ]),
        { status: 200 },
      );
    };

    const packages = await fetchFrankfurterFx({
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(1);
    expect(packages[0]!.sourceKind).toBe('frankfurter_fx');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(packages[0]!.summary).toContain('currencies');
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('error', { status: 503 });
    await expect(
      fetchFrankfurterFx({ fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toMatchObject({ code: 'http_error' });
    await expect(
      fetchFrankfurterFx({ fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(FrankfurterFxError);
  });
});
