/**
 * Client SWR cache for live data source **inventory** (existence + readiness metadata).
 * Live query/browse payloads are NOT stored here — fetch on demand in Data Explorer.
 */

import type { LiveDataSourcesResponse } from '@hftr/contracts';

export type LiveDataSourcesCacheKey = { companyId: string };

type CachePolicy = {
  freshMs: number;
  staleMs: number;
  persistSession: boolean;
};

/** Metadata changes rarely (keys / canvas binds); long fresh window. */
const POLICY: CachePolicy = {
  freshMs: 5 * 60_000,
  staleMs: 30 * 60_000,
  persistSession: true,
};

type CacheEntry = {
  data: LiveDataSourcesResponse;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LiveDataSourcesResponse>>();
const listeners = new Set<(key: string) => void>();

export function liveDataSourcesKeyString(key: LiveDataSourcesCacheKey): string {
  return `${key.companyId}:live-data-sources`;
}

function sessionStorageKey(keyStr: string): string {
  return `hftr:live-data-sources-cache:v1:${keyStr}`;
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
    // quota / private mode
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

function getEntry(key: LiveDataSourcesCacheKey): CacheEntry | null {
  const keyStr = liveDataSourcesKeyString(key);
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

function putEntry(key: LiveDataSourcesCacheKey, data: LiveDataSourcesResponse): CacheEntry {
  const keyStr = liveDataSourcesKeyString(key);
  const entry: CacheEntry = { data, fetchedAt: Date.now() };
  memory.set(keyStr, entry);
  if (POLICY.persistSession) writeSession(keyStr, entry);
  notify(keyStr);
  return entry;
}

export function peekLiveDataSources(key: LiveDataSourcesCacheKey): LiveDataSourcesResponse | null {
  return getEntry(key)?.data ?? null;
}

export function subscribeLiveDataSourcesCache(listener: (key: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateLiveDataSources(key: LiveDataSourcesCacheKey): void {
  const keyStr = liveDataSourcesKeyString(key);
  memory.delete(keyStr);
  removeSession(keyStr);
  notify(keyStr);
}

export type LoadLiveDataSourcesResult = {
  data: LiveDataSourcesResponse;
  fromCache: boolean;
};

export async function loadLiveDataSources(
  key: LiveDataSourcesCacheKey,
  fetcher: () => Promise<LiveDataSourcesResponse>,
  opts?: {
    force?: boolean;
    allowStale?: boolean;
    onUpdate?: (data: LiveDataSourcesResponse) => void;
  },
): Promise<LoadLiveDataSourcesResult> {
  const keyStr = liveDataSourcesKeyString(key);
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

  return { data: await revalidate(key, keyStr, fetcher, opts?.onUpdate), fromCache: false };
}

async function revalidate(
  key: LiveDataSourcesCacheKey,
  keyStr: string,
  fetcher: () => Promise<LiveDataSourcesResponse>,
  onUpdate?: (data: LiveDataSourcesResponse) => void,
): Promise<LiveDataSourcesResponse> {
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
