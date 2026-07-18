import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchWorldBankIndicators, WorldBankIndicatorError } from './world-bank-indicator';

describe('fetchWorldBankIndicators', () => {
  it('maps indicator catalog rows without numeric observations', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          { page: 1, pages: 1, per_page: 2, total: 2 },
          [
            {
              id: 'NY.GDP.MKTP.CD',
              name: 'GDP current US',
              sourceNote: 'GDP at purchaser prices.',
            },
            {
              id: 'SP.POP.TOTL',
              name: 'Population total',
              sourceNote: 'Total population.',
            },
          ],
        ]),
        { status: 200 },
      );

    const packages = await fetchWorldBankIndicators({
      limit: 2,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('world_bank_indicator');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
  });

  it('throws http_error on non-OK', async () => {
    const fetchImpl = async () => new Response('nope', { status: 500 });
    await expect(
      fetchWorldBankIndicators({ fetchImpl: fetchImpl as typeof fetch }),
    ).rejects.toBeInstanceOf(WorldBankIndicatorError);
  });
});
