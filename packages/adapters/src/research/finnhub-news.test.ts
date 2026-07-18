import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchFinnhubNews, FinnhubNewsError } from './finnhub-news';

describe('fetchFinnhubNews', () => {
  it('throws missing_credentials when api key absent', async () => {
    await expect(
      fetchFinnhubNews({
        limit: 5,
        apiKey: '',
      }),
    ).rejects.toBeInstanceOf(FinnhubNewsError);
    await expect(
      fetchFinnhubNews({
        limit: 5,
        apiKey: '',
      }),
    ).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('maps Finnhub company news to leak-linted evidence packages', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('/api/v1/company-news');
      expect(u).toContain('symbol=AAPL');
      expect(u).toContain('token=test-finnhub-key');

      return new Response(
        JSON.stringify([
          {
            id: 501,
            headline: 'Apple shares rise 5% on earnings beat',
            summary: 'Revenue reached 95 billion dollars in the quarter.',
            url: 'https://news.example.com/aapl',
            source: 'Reuters',
          },
          {
            id: 502,
            headline: 'Sector watch',
            summary: 'Broad tech sentiment steady.',
            url: 'https://news.example.com/sector',
            source: 'Reuters',
          },
        ]),
        { status: 200 },
      );
    };

    const packages = await fetchFinnhubNews({
      query: 'AAPL outlook',
      limit: 3,
      apiKey: 'test-finnhub-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('finnhub_news');
    expect(packages[0]!.feedClass).toBe('finnhub_company_news');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
    expect(packages[0]!.externalRef).toBe('https://news.example.com/aapl');
  });

  it('falls back to general news when query has no ticker', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('/api/v1/news');
      expect(u).toContain('category=general');
      expect(u).not.toContain('company-news');

      return new Response(
        JSON.stringify([
          {
            id: 1,
            headline: 'Macro backdrop',
            summary: 'Global markets in focus.',
            url: 'https://news.example.com/macro',
          },
        ]),
        { status: 200 },
      );
    };

    const packages = await fetchFinnhubNews({
      query: 'semiconductor outlook',
      limit: 2,
      apiKey: 'test-finnhub-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(1);
    expect(packages[0]!.sourceKind).toBe('finnhub_news');
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('forbidden', { status: 403 });

    await expect(
      fetchFinnhubNews({
        limit: 2,
        apiKey: 'test-finnhub-key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
