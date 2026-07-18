/** Shared Market posture display helpers (orientation text only — not trading authority). */

export function dollarsFromCents(cents: number | string): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
}

export function pnlLabel(centsStr: string | number | undefined | null): string {
  if (centsStr === undefined || centsStr === null) return '—';
  const n = typeof centsStr === 'string' ? Number(centsStr) : centsStr;
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n / 100).toFixed(2)}`;
}

export function formatOrientation(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export function reportKindLabel(
  kind: 'movers_report' | 'sector_bulletin' | 'daily_summary' | 'other',
): string {
  switch (kind) {
    case 'movers_report':
      return 'Movers';
    case 'sector_bulletin':
      return 'Sector';
    case 'daily_summary':
      return 'Daily';
    case 'other':
      return 'Report';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function equityStatusLabel(status: 'fresh' | 'stale' | 'unavailable'): string {
  switch (status) {
    case 'fresh':
      return 'Fresh';
    case 'stale':
      return 'Stale';
    case 'unavailable':
      return 'Unavailable';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function moversAreStale(opts: {
  status: 'ready' | 'missing' | 'expired';
  expiresAt: string | null;
  nowMs?: number;
}): boolean {
  if (opts.status !== 'ready') return true;
  if (!opts.expiresAt) return false;
  const exp = new Date(opts.expiresAt).getTime();
  if (!Number.isFinite(exp)) return false;
  return exp <= (opts.nowMs ?? Date.now());
}
