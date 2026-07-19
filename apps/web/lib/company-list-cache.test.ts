import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateCompanyListMeta,
  loadCompanyListMeta,
  patchCompanyListMeta,
  peekCompanyListMeta,
  removeCompanyListMeta,
  setCompanyListMeta,
  upsertCompanyListMeta,
} from './company-list-cache';

describe('company-list-cache', () => {
  afterEach(() => {
    invalidateCompanyListMeta();
    vi.useRealTimers();
  });

  it('returns fresh cache without refetch', async () => {
    const fetcher = vi.fn(async () => [{ id: 'a', name: 'Alpha', mode: 'paper' }]);
    const first = await loadCompanyListMeta(fetcher);
    expect(first.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await loadCompanyListMeta(fetcher);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual([{ id: 'a', name: 'Alpha', mode: 'paper' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekCompanyListMeta()).toEqual([{ id: 'a', name: 'Alpha', mode: 'paper' }]);
  });

  it('revalidates in background when stale', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', name: 'A1', mode: 'paper' }])
      .mockResolvedValueOnce([{ id: 'a', name: 'A2', mode: 'paper' }]);

    await loadCompanyListMeta(fetcher);
    vi.advanceTimersByTime(61_000);

    const updates: Array<Array<{ id: string; name: string; mode: string }>> = [];
    const mid = await loadCompanyListMeta(fetcher, {
      onUpdate: (d) => updates.push(d),
    });
    expect(mid.fromCache).toBe(true);
    expect(mid.data[0]?.name).toBe('A1');

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(peekCompanyListMeta()?.[0]?.name).toBe('A2');
  });

  it('upserts, patches, and removes rows', () => {
    setCompanyListMeta([{ id: 'a', name: 'Alpha', mode: 'paper' }]);
    upsertCompanyListMeta({ id: 'b', name: 'Beta', mode: 'live' });
    expect(peekCompanyListMeta()?.map((r) => r.id)).toEqual(['b', 'a']);

    patchCompanyListMeta('a', { name: 'Alpha Renamed' });
    expect(peekCompanyListMeta()?.find((r) => r.id === 'a')?.name).toBe('Alpha Renamed');

    removeCompanyListMeta('b');
    expect(peekCompanyListMeta()?.map((r) => r.id)).toEqual(['a']);
  });
});
