import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchAlphaVantageNews, AlphaVantageNewsError } from './alpha-vantage-news';

describe('fetchAlphaVantageNews', () => {
  it('throws missing_credentials when api key absent', async () => {
    await expect(
      fetchAlphaVantageNews({ apiKey: '', limit: 3 }),
    ).rejects.toMatchObject({ code: 'missing_credentials' });
    await expect(
      fetchAlphaVantageNews({ apiKey: '', limit: 3 }),
    ).rejects.toBeInstanceOf(AlphaVantageNewsError);
  });

  it('maps Alpha Vantage news to leak-linted evidence with optional tickers', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('function=NEWS_SENTIMENT');
      expect(u).toContain('tickers=NVDA');
      expect(u).toContain('apikey=test-av-key');

      return new Response(
        JSON.stringify({
          feed: [
            {
              title: 'NVDA shares rise 4% on data-center demand',
              summary: 'Revenue outlook improved for the quarter.',
              url: 'https://news.example.com/nvda',
              source: 'Reuters',
            },
          ],
        }),
        { status: 200 },
      );
    };

    const packages = await fetchAlphaVantageNews({
      query: 'NVDA outlook',
      limit: 3,
      apiKey: 'test-av-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(1);
    expect(packages[0]!.sourceKind).toBe('alpha_vantage_news');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('forbidden', { status: 403 });
    await expect(
      fetchAlphaVantageNews({
        apiKey: 'test-av-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
