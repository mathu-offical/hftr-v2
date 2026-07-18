/**
 * Shared Market posture live-poll + Analyze pause (D-112).
 *
 * Panel + overlay may both mount `useMarketHub`; this module guarantees:
 * - one live interval per company (no double GET …/live)
 * - Analyze pauses live poll for all subscribers
 * - analyzing busy state is shared so Syncing… / Analyze… stay coherent
 */

import type { MarketHubLiveResponse } from '@hftr/contracts';
import { api } from './client';
import {
  MARKET_HUB_LIVE_POLL_MS,
  peekMarketHub,
  putMarketHubSnapshot,
  type MarketHubCacheKey,
} from './market-hub-cache';
import { mergeMarketHubLive } from './market-hub-live-merge';

type Runtime = {
  pollSubscribers: number;
  analyzeDepth: number;
  interval: ReturnType<typeof setInterval> | null;
  liveInflight: boolean;
};

const runtimes = new Map<string, Runtime>();
const analyzeListeners = new Set<(companyId: string, busy: boolean) => void>();

function getRuntime(companyId: string): Runtime {
  let rt = runtimes.get(companyId);
  if (!rt) {
    rt = { pollSubscribers: 0, analyzeDepth: 0, interval: null, liveInflight: false };
    runtimes.set(companyId, rt);
  }
  return rt;
}

function notifyAnalyze(companyId: string, busy: boolean): void {
  for (const listener of analyzeListeners) {
    listener(companyId, busy);
  }
}

export function isMarketHubAnalyzeBusy(companyId: string): boolean {
  return (runtimes.get(companyId)?.analyzeDepth ?? 0) > 0;
}

export function subscribeMarketHubAnalyze(
  listener: (companyId: string, busy: boolean) => void,
): () => void {
  analyzeListeners.add(listener);
  return () => {
    analyzeListeners.delete(listener);
  };
}

/** Increment Analyze pause; live ticks no-op until depth returns to 0. */
export function beginMarketHubAnalyze(companyId: string): void {
  const rt = getRuntime(companyId);
  rt.analyzeDepth += 1;
  if (rt.analyzeDepth === 1) notifyAnalyze(companyId, true);
}

export function endMarketHubAnalyze(companyId: string): void {
  const rt = runtimes.get(companyId);
  if (!rt || rt.analyzeDepth <= 0) return;
  rt.analyzeDepth -= 1;
  if (rt.analyzeDepth === 0) notifyAnalyze(companyId, false);
}

async function tickLive(companyId: string): Promise<void> {
  const rt = runtimes.get(companyId);
  if (!rt || rt.analyzeDepth > 0 || rt.liveInflight) return;
  const key: MarketHubCacheKey = { companyId };
  const current = peekMarketHub(key);
  if (!current) return;
  rt.liveInflight = true;
  try {
    const live = await api<MarketHubLiveResponse>(
      `/api/companies/${companyId}/market-hub/live`,
    );
    if (rt.analyzeDepth > 0) return;
    const latest = peekMarketHub(key) ?? current;
    putMarketHubSnapshot(key, mergeMarketHubLive(latest, live));
  } catch {
    // Silent — never surfaces as hub failure or blocks Analyze.
  } finally {
    rt.liveInflight = false;
  }
}

/**
 * Ref-counted live poll. First subscriber starts the interval; last stops it.
 * Cache subscribers receive merges via `subscribeMarketHubCache`.
 */
export function acquireMarketHubLivePoll(companyId: string): () => void {
  const rt = getRuntime(companyId);
  rt.pollSubscribers += 1;
  if (rt.pollSubscribers === 1) {
    rt.interval = setInterval(() => {
      void tickLive(companyId);
    }, MARKET_HUB_LIVE_POLL_MS);
  }
  return () => {
    const cur = runtimes.get(companyId);
    if (!cur) return;
    cur.pollSubscribers = Math.max(0, cur.pollSubscribers - 1);
    if (cur.pollSubscribers === 0 && cur.interval !== null) {
      clearInterval(cur.interval);
      cur.interval = null;
    }
    if (cur.pollSubscribers === 0 && cur.analyzeDepth === 0 && !cur.liveInflight) {
      runtimes.delete(companyId);
    }
  };
}
