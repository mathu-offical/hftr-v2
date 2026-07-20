/**
 * Client-side Market posture hub cache (SWR-style).
 *
 * Panel + overlay share one entry per company so tab/overlay navigation
 * stays warm. Session persistence survives panel collapse within the tab.
 */

import type { MarketHubResponse } from '@hftr/contracts';

export type MarketHubCacheKey = { companyId: string };

type CachePolicy = {
  freshMs: number;
  staleMs: number;
  persistSession: boolean;
};

/** Aligns with ~15s equity cadence; stale window keeps nav seamless. */
const POLICY: CachePolicy = {
  freshMs: 15_000,
  staleMs: 10 * 60_000,
  persistSession: true,
};

type CacheEntry = {
  data: MarketHubResponse;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MarketHubResponse>>();
const listeners = new Set<(key: string) => void>();

export function marketHubKeyString(key: MarketHubCacheKey): string {
  return `${key.companyId}:market-hub`;
}

function sessionStorageKey(keyStr: string): string {
  return `hftr:market-hub-cache:v1:${keyStr}`;
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

function getEntry(key: MarketHubCacheKey): CacheEntry | null {
  const keyStr = marketHubKeyString(key);
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

function putEntry(key: MarketHubCacheKey, data: MarketHubResponse): CacheEntry {
  const keyStr = marketHubKeyString(key);
  const entry: CacheEntry = { data, fetchedAt: Date.now() };
  memory.set(keyStr, entry);
  if (POLICY.persistSession) writeSession(keyStr, entry);
  notify(keyStr);
  return entry;
}

export function peekMarketHub(key: MarketHubCacheKey): MarketHubResponse | null {
  return getEntry(key)?.data ?? null;
}

export function subscribeMarketHubCache(listener: (key: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateMarketHub(key: MarketHubCacheKey): void {
  const keyStr = marketHubKeyString(key);
  memory.delete(keyStr);
  removeSession(keyStr);
  notify(keyStr);
}

/**
 * Mark cached hub past-fresh without wiping the snapshot.
 * Ages just beyond `freshMs` so the next load returns cache immediately and
 * revalidates in the background (Analyze must not cold-reload the company shell).
 */
export function markMarketHubStale(key: MarketHubCacheKey): void {
  const keyStr = marketHubKeyString(key);
  const entry = getEntry(key);
  if (!entry) return;
  const stale: CacheEntry = {
    data: entry.data,
    fetchedAt: Date.now() - POLICY.freshMs - 1,
  };
  memory.set(keyStr, stale);
  if (POLICY.persistSession) writeSession(keyStr, stale);
}

/** Write a merged snapshot (e.g. after live slice) without refetch. */
export function putMarketHubSnapshot(key: MarketHubCacheKey, data: MarketHubResponse): void {
  putEntry(key, data);
}

export type LoadMarketHubResult = {
  data: MarketHubResponse;
  fromCache: boolean;
};

/**
 * Load hub with stale-while-revalidate. Fresh entries skip network unless force.
 */
export async function loadMarketHub(
  key: MarketHubCacheKey,
  fetcher: () => Promise<MarketHubResponse>,
  opts?: {
    force?: boolean;
    allowStale?: boolean;
    onUpdate?: (data: MarketHubResponse) => void;
  },
): Promise<LoadMarketHubResult> {
  const keyStr = marketHubKeyString(key);
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
  key: MarketHubCacheKey,
  keyStr: string,
  fetcher: () => Promise<MarketHubResponse>,
  onUpdate?: (data: MarketHubResponse) => void,
): Promise<MarketHubResponse> {
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

/** Age of cached hub in ms, or null when empty. */
export function marketHubAgeMs(key: MarketHubCacheKey): number | null {
  const entry = getEntry(key);
  if (!entry) return null;
  return Date.now() - entry.fetchedAt;
}

export const MARKET_HUB_POLL_MS = POLICY.freshMs;

/** Silent live-slice poll cadence (equity / marks). Full hub is not polled. */
export const MARKET_HUB_LIVE_POLL_MS = POLICY.freshMs;
