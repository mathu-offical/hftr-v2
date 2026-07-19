import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOperatorLivePreviewCache,
  loadOperatorLivePreviewCached,
  operatorLivePreviewCacheKey,
  OPERATOR_LIVE_PREVIEW_TTL_MS,
  peekOperatorLivePreviewCache,
} from './operator-live-preview-cache';
import type { LiveDataSourceWidget } from '@hftr/contracts';

const sampleWidgets = [
  {
    id: 'w1',
    title: 'BTC',
    summary: 'sample',
    feedClass: 'coingecko',
    authorityClass: 'DETERMINISTIC',
    externalRef: null,
    expiresAt: null,
    widgetKind: 'listing' as const,
    fields: [],
  },
] satisfies LiveDataSourceWidget[];

describe('operator-live-preview-cache', () => {
  afterEach(() => {
    clearOperatorLivePreviewCache();
    vi.useRealTimers();
  });

  it('returns fresh cache without refetch', async () => {
    const key = operatorLivePreviewCacheKey({
      kind: 'coingecko_crypto',
      query: '',
      maxResults: 500,
    });
    const fetcher = vi.fn(async () => sampleWidgets);

    const first = await loadOperatorLivePreviewCached(key, fetcher);
    expect(first.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await loadOperatorLivePreviewCached(key, fetcher);
    expect(second.fromCache).toBe(true);
    expect(second.widgets).toEqual(sampleWidgets);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekOperatorLivePreviewCache(key)?.widgets).toEqual(sampleWidgets);
  });

  it('expires after TTL and refetches', async () => {
    vi.useFakeTimers();
    const key = operatorLivePreviewCacheKey({
      kind: 'frankfurter_fx',
      query: 'USD',
      maxResults: 500,
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(sampleWidgets)
      .mockResolvedValueOnce([{ ...sampleWidgets[0], id: 'w2' }]);

    await loadOperatorLivePreviewCached(key, fetcher, { nowMs: Date.now() });
    vi.advanceTimersByTime(OPERATOR_LIVE_PREVIEW_TTL_MS + 1);

    const next = await loadOperatorLivePreviewCached(key, fetcher, {
      nowMs: Date.now(),
    });
    expect(next.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent fetches', async () => {
    const key = operatorLivePreviewCacheKey({
      kind: 'coingecko_crypto',
      query: '',
      maxResults: 12,
    });
    let resolveFetch!: (v: LiveDataSourceWidget[]) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<LiveDataSourceWidget[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const a = loadOperatorLivePreviewCached(key, fetcher);
    const b = loadOperatorLivePreviewCached(key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch(sampleWidgets);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.widgets).toEqual(sampleWidgets);
    expect(rb.widgets).toEqual(sampleWidgets);
  });
});
