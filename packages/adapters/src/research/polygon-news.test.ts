import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchPolygonNews, PolygonNewsError } from './polygon-news';

describe('fetchPolygonNews', () => {
  it('throws missing_credentials when api key absent', async () => {
    await expect(
      fetchPolygonNews({
        limit: 5,
        apiKey: '',
      }),
    ).rejects.toBeInstanceOf(PolygonNewsError);
    await expect(
      fetchPolygonNews({
        limit: 5,
        apiKey: '',
      }),
    ).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('maps Polygon reference news to leak-linted evidence packages', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('/v2/reference/news');
      expect(u).toContain('ticker=NVDA');
      expect(u).toContain('limit=3');
      expect(u).toContain('apiKey=test-polygon-key');

      return new Response(
        JSON.stringify({
          results: [
            {
              id: 'poly-101',
              title: 'NVDA momentum watch as shares hit $900',
              description: 'Chip sector narrative update with volume spike.',
              article_url: 'https://news.example.com/nvda',
              publisher: { name: 'Benzinga' },
              tickers: ['NVDA'],
            },
          ],
        }),
        { status: 200 },
      );
    };

    const packages = await fetchPolygonNews({
      query: 'NVDA sector outlook',
      limit: 3,
      apiKey: 'test-polygon-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(1);
    expect(packages[0]!.sourceKind).toBe('polygon_news');
    expect(packages[0]!.feedClass).toBe('polygon_reference_news');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
    expect(packages[0]!.externalRef).toBe('https://news.example.com/nvda');
  });

  it('omits ticker param when query has no symbol token', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('/v2/reference/news');
      expect(u).not.toContain('ticker=');

      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const packages = await fetchPolygonNews({
      query: 'semiconductor outlook',
      limit: 2,
      apiKey: 'test-polygon-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(0);
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('forbidden', { status: 403 });

    await expect(
      fetchPolygonNews({
        limit: 2,
        apiKey: 'test-polygon-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
