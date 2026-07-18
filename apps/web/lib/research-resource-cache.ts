/**
 * Client-side research library resource cache (SWR-style).
 *
 * Shell lists (libraries, topics, library page indexes) hydrate from memory →
 * sessionStorage for instant UI chrome; network revalidates in the background.
 * Heavier concept bodies stay memory-only. Mutations call invalidate*.
 */

export type ResearchShellKind = 'libraries' | 'topics' | 'concepts' | 'libraryConcepts' | 'archive';

export type ResearchResourceKey =
  | { kind: 'libraries'; companyId: string }
  | { kind: 'topics'; companyId: string }
  | { kind: 'concepts'; companyId: string }
  | { kind: 'libraryConcepts'; companyId: string; libraryId: string }
  | { kind: 'archive'; companyId: string };

type CachePolicy = {
  /** Serve without network when younger than this. */
  freshMs: number;
  /** Still usable while a background revalidate runs. */
  staleMs: number;
  /** Persist across panel close / soft reload within the tab. */
  persistSession: boolean;
};

const POLICIES: Record<ResearchShellKind, CachePolicy> = {
  // Shelf chrome — keep snappy across open/close.
  libraries: { freshMs: 60_000, staleMs: 30 * 60_000, persistSession: true },
  topics: { freshMs: 45_000, staleMs: 15 * 60_000, persistSession: true },
  // Full concept rows (incl. body) — memory only; titles/tags drive search.
  concepts: { freshMs: 45_000, staleMs: 15 * 60_000, persistSession: false },
  // Lazy folder page indexes — cache once opened; baseline is warm-prefetchable.
  libraryConcepts: { freshMs: 90_000, staleMs: 60 * 60_000, persistSession: true },
  archive: { freshMs: 30_000, staleMs: 10 * 60_000, persistSession: false },
};

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const memory = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<(key: string) => void>();

function policyFor(kind: ResearchShellKind): CachePolicy {
  return POLICIES[kind];
}

export function researchResourceKeyString(key: ResearchResourceKey): string {
  if (key.kind === 'libraryConcepts') {
    return `${key.companyId}:libraryConcepts:${key.libraryId}`;
  }
  return `${key.companyId}:${key.kind}`;
}

function sessionStorageKey(keyStr: string): string {
  return `hftr:research-cache:v1:${keyStr}`;
}

function readSession<T>(keyStr: string): CacheEntry<T> | null {
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
      typeof (parsed as CacheEntry<T>).fetchedAt !== 'number'
    ) {
      return null;
    }
    return parsed as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeSession<T>(keyStr: string, entry: CacheEntry<T>): void {
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
  for (const listener of listeners) {
    try {
      listener(keyStr);
    } catch {
      // subscriber errors must not break cache writes
    }
  }
}

