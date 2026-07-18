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

  it('gathers alpaca_news and alpaca_bars when paper credentials present', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/v1beta1/news')) {
        return new Response(
          JSON.stringify({
            news: [
              {
                id: 1,
                headline: 'NVDA momentum watch',
                summary: 'Chip sector narrative update.',
                url: 'https://news.example.com/nvda',
                source: 'benzinga',
                symbols: ['NVDA'],
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes('/v2/stocks/NVDA/bars')) {
        return new Response(
          JSON.stringify({
            bars: [{ t: '2026-07-17T14:00:00Z', o: 100, h: 101, l: 99, c: 100.5, v: 500 }],
            symbol: 'NVDA',
          }),
          { status: 200, headers: { 'X-Request-ID': 'req-bars-nvda' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const { packages, errors } = await gatherEvidencePackages({
      query: 'NVDA sector outlook',
      sourceKinds: ['alpaca_news', 'alpaca_bars'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 8,
      alpacaKeyId: 'PKTESTKEY1',
      alpacaSecret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(errors).toHaveLength(0);
    expect(packages.some((p) => p.sourceKind === 'alpaca_news')).toBe(true);
    const barsPkg = packages.find((p) => p.sourceKind === 'alpaca_bars');
    expect(barsPkg).toBeDefined();
    expect(barsPkg!.summary).toContain('NVDA');
    expect(barsPkg!.summary).not.toMatch(/\d/);
    expect(barsPkg!.title).not.toMatch(/\d/);
  });

  it('records missing_symbol for alpaca_bars without ticker token', async () => {
    const { packages, errors } = await gatherEvidencePackages({
      query: 'semiconductor outlook',
      sourceKinds: ['alpaca_bars'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 4,
      alpacaKeyId: 'PKTESTKEY1',
      alpacaSecret: 'secret-test',
    });

    expect(packages).toHaveLength(0);
    expect(errors).toContainEqual({ sourceKind: 'alpaca_bars', code: 'missing_symbol' });
  });

  it('records missing_credentials for alpaca_news without keys', async () => {
    const { packages, errors } = await gatherEvidencePackages({
      query: 'AAPL',
      sourceKinds: ['alpaca_news'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 4,
    });

    expect(packages).toHaveLength(0);
    expect(errors).toContainEqual({ sourceKind: 'alpaca_news', code: 'missing_credentials' });
  });

  it('gathers finnhub_news and polygon_news when API keys present', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('finnhub.io')) {
        return new Response(
          JSON.stringify([
            {
              id: 1,
              headline: 'AAPL sector note',
              summary: 'Qualitative chip supply commentary.',
              url: 'https://news.example.com/finnhub',
            },
          ]),
          { status: 200 },
        );
      }
      if (u.includes('polygon.io')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'p1',
                title: 'NVDA narrative update',
                description: 'Sector sentiment steady.',
                article_url: 'https://news.example.com/polygon',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const { packages, errors } = await gatherEvidencePackages({
      query: 'AAPL NVDA outlook',
      sourceKinds: ['finnhub_news', 'polygon_news'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 8,
      finnhubApiKey: 'finnhub-test',
      polygonApiKey: 'polygon-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(errors).toHaveLength(0);
    expect(packages.some((p) => p.sourceKind === 'finnhub_news')).toBe(true);
    expect(packages.some((p) => p.sourceKind === 'polygon_news')).toBe(true);
  });

  it('records missing_credentials for finnhub_news and polygon_news without keys', async () => {
    const { packages, errors } = await gatherEvidencePackages({
      query: 'AAPL',
      sourceKinds: ['finnhub_news', 'polygon_news'],
      allowlist: [],
      blocklist: [],
      maxEvidence: 4,
    });

    expect(packages).toHaveLength(0);
    expect(errors).toContainEqual({ sourceKind: 'finnhub_news', code: 'missing_credentials' });
    expect(errors).toContainEqual({ sourceKind: 'polygon_news', code: 'missing_credentials' });
  });
});
