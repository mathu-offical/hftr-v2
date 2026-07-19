/**
 * Company list metadata cache (D-197).
 *
 * Slim id/name/mode rows for CompanySwitcher and other selection UIs.
 * Stale-while-revalidate in module memory — never persists secrets.
 */

export type CompanyListMeta = {
  id: string;
  name: string;
  mode: string;
};

type CachePolicy = {
  freshMs: number;
  staleMs: number;
};

const POLICY: CachePolicy = {
  freshMs: 60_000,
  staleMs: 30 * 60_000,
};

type CacheState = {
  rows: CompanyListMeta[];
  fetchedAt: number;
};

let state: CacheState | null = null;
let inflight: Promise<CompanyListMeta[]> | null = null;

export function peekCompanyListMeta(): CompanyListMeta[] | null {
  return state ? state.rows.map((r) => ({ ...r })) : null;
}

export function companyListMetaAgeMs(): number | null {
  if (!state) return null;
  return Date.now() - state.fetchedAt;
}

export function setCompanyListMeta(rows: CompanyListMeta[]): void {
  state = {
    rows: rows.map((r) => ({ id: r.id, name: r.name, mode: r.mode })),
    fetchedAt: Date.now(),
  };
}

export function invalidateCompanyListMeta(): void {
  state = null;
  inflight = null;
}

export function upsertCompanyListMeta(row: CompanyListMeta): void {
  const next = { id: row.id, name: row.name, mode: row.mode };
  if (!state) {
    state = { rows: [next], fetchedAt: Date.now() };
    return;
  }
  const idx = state.rows.findIndex((r) => r.id === next.id);
  const rows = [...state.rows];
  if (idx >= 0) rows[idx] = next;
  else rows.unshift(next);
  state = { rows, fetchedAt: state.fetchedAt };
}

export function patchCompanyListMeta(
  id: string,
  patch: Partial<Pick<CompanyListMeta, 'name' | 'mode'>>,
): void {
  if (!state) return;
  const idx = state.rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const rows = [...state.rows];
  const prev = rows[idx]!;
  rows[idx] = {
    id: prev.id,
    name: patch.name ?? prev.name,
    mode: patch.mode ?? prev.mode,
  };
  state = { rows, fetchedAt: state.fetchedAt };
}

export function removeCompanyListMeta(id: string): void {
  if (!state) return;
  state = {
    rows: state.rows.filter((r) => r.id !== id),
    fetchedAt: state.fetchedAt,
  };
}

export type LoadCompanyListMetaResult = {
  data: CompanyListMeta[];
  fromCache: boolean;
};

/**
 * Load company list metadata with stale-while-revalidate.
 * Fresh → cache. Stale → cache + background revalidate. Expired → await fetch.
 */
export async function loadCompanyListMeta(
  fetcher: () => Promise<CompanyListMeta[]>,
  opts?: {
    force?: boolean;
    allowStale?: boolean;
    onUpdate?: (data: CompanyListMeta[]) => void;
  },
): Promise<LoadCompanyListMetaResult> {
  const force = opts?.force ?? false;
  const allowStale = opts?.allowStale ?? true;
  const now = Date.now();

  if (state && !force) {
    const age = now - state.fetchedAt;
    if (age < POLICY.freshMs) {
      return { data: peekCompanyListMeta()!, fromCache: true };
    }
    if (allowStale && age < POLICY.staleMs) {
      const cached = peekCompanyListMeta()!;
      opts?.onUpdate?.(cached);
      void revalidate(fetcher, opts?.onUpdate);
      return { data: cached, fromCache: true };
    }
  }

  const data = await revalidate(fetcher, opts?.onUpdate);
  return { data, fromCache: false };
}

async function revalidate(
  fetcher: () => Promise<CompanyListMeta[]>,
  onUpdate?: (data: CompanyListMeta[]) => void,
): Promise<CompanyListMeta[]> {
  if (inflight) return inflight;

  const promise = (async () => {
    const data = await fetcher();
    setCompanyListMeta(data);
    const copy = peekCompanyListMeta()!;
    onUpdate?.(copy);
    return copy;
  })();

  inflight = promise;
  try {
    return await promise;
  } finally {
    inflight = null;
  }
}

/** Map GET /api/companies rows (or directory rows) into slim meta. */
export function toCompanyListMeta(
  rows: Array<{ id: string; name: string; mode: string }>,
): CompanyListMeta[] {
  return rows.map((r) => ({ id: r.id, name: r.name, mode: r.mode }));
}
