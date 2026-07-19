import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LiveDataSourceQueryResponse } from '@hftr/contracts';
import {
  clearLiveDataSourceQueryCache,
  loadLiveDataSourceQuery,
  peekLiveDataSourceQuery,
} from './live-data-source-query-cache';

const sample: LiveDataSourceQueryResponse = {
  kind: 'frankfurter_fx',
  mode: 'browse',
  query: 'USD rates',
  status: 'public',
  domain: 'fx',
  widgets: [],
  presets: [],
  completeList: true,
  cached: false,
  errors: [],
  fetchedAt: '2026-07-18T12:00:00.000Z',
};

describe('live-data-source-query-cache', () => {
  afterEach(() => {
    clearLiveDataSourceQueryCache();
    vi.useRealTimers();
  });

  it('returns fresh cache without refetch', async () => {
    const key = {
      companyId: 'co-1',
      kind: 'frankfurter_fx',
      mode: 'browse' as const,
      query: '',
      maxResults: 500,
    };
    const fetcher = vi.fn(async () => sample);
    const first = await loadLiveDataSourceQuery(key, fetcher);
    expect(first.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await loadLiveDataSourceQuery(key, fetcher);
    expect(second.fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekLiveDataSourceQuery(key)).toEqual(sample);
  });

  it('revalidates in background when stale', async () => {
    vi.useFakeTimers();
    const key = {
      companyId: 'co-1',
      kind: 'coingecko_crypto',
      mode: 'browse' as const,
      query: '',
      maxResults: 500,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(sample)
      .mockResolvedValueOnce({ ...sample, query: 'updated' });

    await loadLiveDataSourceQuery(key, fetcher);
    vi.advanceTimersByTime(5 * 60_000 + 1);

    const updates: LiveDataSourceQueryResponse[] = [];
    const mid = await loadLiveDataSourceQuery(key, fetcher, {
      onUpdate: (d) => updates.push(d),
    });
    expect(mid.fromCache).toBe(true);
    expect(mid.data.query).toBe('USD rates');

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(peekLiveDataSourceQuery(key)?.query).toBe('updated');
  });
});