export function subscribeResearchCache(listener: (keyStr: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Peek cached value without fetching (memory, then session for persistable kinds). */
export function peekResearchResource<T>(key: ResearchResourceKey): T | null {
  const keyStr = researchResourceKeyString(key);
  const mem = memory.get(keyStr) as CacheEntry<T> | undefined;
  if (mem) return mem.data;

  const policy = policyFor(key.kind);
  if (!policy.persistSession) return null;
  const session = readSession<T>(keyStr);
  if (!session) return null;
  memory.set(keyStr, session);
  return session.data;
}

export function peekResearchResourceMeta(key: ResearchResourceKey): {
  fetchedAt: number;
  ageMs: number;
  fresh: boolean;
  staleUsable: boolean;
} | null {
  const keyStr = researchResourceKeyString(key);
  let entry = memory.get(keyStr) as CacheEntry<unknown> | undefined;
  if (!entry && policyFor(key.kind).persistSession) {
    entry = readSession(keyStr) ?? undefined;
    if (entry) memory.set(keyStr, entry);
  }
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  const policy = policyFor(key.kind);
  return {
    fetchedAt: entry.fetchedAt,
    ageMs,
    fresh: ageMs < policy.freshMs,
    staleUsable: ageMs < policy.staleMs,
  };
}

function writeCache<T>(key: ResearchResourceKey, data: T): void {
  const keyStr = researchResourceKeyString(key);
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  memory.set(keyStr, entry);
  if (policyFor(key.kind).persistSession) {
    writeSession(keyStr, entry);
  }
  notify(keyStr);
}

export type LoadResearchResourceResult<T> = {
  data: T;
  fromCache: boolean;
  revalidated: boolean;
};

/**
 * Stale-while-revalidate loader with in-flight dedupe.
 * - Cached + fresh → return immediately (no network)
 * - Cached + stale-usable → return cache, optionally revalidate in background
 * - Missing / force → await network
 */
export async function loadResearchResource<T>(
  key: ResearchResourceKey,
  fetcher: () => Promise<T>,
  opts?: {
    force?: boolean;
    /** When true and stale cache exists, return cache and refresh in background. */
    allowStale?: boolean;
    onUpdate?: (data: T) => void;
  },
): Promise<LoadResearchResourceResult<T>> {
  const keyStr = researchResourceKeyString(key);
  const policy = policyFor(key.kind);
  const allowStale = opts?.allowStale ?? true;
  const force = opts?.force ?? false;

  const cached = peekResearchResource<T>(key);
  const meta = peekResearchResourceMeta(key);

  if (!force && cached !== null && meta?.fresh) {
    return { data: cached, fromCache: true, revalidated: false };
  }

  const runFetch = (): Promise<T> => {
    const existing = inflight.get(keyStr) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fetcher()
      .then((data) => {
        writeCache(key, data);
        opts?.onUpdate?.(data);
        return data;
      })
      .finally(() => {
        inflight.delete(keyStr);
      });
    inflight.set(keyStr, promise);
    return promise;
  };

  if (!force && cached !== null && meta?.staleUsable && allowStale) {
    void runFetch().catch(() => {
      // keep serving stale on network failure
    });
    return { data: cached, fromCache: true, revalidated: false };
  }

  const data = await runFetch();
  return { data, fromCache: false, revalidated: true };
}

/** Invalidate one or more kinds for a company (optionally one libraryConcepts id). */
export function invalidateResearchResources(
  companyId: string,
  kinds?: ResearchShellKind[],
  libraryId?: string,
): void {
  const targets = kinds ?? (Object.keys(POLICIES) as ResearchShellKind[]);
  for (const kind of targets) {
    if (kind === 'libraryConcepts') {
      if (libraryId) {
        const keyStr = researchResourceKeyString({
          kind: 'libraryConcepts',
          companyId,
          libraryId,
        });
        memory.delete(keyStr);
        removeSession(keyStr);
        inflight.delete(keyStr);
        notify(keyStr);
      } else {
        const prefix = `${companyId}:libraryConcepts:`;
        for (const keyStr of [...memory.keys()]) {
          if (!keyStr.startsWith(prefix)) continue;
          memory.delete(keyStr);
          removeSession(keyStr);
          inflight.delete(keyStr);
          notify(keyStr);
        }
        // session keys we may not have in memory
        if (typeof sessionStorage !== 'undefined') {
          try {
            const toRemove: string[] = [];
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i);
              if (k?.startsWith(`hftr:research-cache:v1:${prefix}`)) toRemove.push(k);
            }
            for (const k of toRemove) sessionStorage.removeItem(k);
          } catch {
            // ignore
          }
        }
      }
      continue;
    }
    const keyStr = researchResourceKeyString({ kind, companyId } as ResearchResourceKey);
    memory.delete(keyStr);
    removeSession(keyStr);
    inflight.delete(keyStr);
    notify(keyStr);
  }
}

/** Persist which shelf folders are expanded (UI chrome only). */
export type ResearchShelfUiState = {
  openCatalogFolderIds: string[];
  openRuntimeLibraryIds: string[];
  openSystemLibraryIds: string[];
};

const DEFAULT_SHELF_UI: ResearchShelfUiState = {
  openCatalogFolderIds: [],
  openRuntimeLibraryIds: [],
  openSystemLibraryIds: [],
};

function shelfUiStorageKey(companyId: string): string {
  return `hftr:research-shelf-ui:v1:${companyId}`;
}

export function readResearchShelfUiState(companyId: string): ResearchShelfUiState {
  if (typeof sessionStorage === 'undefined') return { ...DEFAULT_SHELF_UI };
  try {
    const raw = sessionStorage.getItem(shelfUiStorageKey(companyId));
    if (!raw) return { ...DEFAULT_SHELF_UI };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SHELF_UI };
    const o = parsed as Partial<ResearchShelfUiState>;
    return {
      openCatalogFolderIds: Array.isArray(o.openCatalogFolderIds)
        ? o.openCatalogFolderIds.filter((x): x is string => typeof x === 'string')
        : [],
      openRuntimeLibraryIds: Array.isArray(o.openRuntimeLibraryIds)
        ? o.openRuntimeLibraryIds.filter((x): x is string => typeof x === 'string')
        : [],
      openSystemLibraryIds: Array.isArray(o.openSystemLibraryIds)
        ? o.openSystemLibraryIds.filter((x): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULT_SHELF_UI };
  }
}

export function writeResearchShelfUiState(companyId: string, state: ResearchShelfUiState): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(shelfUiStorageKey(companyId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Test helper — clear all research cache state. */
export function __resetResearchResourceCacheForTests(): void {
  memory.clear();
  inflight.clear();
  listeners.clear();
}

export function __researchCachePoliciesForTests(): typeof POLICIES {
  return POLICIES;
}
