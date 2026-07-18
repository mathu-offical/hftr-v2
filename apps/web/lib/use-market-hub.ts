'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketHubAnalyzeResponse, MarketHubResponse } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import {
  invalidateMarketHub,
  loadMarketHub,
  MARKET_HUB_POLL_MS,
  marketHubKeyString,
  peekMarketHub,
  subscribeMarketHubCache,
  type MarketHubCacheKey,
} from '@/lib/market-hub-cache';

export type UseMarketHubResult = {
  data: MarketHubResponse | null;
  /** True when no usable data is available yet. */
  loading: boolean;
  /** True when cached data is shown while a GET revalidate is in flight. */
  refreshing: boolean;
  /** True while master Analyze (LLM posture pass) is draining. */
  analyzing: boolean;
  error: string | null;
  /** GET-only live hub sync (automatic poll also uses this). */
  refresh: (force?: boolean) => Promise<void>;
  /**
   * @deprecated Prefer refresh() for live sync and analyze() for LLM pass.
   * Kept as alias to analyze() for older callers.
   */
  refreshMovers: () => Promise<void>;
  /** Master Analyze — force reseal movers + sector + daily; tactical LLM thresholds. */
  analyze: () => Promise<void>;
};

/**
 * Shared Market posture hub subscription (stale-while-revalidate + poll).
 * Sync = GET projection. Analyze = POST …/analyze (LLM + seals).
 */
export function useMarketHub(
  companyId: string | null,
  opts?: {
    enabled?: boolean;
    /** Background poll while enabled. Default true. */
    poll?: boolean;
  },
): UseMarketHubResult {
  const enabled = opts?.enabled ?? true;
  const poll = opts?.poll ?? true;
  const key: MarketHubCacheKey | null = companyId ? { companyId } : null;
  const keyStr = key ? marketHubKeyString(key) : null;

  const [data, setData] = useState<MarketHubResponse | null>(() =>
    key ? peekMarketHub(key) : null,
  );
  const [loading, setLoading] = useState(() => {
    if (!enabled || !key) return false;
    return peekMarketHub(key) === null;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzeBusy = useRef(false);

  const fetcher = useCallback(async () => {
    if (!companyId) throw new Error('companyId required');
    return api<MarketHubResponse>(`/api/companies/${companyId}/market-hub`);
  }, [companyId]);

  const refresh = useCallback(
    async (force = false) => {
      if (!key || !enabled) return;
      const had = peekMarketHub(key) !== null;
      if (!had) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await loadMarketHub(key, fetcher, {
          force,
          allowStale: !force,
          onUpdate: (next) => setData(next),
        });
        setData(result.data);
        setError(null);
      } catch (err) {
        if (!had) setData(null);
        setError(err instanceof RequestError ? err.message : 'Failed to load market posture');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [key, enabled, fetcher],
  );

  const analyze = useCallback(async () => {
    if (!companyId || !key || analyzeBusy.current) return;
    analyzeBusy.current = true;
    setAnalyzing(true);
    try {
      await api<MarketHubAnalyzeResponse>(`/api/companies/${companyId}/market-hub/analyze`, {
        method: 'POST',
      });
      invalidateMarketHub(key);
      await refresh(true);
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Analyze failed');
    } finally {
      analyzeBusy.current = false;
      setAnalyzing(false);
    }
  }, [companyId, key, refresh]);

  const refreshMovers = analyze;

  useEffect(() => {
    if (!key || !keyStr || !enabled) return;
    const cached = peekMarketHub(key);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
    }
    void refresh(false);
    return subscribeMarketHubCache((changed) => {
      if (changed !== keyStr) return;
      const next = peekMarketHub(key);
      if (next !== null) setData(next);
    });
  }, [keyStr, enabled, key, refresh]);

  useEffect(() => {
    if (!key || !enabled || !poll) return;
    const interval = setInterval(() => void refresh(false), MARKET_HUB_POLL_MS);
    return () => clearInterval(interval);
  }, [key, enabled, poll, refresh]);

  return { data, loading, refreshing, analyzing, error, refresh, refreshMovers, analyze };
}
