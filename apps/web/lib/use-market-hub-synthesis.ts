'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketHubSynthesisRun } from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';

const POLL_MS = 1_500;
const TERMINAL = new Set(['succeeded', 'failed', 'partial']);

export type UseMarketHubSynthesisResult = {
  run: MarketHubSynthesisRun | null;
  loading: boolean;
  error: string | null;
  /** Active poll target (Analyze runId or latest). */
  activeRunId: string | null;
  setActiveRunId: (runId: string | null) => void;
  refreshLatest: () => Promise<void>;
};

/**
 * Poll synthesis run stages for live Model canvas (D-120).
 * Separate from equity live poll (D-112).
 */
export function useMarketHubSynthesis(
  companyId: string | null,
  opts?: { enabled?: boolean },
): UseMarketHubSynthesisResult {
  const enabled = opts?.enabled ?? true;
  const [run, setRun] = useState<MarketHubSynthesisRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const inflight = useRef(false);

  const refreshLatest = useCallback(async () => {
    if (!companyId || !enabled) return;
    setLoading(true);
    try {
      const res = await api<{ run: MarketHubSynthesisRun | null }>(
        `/api/companies/${companyId}/market-hub/synthesis/latest`,
      );
      setRun(res.run);
      setError(null);
      if (res.run && !TERMINAL.has(res.run.status)) {
        setActiveRunId(res.run.id);
      }
    } catch (err) {
      setError(err instanceof RequestError ? err.message : 'Failed to load synthesis');
    } finally {
      setLoading(false);
    }
  }, [companyId, enabled]);

  const pollRun = useCallback(
    async (runId: string) => {
      if (!companyId || inflight.current) return;
      inflight.current = true;
      try {
        const next = await api<MarketHubSynthesisRun>(
          `/api/companies/${companyId}/market-hub/synthesis/${runId}`,
        );
        setRun(next);
        setError(null);
        if (TERMINAL.has(next.status)) {
          setActiveRunId(null);
        }
      } catch {
        // Soft-fail mid-run — keep last snapshot.
      } finally {
        inflight.current = false;
      }
    },
    [companyId],
  );

  useEffect(() => {
    if (!companyId || !enabled) return;
    void refreshLatest();
  }, [companyId, enabled, refreshLatest]);

  useEffect(() => {
    if (!companyId || !enabled || !activeRunId) return;
    void pollRun(activeRunId);
    const id = setInterval(() => {
      void pollRun(activeRunId);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [companyId, enabled, activeRunId, pollRun]);

  return {
    run,
    loading,
    error,
    activeRunId,
    setActiveRunId,
    refreshLatest,
  };
}
