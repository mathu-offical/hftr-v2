import { describe, expect, it, vi } from 'vitest';
import { leakLint } from '@hftr/contracts';
import { fetchGdeltNews, GdeltNewsError } from './gdelt-news';

describe('fetchGdeltNews', () => {
  it('maps GDELT articles to leak-linted evidence packages', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const u = String(url);
      expect(u).toContain('api.gdeltproject.org');
      expect(u).toContain('mode=ArtList');
      expect(u).toContain('format=json');

      return new Response(
        JSON.stringify({
          articles: [
            {
              title: 'Markets steady amid chip sector watch',
              url: 'https://news.example.com/gdelt-1',
              domain: 'example.com',
            },
            {
              title: 'Policy backdrop update',
              url: 'https://news.example.com/gdelt-2',
              domain: 'example.org',
            },
          ],
        }),
        { status: 200 },
      );
    };

    const packages = await fetchGdeltNews({
      query: 'semiconductor outlook',
      limit: 5,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('gdelt_news');
    expect(packages[0]!.feedClass).toBe('gdelt_event_feed');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(leakLint({ title: packages[0]!.title, summary: packages[0]!.summary }, []).ok).toBe(
      true,
    );
    expect(packages[0]!.externalRef).toBe('https://news.example.com/gdelt-1');
  });

  it('retries once on HTTP 429 then succeeds', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('too many', { status: 429 });
      }
      return new Response(
        JSON.stringify({
          articles: [{ title: 'Recovered headline', url: 'https://news.example.com/r' }],
        }),
        { status: 200 },
      );
    };

    vi.useFakeTimers();
    const promise = fetchGdeltNews({
      query: 'markets',
      limit: 1,
      fetchImpl: fetchImpl as typeof fetch,
    });
    await vi.advanceTimersByTimeAsync(1500);
    const packages = await promise;
    vi.useRealTimers();

    expect(calls).toBe(2);
    expect(packages).toHaveLength(1);
  });

  it('throws rate_limited when 429 persists after one retry', async () => {
    const fetchImpl = async () => new Response('too many', { status: 429 });

    vi.useFakeTimers();
    const promise = fetchGdeltNews({
      query: 'markets',
      limit: 1,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'rate_limited' });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    vi.useRealTimers();
  });

  it('throws parse_error for invalid JSON shape', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ results: [] }), { status: 200 });

    await expect(
      fetchGdeltNews({
        query: 'markets',
        limit: 1,
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'parse_error' });
  });
});
