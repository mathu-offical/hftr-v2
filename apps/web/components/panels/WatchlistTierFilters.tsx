'use client';

import type { WatchlistItemStatus } from '@hftr/contracts';

export type WatchlistTierFilter =
  | 'default'
  | 'watching'
  | 'suggested_verified'
  | 'suggested_search'
  | 'triggered'
  | 'archived'
  | 'all';

export const WATCHLIST_TIER_FILTERS: { id: WatchlistTierFilter; label: string }[] = [
  { id: 'default', label: 'Watching + verified' },
  { id: 'watching', label: 'Watching' },
  { id: 'suggested_verified', label: 'Verified suggestions' },
  { id: 'suggested_search', label: 'Search suggestions' },
  { id: 'triggered', label: 'Triggered' },
  { id: 'archived', label: 'Archived' },
  { id: 'all', label: 'All' },
];

/** Default Market posture / bottom panel visibility. */
export function watchlistStatusesForFilter(filter: WatchlistTierFilter): WatchlistItemStatus[] | null {
  switch (filter) {
    case 'default':
      return ['watching', 'suggested_verified'];
    case 'watching':
      return ['watching'];
    case 'suggested_verified':
      return ['suggested_verified'];
    case 'suggested_search':
      return ['suggested_search'];
    case 'triggered':
      return ['triggered'];
    case 'archived':
      return ['archived'];
    case 'all':
      return null;
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function watchlistMatchesTierFilter(
  status: string,
  filter: WatchlistTierFilter,
): boolean {
  const allowed = watchlistStatusesForFilter(filter);
  if (allowed === null) return true;
  return allowed.includes(status as WatchlistItemStatus);
}

export function WatchlistTierFilterChips(props: {
  value: WatchlistTierFilter;
  onChange: (v: WatchlistTierFilter) => void;
  className?: string;
}) {
  return (
    <div
      className={props.className ?? 'flex flex-wrap gap-1'}
      role="group"
      aria-label="Watchlist tier filter"
    >
      {WATCHLIST_TIER_FILTERS.map((f) => {
        const active = props.value === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => props.onChange(f.id)}
            className={
              active
                ? 'rounded border border-[var(--color-accent)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-ink)]'
                : 'rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]'
            }
            aria-pressed={active}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
