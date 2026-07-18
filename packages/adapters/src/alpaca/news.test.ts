import { describe, expect, it } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { createAlpacaClient } from './client';
import { AlpacaNewsError, fetchAlpacaNews } from './news';

describe('fetchAlpacaNews', () => {
  it('throws missing_credentials when keys absent', async () => {
    await expect(
      fetchAlpacaNews({
        limit: 5,
        credentials: { keyId: '', secret: '' },
      }),
    ).rejects.toBeInstanceOf(AlpacaNewsError);
  });

  it('maps Alpaca news to leak-linted evidence packages', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      expect(u).toContain('/v1beta1/news');
      expect(u).toContain('symbols=AAPL');
      expect(u).toContain('limit=3');
      const headers = new Headers(init?.headers);
      expect(headers.get('APCA-API-KEY-ID')).toBe('PKTESTKEY1');

      return new Response(
        JSON.stringify({
          news: [
            {
              id: 101,
              headline: 'Apple shares rise 5% on earnings beat',
              summary: 'Revenue reached 95 billion dollars in the quarter.',
              url: 'https://news.example.com/aapl',
              source: 'benzinga',
              symbols: ['AAPL'],
            },
            {
              id: 102,
              headline: 'Sector watch',
              summary: 'Broad tech sentiment steady.',
              url: 'https://news.example.com/sector',
              source: 'benzinga',
              symbols: ['AAPL'],
            },
          ],
        }),
        { status: 200 },
      );
    };

    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const packages = await fetchAlpacaNews({
      query: 'AAPL outlook',
      limit: 3,
      credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
      client,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('alpaca_news');
    expect(packages[0]!.feedClass).toBe('alpaca_benzinga_news');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
    expect(packages[0]!.externalRef).toBe('https://news.example.com/aapl');
  });

  it('throws http_error when API rejects', async () => {
    const fetchImpl = async () => new Response('forbidden', { status: 403 });
    const client = createAlpacaClient({
      keyId: 'PKTESTKEY1',
      secret: 'secret-test',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      fetchAlpacaNews({
        limit: 2,
        credentials: { keyId: 'PKTESTKEY1', secret: 'secret-test' },
        client,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
