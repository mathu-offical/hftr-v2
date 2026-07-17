import { describe, expect, it } from 'vitest';
import { filterSourceKinds } from './source-matrix';

describe('filterSourceKinds', () => {
  const kinds = ['brave_search', 'sec_edgar', 'market_news', 'catalog'] as const;

  it('returns all kinds when allowlist is empty and blocklist is empty', () => {
    expect(filterSourceKinds([...kinds], [], [])).toEqual([...kinds]);
  });

  it('applies allowlist by source kind', () => {
    expect(filterSourceKinds([...kinds], ['brave_search', 'sec_edgar'], [])).toEqual([
      'brave_search',
      'sec_edgar',
    ]);
  });

  it('matches feed class aliases on allowlist', () => {
    expect(filterSourceKinds([...kinds], ['sec_edgar_free'], [])).toEqual(['sec_edgar']);
    expect(filterSourceKinds([...kinds], ['market_news_public'], [])).toEqual(['market_news']);
  });

  it('blocklist always wins over allowlist', () => {
    expect(
      filterSourceKinds(
        [...kinds],
        ['brave_search', 'sec_edgar', 'market_news'],
        ['sec_edgar_free'],
      ),
    ).toEqual(['brave_search', 'market_news']);
  });

  it('deduplicates kinds', () => {
    expect(
      filterSourceKinds(
        ['brave_search', 'brave_search', 'sec_edgar'],
        [],
        [],
      ),
    ).toEqual(['brave_search', 'sec_edgar']);
  });
});
