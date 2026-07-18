'use client';

import { useCallback, useState } from 'react';
import type { MarketHubResponse } from '@hftr/contracts';
import {
  useMarketPostureView,
  type MarketPostureCategory,
} from '@/components/panels/MarketPostureViewContext';
import { MarketPostureFreshnessStrip } from '@/components/panels/MarketPostureFreshnessStrip';
import { MarketPostureSourcesStrip } from '@/components/panels/MarketPostureSourcesStrip';
import { Justification } from '@/components/panels/Justification';
import { PanelTabs } from '@/components/panels/PanelTabs';
import {
  WatchlistTierFilterChips,
  watchlistMatchesTierFilter,
  type WatchlistTierFilter,
} from '@/components/panels/WatchlistTierFilters';
import {
  dollarsFromCents,
  equityStatusLabel,
  formatOrientation,
  pnlLabel,
} from '@/components/panels/market-posture-format';
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
 * Left-panel navigator for Market posture (D-081 / D-085 / D-092 / D-101).
 * Rail lists company-wide categories; rows focus the overlay dashboard.
 */
export function MarketPosturePanel(props: { companyId: string }) {
  const mp = useMarketPostureView();
  const { data: hub, loading, refreshing, error, refresh } = useMarketHub(props.companyId, {
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
          Dashboard over canvas · select a row to focus
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
                  className={`flex items-start justify-between gap-2 rounded border px-2 py-1 ${
                    mp.selectedSymbol === w.symbol
                      ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                      : 'border-[var(--color-line)]'
                  }`}
                >
                  <Justification
                    sourceClass={w.sourceClass === 'operator' ? 'operator' : 'derived'}
                    block
                    lines={[
                      w.note || 'Watchlist row',
                      `Source: ${w.sourceClass} · status ${w.status}`,
                    ]}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        mp.focusEntity({
                          symbol: w.symbol,
                          category: 'watchlists',
                          positionId: null,
                        })
                      }
                    >
                      <span className="font-medium">{w.symbol}</span>
                      <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                        {w.bias} · {w.status} · {w.sourceClass} · {w.moduleName}
                      </span>
                      {w.note ? (
                        <p className="mt-0.5 truncate text-[10px] text-[var(--color-ink-faint)]">
                          {w.note}
                        </p>
                      ) : null}
                    </button>
                  </Justification>
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
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() =>
                    mp.focusEntity({
                      symbol: t.symbol,
                      category: 'trends',
                      positionId: null,
                    })
                  }
                  className={`w-full rounded border px-2 py-1 text-left ${
                    mp.selectedSymbol === t.symbol
                      ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                      : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
                  }`}
                >
                  <span className="font-medium">{t.symbol}</span>
                  <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                    {t.direction} · {t.strengthBand} · {t.status}
                  </span>
                  {t.engines.length > 0 ? (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-ink-faint)]">
                      {t.engines.map((e) => e.label).join(' · ')}
                    </p>
                  ) : null}
                </button>
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
              <li key={row.symbol}>
                <button
                  type="button"
                  onClick={() =>
                    mp.focusEntity({
                      symbol: row.symbol,
                      category: 'pipeline',
                      positionId: null,
                    })
                  }
                  className={`w-full rounded border px-2 py-1 text-left ${
                    mp.selectedSymbol === row.symbol
                      ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                      : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
                  }`}
                >
                  <span className="font-medium">{row.symbol}</span>
                  <span className="ml-1 font-mono text-[10px] text-[var(--color-ink-faint)]">
                    {row.lead
                      ? `${row.lead.status} · ${row.lead.direction} · ${row.lead.strategyFamily}`
                      : 'no lead'}
                    {row.tree ? ` · tree ${row.tree.status}` : ''}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <div className="space-y-0.5 border-t border-[var(--color-line)] pt-2">
        <MarketPostureSourcesStrip sources={hub.sources} compact />
        <p className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
          Equity {equityStatusLabel(hub.equity.status)}
          {hub.equity.equityCents ? ` · ${dollarsFromCents(hub.equity.equityCents)}` : ''}
          {hub.equity.asOfIso ? ` · as of ${formatOrientation(hub.equity.asOfIso)}` : ''}
          {hub.equity.version > 0 ? ` · v${hub.equity.version}` : ''}
        </p>
        <MarketPostureFreshnessStrip freshness={hub.freshness} compact />
      </div>
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
              const clear = mp.selectedPositionId === p.id;
              mp.focusEntity({
                positionId: clear ? null : p.id,
                symbol: clear ? null : p.symbol,
                category: 'positions',
              });
            }}
            className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
              mp.selectedPositionId === p.id
                ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
            }`}
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium">{p.symbol}</span>
              <span className="font-mono tabular-nums text-[var(--color-ink-faint)]">
                qty {p.qty}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
              uPnL {pnlLabel(p.unrealizedPnlCents)}
              {p.realizedPnlCents != null ? ` · rPnL ${pnlLabel(p.realizedPnlCents)}` : ''}
            </p>
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
