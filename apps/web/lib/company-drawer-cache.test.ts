import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateDrawerSlice,
  loadDrawerSlice,
  peekDrawerSlice,
} from './company-drawer-cache';

describe('company-drawer-cache', () => {
  afterEach(() => {
    invalidateDrawerSlice('co-1');
    vi.useRealTimers();
  });

  it('returns fresh cache without refetch', async () => {
    const fetcher = vi.fn(async () => ({ balance: '100' }));
    const first = await loadDrawerSlice('co-1', 'desk', fetcher);
    expect(first.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await loadDrawerSlice('co-1', 'desk', fetcher);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual({ balance: '100' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peekDrawerSlice('co-1', 'desk')).toEqual({ balance: '100' });
  });

  it('revalidates in background when stale', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockResolvedValueOnce({ n: 2 });

    await loadDrawerSlice('co-1', 'desk', fetcher);
    vi.advanceTimersByTime(21_000);

    const updates: Array<{ n: number }> = [];
    const mid = await loadDrawerSlice<{ n: number }>('co-1', 'desk', fetcher, {
      onUpdate: (d) => updates.push(d),
    });
    expect(mid.fromCache).toBe(true);
    expect(mid.data).toEqual({ n: 1 });

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(peekDrawerSlice('co-1', 'desk')).toEqual({ n: 2 });
  });
});
