import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchFredMacro, FredMacroError } from './fred-macro';

describe('fetchFredMacro', () => {
  it('throws missing_credentials when api key absent', async () => {
    await expect(fetchFredMacro({ query: 'gdp', apiKey: '', limit: 3 })).rejects.toMatchObject({
      code: 'missing_credentials',
    });
    await expect(fetchFredMacro({ query: 'gdp', apiKey: '', limit: 3 })).rejects.toBeInstanceOf(
      FredMacroError,
    );
  });

  it('maps FRED series search to leak-linted evidence', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('api.stlouisfed.org/fred/series/search');
      expect(u).toContain('search_text=unemployment');
      expect(u).toContain('api_key=test-fred-key');

      return new Response(
        JSON.stringify({
          seriess: [
            { id: 'UNRATE', title: 'Unemployment Rate' },
            { id: 'CIVPART', title: 'Labor Force Participation Rate' },
          ],
        }),
        { status: 200 },
      );
    };

    const packages = await fetchFredMacro({
      query: 'unemployment',
      limit: 5,
      apiKey: 'test-fred-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('fred_macro');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).toContain('observation values not included');
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
    expect(packages[0]!.externalRef).toBe('fred-series:UNRATE');
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('bad key', { status: 400 });
    await expect(
      fetchFredMacro({
        query: 'cpi',
        apiKey: 'test-fred-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
