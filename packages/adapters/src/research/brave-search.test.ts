import { describe, expect, it } from 'vitest';
import { BraveSearchError, searchBrave } from './brave-search';

describe('searchBrave', () => {
  it('throws missing_api_key when apiKey is empty', async () => {
    await expect(searchBrave({ query: 'test', apiKey: '' })).rejects.toMatchObject({
      code: 'missing_api_key',
    });
    await expect(searchBrave({ query: 'test', apiKey: '   ' })).rejects.toBeInstanceOf(
      BraveSearchError,
    );
  });

  it('maps web results to EvidencePackage via normalize', async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      expect(u).toContain('api.search.brave.com');
      expect(u).toContain('q=semiconductor');
      expect(u).toContain('count=2');
      expect(new Headers(init?.headers).get('X-Subscription-Token')).toBe('brave-test-key');

      return new Response(
        JSON.stringify({
          web: {
            results: [
              {
                title: 'Chip demand rises 15% in 2025',
                description: 'Industry outlook shows growth across fabs.',
                url: 'https://example.com/chips',
              },
              {
                title: 'Supply chain update',
                description: 'Lead times stabilizing.',
                url: 'https://example.com/supply',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const packages = await searchBrave({
      query: 'semiconductor',
      apiKey: 'brave-test-key',
      maxResults: 2,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(packages).toHaveLength(2);
    expect(packages[0]!.sourceKind).toBe('brave_search');
    expect(packages[0]!.feedClass).toBe('brave_search');
    expect(packages[0]!.title).not.toMatch(/\d/);
    expect(packages[0]!.summary).not.toMatch(/\d/);
    expect(packages[0]!.externalRef).toBe('https://example.com/chips');
  });

  it('throws http_error on non-2xx response', async () => {
    const fetchImpl = async () => new Response('rate limited', { status: 429 });

    await expect(
      searchBrave({
        query: 'test',
        apiKey: 'key',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'http_error' });
  });
});
