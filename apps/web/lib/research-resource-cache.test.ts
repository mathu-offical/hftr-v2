import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  __resetResearchResourceCacheForTests,
  invalidateResearchResources,
  loadResearchResource,
  peekResearchResource,
  peekResearchResourceMeta,
  readResearchShelfUiState,
  writeResearchShelfUiState,
} from './research-resource-cache';

/** Minimal sessionStorage for Node vitest (cache persists shelf chrome). */
function installSessionStoragePolyfill(): void {
  const store = new Map<string, string>();
  const api: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: api,
  });
}

beforeAll(() => {
  installSessionStoragePolyfill();
});

afterEach(() => {
  __resetResearchResourceCacheForTests();
  sessionStorage.clear();
});

describe('research-resource-cache', () => {
  it('returns fresh cache without calling fetcher again', async () => {
    const fetcher = vi.fn(async () => ['a', 'b']);
    const key = { kind: 'libraries' as const, companyId: 'c1' };

    const first = await loadResearchResource(key, fetcher);
    expect(first.fromCache).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await loadResearchResource(key, fetcher);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual(['a', 'b']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves stale cache and revalidates in background', async () => {
    const key = { kind: 'libraries' as const, companyId: 'c1' };
    let version = 1;
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return [`v${version}`];
    });

    await loadResearchResource(key, fetcher);
    expect(peekResearchResource(key)).toEqual(['v1']);
    expect(peekResearchResourceMeta(key)?.fresh).toBe(true);

    version = 2;
    const staleEntry = {
      data: ['v1'],
      fetchedAt: Date.now() - 90_000,
    };
    sessionStorage.setItem('hftr:research-cache:v1:c1:libraries', JSON.stringify(staleEntry));
    __resetResearchResourceCacheForTests();

    const stale = await loadResearchResource(key, fetcher, { allowStale: true });
    expect(stale.fromCache).toBe(true);
    expect(stale.data).toEqual(['v1']);

    await vi.waitFor(() => {
      expect(peekResearchResource(key)).toEqual(['v2']);
    });
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('dedupes in-flight fetches', async () => {
    const key = { kind: 'topics' as const, companyId: 'c1' };
    let resolveFetch!: (v: string[]) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const p1 = loadResearchResource(key, fetcher);
    const p2 = loadResearchResource(key, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveFetch(['t1']);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.data).toEqual(['t1']);
    expect(b.data).toEqual(['t1']);
  });

  it('invalidate clears memory and session', async () => {
    const key = { kind: 'libraries' as const, companyId: 'c1' };
    await loadResearchResource(key, async () => [{ id: '1' }]);
    expect(peekResearchResource(key)).toEqual([{ id: '1' }]);
    invalidateResearchResources('c1', ['libraries']);
    expect(peekResearchResource(key)).toBeNull();
    expect(peekResearchResourceMeta(key)).toBeNull();
  });

  it('persists and reads shelf UI expand state', () => {
    writeResearchShelfUiState('c1', {
      openCatalogFolderIds: ['baseline_strategy_families'],
      openRuntimeLibraryIds: ['lib-1'],
      openSystemLibraryIds: [],
    });
    expect(readResearchShelfUiState('c1')).toEqual({
      openCatalogFolderIds: ['baseline_strategy_families'],
      openRuntimeLibraryIds: ['lib-1'],
      openSystemLibraryIds: [],
    });
  });
});
