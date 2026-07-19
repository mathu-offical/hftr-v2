/**
 * Client SWR cache for live-data-source **query** responses (Data Explorer service tabs).
 * Inventory metadata stays in `live-data-sources-cache.ts`.
 * Provider HTTP is also TTL-cached server-side — this layer avoids re-POSTing on remount.
 */

import type { LiveDataSourceQueryResponse } from '@hftr/contracts';

export type LiveDataSourceQueryCacheKey = {
  companyId: string;
  kind: string;
  mode: 'search' | 'browse';
  query: string;
  maxResults: number;
};

type CachePolicy = {
  freshMs: number;
  staleMs: number;
  persistSession: boolean;
};

/** Diagnostics TTL — prefer cached widgets; background-refresh when stale. */
const POLICY: CachePolicy = {
  freshMs: 5 * 60_000,
  staleMs: 30 * 60_000,
  persistSession: true,
};

type CacheEntry = {
  data: LiveDataSourceQueryResponse;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LiveDataSourceQueryResponse>>();
const listeners = new Set<(key: string) => void>();

export function liveDataSourceQueryKeyString(key: LiveDataSourceQueryCacheKey): string {
  const q = key.query.trim().toLowerCase();
  return `${key.companyId}:live-query:${key.kind}:${key.mode}:${q}:${key.maxResults}`;
}

function sessionStorageKey(keyStr: string): string {
  return `hftr:live-data-query-cache:v1:${keyStr}`;
}

function readSession(keyStr: string): CacheEntry | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(keyStr));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('data' in parsed) ||
      !('fetchedAt' in parsed) ||
      typeof (parsed as CacheEntry).fetchedAt !== 'number'
    ) {
      return null;
    }
    return parsed as CacheEntry;
  } catch {
    return null;
  }
}

function writeSession(keyStr: string, entry: CacheEntry): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(sessionStorageKey(keyStr), JSON.stringify(entry));
  } catch {
    // quota / private mode — memory cache still works
  }
}

function removeSession(keyStr: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(sessionStorageKey(keyStr));
  } catch {
    // ignore
  }
}

function notify(keyStr: string): void {
  for (const listener of listeners) listener(keyStr);
}

function getEntry(key: LiveDataSourceQueryCacheKey): CacheEntry | null {
  const keyStr = liveDataSourceQueryKeyString(key);
  const mem = memory.get(keyStr);
  if (mem) return mem;
  if (!POLICY.persistSession) return null;
  const session = readSession(keyStr);
  if (session) {
    memory.set(keyStr, session);
    return session;
  }
  return null;
}

function putEntry(
  key: LiveDataSourceQueryCacheKey,
  data: LiveDataSourceQueryResponse,
): CacheEntry {
  const keyStr = liveDataSourceQueryKeyString(key);
  const entry: CacheEntry = { data, fetchedAt: Date.now() };
  memory.set(keyStr, entry);
  if (POLICY.persistSession) writeSession(keyStr, entry);
  notify(keyStr);
  return entry;
}

export function peekLiveDataSourceQuery(
  key: LiveDataSourceQueryCacheKey,
): LiveDataSourceQueryResponse | null {
  return getEntry(key)?.data ?? null;
}

export function subscribeLiveDataSourceQueryCache(
  listener: (key: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateLiveDataSourceQuery(opts: {
  companyId: string;
  kind?: string;
}): void {
  const needle = opts.kind
    ? `${opts.companyId}:live-query:${opts.kind}:`
    : `${opts.companyId}:live-query:`;
  for (const keyStr of [...memory.keys()]) {
    if (!keyStr.startsWith(needle)) continue;
    memory.delete(keyStr);
    removeSession(keyStr);
    notify(keyStr);
  }
}

/** Clear all query caches (tests). */
export function clearLiveDataSourceQueryCache(): void {
  for (const keyStr of [...memory.keys()]) {
    removeSession(keyStr);
  }
  memory.clear();
  inflight.clear();
}

export type LoadLiveDataSourceQueryResult = {
  data: LiveDataSourceQueryResponse;
  fromCache: boolean;
};

export async function loadLiveDataSourceQuery(
  key: LiveDataSourceQueryCacheKey,
  fetcher: () => Promise<LiveDataSourceQueryResponse>,
  opts?: {
    force?: boolean;
    allowStale?: boolean;
    onUpdate?: (data: LiveDataSourceQueryResponse) => void;
  },
): Promise<LoadLiveDataSourceQueryResult> {
  const keyStr = liveDataSourceQueryKeyString(key);
  const force = opts?.force ?? false;
  const allowStale = opts?.allowStale ?? true;
  const now = Date.now();
  const existing = getEntry(key);

  if (existing && !force) {
    const age = now - existing.fetchedAt;
    if (age < POLICY.freshMs) {
      return { data: existing.data, fromCache: true };
    }
    if (allowStale && age < POLICY.staleMs) {
      opts?.onUpdate?.(existing.data);
      void revalidate(key, keyStr, fetcher, opts?.onUpdate);
      return { data: existing.data, fromCache: true };
    }
  }

  return {
    data: await revalidate(key, keyStr, fetcher, opts?.onUpdate),
    fromCache: false,
  };
}

async function revalidate(
  key: LiveDataSourceQueryCacheKey,
  keyStr: string,
  fetcher: () => Promise<LiveDataSourceQueryResponse>,
  onUpdate?: (data: LiveDataSourceQueryResponse) => void,
): Promise<LiveDataSourceQueryResponse> {
  const pending = inflight.get(keyStr);
  if (pending) return pending;

  const promise = (async () => {
    const data = await fetcher();
    putEntry(key, data);
    onUpdate?.(data);
    return data;
  })().finally(() => {
    inflight.delete(keyStr);
  });

  inflight.set(keyStr, promise);
  return promise;
}
