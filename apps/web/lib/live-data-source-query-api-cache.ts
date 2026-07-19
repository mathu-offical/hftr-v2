/**
 * In-process TTL cache for live-data-source query API responses.
 * Dedupes concurrent POSTs and avoids re-gathering within the fresh window.
 * Does not store credentials — key is company + kind + query shape only.
 */

import type { LiveDataSourceQueryResponse } from '@hftr/contracts';

export const LIVE_DATA_SOURCE_QUERY_API_TTL_MS = 5 * 60_000;

type CacheEntry = {
  data: LiveDataSourceQueryResponse;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LiveDataSourceQueryResponse>>();

export function liveDataSourceQueryApiCacheKey(parts: {
  companyId: string;
  kind: string;
  mode: string;
  query: string;
  maxResults: number;
}): string {
  return [
    parts.companyId,
    parts.kind,
    parts.mode,
    parts.query.trim().toLowerCase(),
    String(parts.maxResults),
  ].join('|');
}

export async function loadLiveDataSourceQueryApiCached(
  key: string,
  fetcher: () => Promise<LiveDataSourceQueryResponse>,
  opts?: { force?: boolean; nowMs?: number },
): Promise<{ data: LiveDataSourceQueryResponse; fromCache: boolean }> {
  const force = opts?.force ?? false;
  const nowMs = opts?.nowMs ?? Date.now();

  if (!force) {
    const hit = memory.get(key);
    if (hit && nowMs - hit.fetchedAt <= LIVE_DATA_SOURCE_QUERY_API_TTL_MS) {
      return { data: hit.data, fromCache: true };
    }
    if (hit && nowMs - hit.fetchedAt > LIVE_DATA_SOURCE_QUERY_API_TTL_MS) {
      memory.delete(key);
    }
  }

  const pending = inflight.get(key);
  if (pending && !force) {
    const data = await pending;
    return { data, fromCache: false };
  }

  const promise = (async () => {
    const data = await fetcher();
    memory.set(key, { data, fetchedAt: Date.now() });
    return data;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  const data = await promise;
  return { data, fromCache: false };
}

export function clearLiveDataSourceQueryApiCache(): void {
  memory.clear();
  inflight.clear();
}
