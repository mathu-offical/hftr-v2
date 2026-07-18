'use client';

import { useCallback, useState } from 'react';
import type { MarketHubResponse } from '@hftr/contracts';
import {
  useMarketPostureView,
  type MarketPostureCategory,
} from '@/components/panels/MarketPostureViewContext';
import { PanelTabs } from '@/components/panels/PanelTabs';
import {
  WatchlistTierFilterChips,
  watchlistMatchesTierFilter,
  type WatchlistTierFilter,
} from '@/components/panels/WatchlistTierFilters';
import { api } from '@/lib/client';
import { invalidateMarketHub } from '@/lib/market-hub-cache';
import { useMarketHub } from '@/lib/use-market-hub';

const CATEGORIES: { id: MarketPostureCategory; label: string }[] = [
  { id: 'positions', label: 'Positions' },
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'trends', label: 'Trends' },
  { id: 'pipeline', label: 'Plans' },
];

/**
 * Left-panel navigator for Market posture (D-081 / D-085 / D-092). Main dashboard lives in
 * MarketPostureOverlay; this rail lists company-wide persisted categories.
 * Hub data is shared with the overlay via market-hub cache (SWR + warm prefetch).
 */
export function MarketPosturePanel(props: { companyId: string }) {
  const mp = useMarketPostureView();
  const { data: hub, loading, refreshing, error, refresh } = useMarketHub(props.companyId, {
    // Prefetch poller already runs at shell; panel still polls while visible.
    poll: true,
  });
  const [watchlistTierFilter, setWatchlistTierFilter] = useState<WatchlistTierFilter>('default');

  const confirmWatchlist = useCallback(
    async (itemId: string) => {
      await api(`/api/companies/${props.companyId}/watchlists/${itemId}`, {
        method: 'PATCH',
        body: { status: 'watching' },
      });
      invalidateMarketHub({ companyId: props.companyId });
      await refresh(true);
    },
    [props.companyId, refresh],
  );

  if (error && !hub) {
    return <p className="text-xs text-[var(--color-block)]">{error}</p>;
  }

  if (!hub && loading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Loading…
      </p>
    );
  }

  if (!hub) {
    return <p className="text-[10px] text-[var(--color-ink-faint)]">No posture data</p>;
  }

  const filteredWatchlists = hub.watchlists.filter((w) =>
    watchlistMatchesTierFilter(w.status, watchlistTierFilter),
  );

  const counts: Record<MarketPostureCategory, number> = {
    positions: hub.positions.length,
    watchlists: filteredWatchlists.length,
    trends: hub.trendCandidates.length,
    pipeline: hub.pipeline.length,
  };

  return (
    <div className="space-y-3" data-testid="market-posture-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          Dashboard over canvas · select a holding to focus equity
        </p>
        {refreshing ? (
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Sync
          </span>
        ) : null}
      </div>

      <PanelTabs
        aria-label="Market posture categories"
        density="compact"
        value={mp.category}
        onChange={mp.setCategory}
        tabs={CATEGORIES.map((c) => ({
          id: c.id,
          label: c.label,
          meta: counts[c.id],
        }))}
      />

      {mp.category === 'positions' && <PositionList hub={hub} mp={mp} />}

      {mp.category === 'watchlists' && (
        <div className="space-y-2">
          <WatchlistTierFilterChips
            value={watchlistTierFilter}
            onChange={setWatchlistTierFilter}
          />
          <ul className="space-y-1 text-xs">
            {filteredWatchlists.length === 0 ? (
              <li className="text-[var(--color-ink-faint)]">No watchlists for this tier</li>
            ) : (
              filteredWatchlists.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1"
                >
                  <div>
                    <span className="font-medium">{w.symbol}</span>
                    <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                      {w.bias} · {w.status} · {w.moduleName}
                    </span>
                  </div>
                  {w.status === 'suggested_search' || w.status === 'suggested_verified' ? (
                    <button
                      type="button"
                      className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                      onClick={() => void confirmWatchlist(w.id)}
                    >
                      Confirm
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {mp.category === 'trends' && (
        <ul className="space-y-1 text-xs">
          {hub.trendCandidates.length === 0 ? (
            <li className="text-[var(--color-ink-faint)]">No trends</li>
          ) : (
            hub.trendCandidates.map((t) => (
              <li key={t.id} className="rounded border border-[var(--color-line)] px-2 py-1">
                <span className="font-medium">{t.symbol}</span>
                <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                  {t.direction} · {t.status}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      {mp.category === 'pipeline' && (
        <ul className="space-y-1 text-xs">
          {hub.pipeline.length === 0 ? (
            <li className="text-[var(--color-ink-faint)]">No plans</li>
          ) : (
            hub.pipeline.map((row) => (
              <li key={row.symbol} className="rounded border border-[var(--color-line)] px-2 py-1">
                <span className="font-medium">{row.symbol}</span>
                <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                  {row.lead?.status ?? 'no lead'}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      <p className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
        Equity {hub.equity.status}
        {hub.equity.equityCents ? ` · $${(Number(hub.equity.equityCents) / 100).toFixed(2)}` : ''}
      </p>
    </div>
  );
}

function PositionList(props: {
  hub: MarketHubResponse;
  mp: ReturnType<typeof useMarketPostureView>;
}) {
  const { hub, mp } = props;
  if (hub.positions.length === 0) {
    return <p className="text-xs text-[var(--color-ink-faint)]">No open positions</p>;
  }
  return (
    <ul className="space-y-1">
      {hub.positions.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => {
              mp.selectPosition(mp.selectedPositionId === p.id ? null : p.id, p.symbol);
              mp.openOverlay();
            }}
            className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
              mp.selectedPositionId === p.id
                ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
            }`}
          >
            <div className="flex justify-between">
              <span className="font-medium">{p.symbol}</span>
              <span className="font-mono tabular-nums text-[var(--color-ink-faint)]">{p.qty}</span>
            </div>
            {p.engines.length > 0 ? (
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-ink-faint)]">
                {p.engines.map((e) => e.label).join(' · ')}
              </p>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
