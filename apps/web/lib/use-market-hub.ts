'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketHubAnalyzeResponse, MarketHubResponse } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import {
  invalidateMarketHub,
  loadMarketHub,
  marketHubKeyString,
  peekMarketHub,
  subscribeMarketHubCache,
  type MarketHubCacheKey,
} from '@/lib/market-hub-cache';
import {
  acquireMarketHubLivePoll,
  beginMarketHubAnalyze,
  endMarketHubAnalyze,
  isMarketHubAnalyzeBusy,
  subscribeMarketHubAnalyze,
} from '@/lib/market-hub-live-runtime';

export type UseMarketHubResult = {
  data: MarketHubResponse | null;
  loading: boolean;
  /** Manual Sync (full hub) in flight — not set by silent live poll. */
  refreshing: boolean;
  /** Master Analyze POST in flight — live poll paused (shared across panel/overlay). */
  analyzing: boolean;
  error: string | null;
  /** Full hub GET (mount / manual Sync). */
  refresh: (force?: boolean) => Promise<void>;
  /** @deprecated Alias of analyze(). */
  refreshMovers: () => Promise<string | null>;
  /** Returns synthesis runId for live Model poll (D-120). */
  analyze: () => Promise<string | null>;
};

/**
 * Market posture hub subscription (D-111 / D-112).
 * - Full hub: mount + Sync + after Analyze
 * - Live slice poll: shared per company, equity/marks only, silent, never blocks Analyze
 */
export function useMarketHub(
  companyId: string | null,
  opts?: {
    enabled?: boolean;
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
  const [analyzing, setAnalyzing] = useState(() =>
    companyId ? isMarketHubAnalyzeBusy(companyId) : false,
  );
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
      else if (force) setRefreshing(true);
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
    if (!companyId || !key || analyzeBusy.current) return null;
    analyzeBusy.current = true;
    beginMarketHubAnalyze(companyId);
    try {
      const res = await api<MarketHubAnalyzeResponse>(
        `/api/companies/${companyId}/market-hub/analyze`,
        { method: 'POST' },
      );
      // Hub seals may still be finishing via poll — soft invalidate only.
      invalidateMarketHub(key);
      return res.runId;
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Analyze failed');
      return null;
    } finally {
      endMarketHubAnalyze(companyId);
      analyzeBusy.current = false;
    }
  }, [companyId, key]);

  const refreshMovers = analyze;

  useEffect(() => {
    if (!companyId) return;
    setAnalyzing(isMarketHubAnalyzeBusy(companyId));
    return subscribeMarketHubAnalyze((id, busy) => {
      if (id !== companyId) return;
      setAnalyzing(busy);
    });
  }, [companyId]);

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
    if (!companyId || !enabled || !poll) return;
    return acquireMarketHubLivePoll(companyId);
  }, [companyId, enabled, poll]);

  return { data, loading, refreshing, analyzing, error, refresh, refreshMovers, analyze };
}
