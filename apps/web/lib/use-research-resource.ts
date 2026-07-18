'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadResearchResource,
  peekResearchResource,
  researchResourceKeyString,
  subscribeResearchCache,
  type ResearchResourceKey,
} from '@/lib/research-resource-cache';

export type UseResearchResourceResult<T> = {
  data: T | null;
  /** True when no usable data is available yet. */
  loading: boolean;
  /** True when cached data is shown while a revalidate is in flight. */
  refreshing: boolean;
  refresh: (force?: boolean) => Promise<void>;
};

/**
 * Subscribe to a research resource with stale-while-revalidate.
 * Hydrates from cache synchronously on first render when possible.
 */
export function useResearchResource<T>(
  key: ResearchResourceKey | null,
  fetcher: () => Promise<T>,
  opts?: {
    /** When false, do not auto-fetch (caller triggers refresh). Default true. */
    enabled?: boolean;
  },
): UseResearchResourceResult<T> {
  const enabled = opts?.enabled ?? true;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const keyStr = key ? researchResourceKeyString(key) : null;
  const [data, setData] = useState<T | null>(() =>
    key ? peekResearchResource<T>(key) : null,
  );
  const [loading, setLoading] = useState(() => {
    if (!enabled || !key) return false;
    return peekResearchResource<T>(key) === null;
  });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(
    async (force = false) => {
      if (!key || !enabled) return;
      const had = peekResearchResource<T>(key) !== null;
      if (!had) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await loadResearchResource(key, () => fetcherRef.current(), {
          force,
          allowStale: !force,
          onUpdate: (next) => setData(next),
        });
        setData(result.data);
      } catch {
        if (!had) setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key, enabled],
  );

  useEffect(() => {
    if (!key || !keyStr || !enabled) return;
    const cached = peekResearchResource<T>(key);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
    }
    void refresh(false);
    return subscribeResearchCache((changed) => {
      if (changed !== keyStr) return;
      const next = peekResearchResource<T>(key);
      if (next !== null) setData(next);
    });
  }, [keyStr, enabled, key, refresh]);

  return { data, loading, refreshing, refresh };
}
