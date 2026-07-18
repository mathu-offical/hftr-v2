/**
 * Company TopDrawer slice cache (stale-while-revalidate).
 * Per-company / per-slice entries so tab switches stay warm and only
 * revalidate when viewed after the fresh window.
 */

type CachePolicy = {
  freshMs: number;
  staleMs: number;
};

const POLICY: CachePolicy = {
  freshMs: 20_000,
  staleMs: 10 * 60_000,
};

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export type DrawerSliceKey =
  | 'desk'
  | 'operating'
  | 'philosophy_directives'
  | 'sectors';

export function drawerCacheKey(companyId: string, slice: DrawerSliceKey): string {
  return `${companyId}:drawer:${slice}`;
}

export function peekDrawerSlice<T>(companyId: string, slice: DrawerSliceKey): T | null {
  const entry = memory.get(drawerCacheKey(companyId, slice)) as CacheEntry<T> | undefined;
  return entry?.data ?? null;
}

export function drawerSliceAgeMs(companyId: string, slice: DrawerSliceKey): number | null {
  const entry = memory.get(drawerCacheKey(companyId, slice));
  if (!entry) return null;
  return Date.now() - entry.fetchedAt;
}

export function invalidateDrawerSlice(companyId: string, slice?: DrawerSliceKey): void {
  if (slice) {
    memory.delete(drawerCacheKey(companyId, slice));
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${companyId}:drawer:`)) memory.delete(key);
  }
}

export type LoadDrawerSliceResult<T> = {
  data: T;
  fromCache: boolean;
};

/**
 * Load a drawer slice with stale-while-revalidate.
 * Fresh → return cache. Stale → return cache + background revalidate. Expired → await fetch.
 */
export async function loadDrawerSlice<T>(
  companyId: string,
  slice: DrawerSliceKey,
  fetcher: () => Promise<T>,
  opts?: {
    force?: boolean;
    allowStale?: boolean;
    onUpdate?: (data: T) => void;
  },
): Promise<LoadDrawerSliceResult<T>> {
  const key = drawerCacheKey(companyId, slice);
  const force = opts?.force ?? false;
  const allowStale = opts?.allowStale ?? true;
  const now = Date.now();
  const existing = memory.get(key) as CacheEntry<T> | undefined;

  if (existing && !force) {
    const age = now - existing.fetchedAt;
    if (age < POLICY.freshMs) {
      return { data: existing.data, fromCache: true };
    }
    if (allowStale && age < POLICY.staleMs) {
      opts?.onUpdate?.(existing.data);
      void revalidate(key, fetcher, opts?.onUpdate);
      return { data: existing.data, fromCache: true };
    }
  }

  const data = await revalidate(key, fetcher, opts?.onUpdate);
  return { data, fromCache: false };
}

async function revalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  onUpdate?: (data: T) => void,
): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    const data = await fetcher();
    memory.set(key, { data, fetchedAt: Date.now() });
    onUpdate?.(data);
    return data;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
