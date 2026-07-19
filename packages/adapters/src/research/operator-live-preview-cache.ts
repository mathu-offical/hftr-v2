/**
 * In-process TTL cache for operator live-preview provider fetches.
 * Diagnostics must not re-hit CoinGecko / Frankfurter / Alpaca on every tab open.
 * Never stores credentials — only kind + public query shape (+ keyId hint for Alpaca).
 */

import type { LiveDataSourceWidget } from '@hftr/contracts';

export const OPERATOR_LIVE_PREVIEW_TTL_MS = 5 * 60_000;

type CacheEntry = {
  widgets: LiveDataSourceWidget[];
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LiveDataSourceWidget[]>>();

export function operatorLivePreviewCacheKey(parts: {
  kind: string;
  query: string;
  maxResults: number;
  /** Last-4 or key id only — never the secret. */
  alpacaKeyHint?: string;
}): string {
  const q = parts.query.trim().toUpperCase();
  const hint = parts.alpacaKeyHint?.trim() ?? '';
  return `${parts.kind}|${q}|${parts.maxResults}|${hint}`;
}

export function peekOperatorLivePreviewCache(
  key: string,
  nowMs = Date.now(),
): CacheEntry | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (nowMs - entry.fetchedAt > OPERATOR_LIVE_PREVIEW_TTL_MS) {
    memory.delete(key);
    return null;
  }
  return entry;
}

export async function loadOperatorLivePreviewCached(
  key: string,
  fetcher: () => Promise<LiveDataSourceWidget[]>,
  opts?: { force?: boolean; nowMs?: number },
): Promise<{ widgets: LiveDataSourceWidget[]; fromCache: boolean; fetchedAt: number }> {
  const force = opts?.force ?? false;
  const nowMs = opts?.nowMs ?? Date.now();

  if (!force) {
    const hit = peekOperatorLivePreviewCache(key, nowMs);
    if (hit) {
      return { widgets: hit.widgets, fromCache: true, fetchedAt: hit.fetchedAt };
    }
  }

  const pending = inflight.get(key);
  if (pending && !force) {
    const widgets = await pending;
    const entry = memory.get(key);
    return {
      widgets,
      fromCache: false,
      fetchedAt: entry?.fetchedAt ?? nowMs,
    };
  }

  const promise = (async () => {
    const widgets = await fetcher();
    memory.set(key, { widgets, fetchedAt: Date.now() });
    return widgets;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  const widgets = await promise;
  const entry = memory.get(key);
  return {
    widgets,
    fromCache: false,
    fetchedAt: entry?.fetchedAt ?? Date.now(),
  };
}

/** Test / ops helper — clears all preview provider caches. */
export function clearOperatorLivePreviewCache(): void {
  memory.clear();
  inflight.clear();
}
