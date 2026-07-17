import { describe, expect, it } from 'vitest';
import { gatherEvidencePackages } from './gather';

describe('gatherEvidencePackages', () => {
  it('collects brave missing_api_key and still gathers sec + market news', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);

      if (u.includes('efts.sec.gov')) {
        return new Response(
          JSON.stringify({
            hits: {
              hits: [
                {
                  _id: 'acc-0001',
                  _source: {
                    form_type: '10-K',
                    display_names: ['Example Corp'],
                    file_date: '2024-03-01',
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (u.includes('marketaux.com')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                title: 'Markets steady',
                description: 'Broad indices hold range.',
                url: 'https://news.example.com/1',
              },
            ],
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    };

    const { packages, errors } = await gatherEvidencePackages({
      query: 'semiconductor outlook',
      sourceKinds: ['brave_search', 'sec_edgar', 'market_news'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 8,
      braveApiKey: null,
      marketNewsApiKey: 'marketaux-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(errors).toContainEqual({ sourceKind: 'brave_search', code: 'missing_api_key' });
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.some((p) => p.sourceKind === 'sec_edgar')).toBe(true);
    expect(packages.some((p) => p.sourceKind === 'market_news')).toBe(true);
  });

  it('caps packages to maxEvidence', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('efts.sec.gov')) {
        return new Response(
          JSON.stringify({
            hits: {
              hits: Array.from({ length: 5 }, (_, i) => ({
                _id: `acc-${i}`,
                _source: { form_type: '8-K', display_names: [`Co ${i}`] },
              })),
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };

    const { packages } = await gatherEvidencePackages({
      query: 'earnings',
      sourceKinds: ['sec_edgar', 'market_news'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 2,
      marketNewsApiKey: 'key',
      marketNewsAllowDeterministicFallback: true,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
  });

  it('records unsupported_source for gather-only kinds without adapters', async () => {
    const { packages, errors } = await gatherEvidencePackages({
      query: 'test',
      sourceKinds: ['catalog'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 4,
    });

    expect(packages).toHaveLength(0);
    expect(errors).toContainEqual({ sourceKind: 'catalog', code: 'unsupported_source' });
  });
});
