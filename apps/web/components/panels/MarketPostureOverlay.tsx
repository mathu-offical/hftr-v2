'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { MarketHubPosition } from '@hftr/contracts';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { MarketPostureEquityChart } from '@/components/panels/MarketPostureEquityChart';
import { MarketPostureFreshnessStrip } from '@/components/panels/MarketPostureFreshnessStrip';
import { MarketPostureSourcesStrip } from '@/components/panels/MarketPostureSourcesStrip';
import { useMarketPostureView } from '@/components/panels/MarketPostureViewContext';
import { Justification } from '@/components/panels/Justification';
import {
  WatchlistTierFilterChips,
  watchlistMatchesTierFilter,
  type WatchlistTierFilter,
} from '@/components/panels/WatchlistTierFilters';
import {
  dollarsFromCents,
  formatOrientation,
  moversAreStale,
  pnlLabel,
  reportKindLabel,
} from '@/components/panels/market-posture-format';
import { api } from '@/lib/client';
import { invalidateMarketHub } from '@/lib/market-hub-cache';
import { useMarketHub } from '@/lib/use-market-hub';

function EngineChips(props: { engines: { id: string; label: string }[] }) {
  if (props.engines.length === 0) {
    return <span className="text-[10px] text-[var(--color-ink-faint)]">No engine binding</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {props.engines.map((e) => (
        <span
          key={e.id}
          className="rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-dim)]"
          title={e.label}
        >
          {e.label}
        </span>
      ))}
    </div>
  );
}

function focusRing(active: boolean): string {
  return active
    ? 'ring-1 ring-[var(--color-accent)] border-[var(--color-accent)]'
    : 'border-[var(--color-line)]';
}

/**
 * Canvas overlay dashboard for Market posture (D-085 / D-101) — live hub with
 * equity, movers, reports, holdings, and category grids at rail parity.
 */
export function MarketPostureOverlay() {
  const mp = useMarketPostureView();
  const research = useResearchView();
  const { data: hub, loading, refreshing, error, refresh, refreshMovers } = useMarketHub(
    mp.companyId,
    {
      enabled: true,
      poll: mp.overlayOpen,
    },
  );
  const [watchlistTierFilter, setWatchlistTierFilter] = useState<WatchlistTierFilter>('default');
  const detailRef = useRef<HTMLElement | null>(null);

  const selectedPosition: MarketHubPosition | null = useMemo(() => {
    if (!hub || !mp.selectedPositionId) return null;
    return hub.positions.find((p) => p.id === mp.selectedPositionId) ?? null;
  }, [hub, mp.selectedPositionId]);

  const selectedQty = selectedPosition ? Number(selectedPosition.qty) : null;
  const selectedMark =
    selectedPosition && Number.isFinite(Number(selectedPosition.markCents))
      ? Number(selectedPosition.markCents)
      : null;

  const equityLabel = hub?.equity.equityCents
    ? dollarsFromCents(hub.equity.equityCents)
    : 'Unavailable';

  const pipelineForSelected = useMemo(() => {
    if (!hub || !mp.selectedSymbol) return null;
    return hub.pipeline.find((p) => p.symbol === mp.selectedSymbol) ?? null;
  }, [hub, mp.selectedSymbol]);

  const filteredWatchlists = useMemo(() => {
    if (!hub) return [];
    return hub.watchlists.filter((w) => watchlistMatchesTierFilter(w.status, watchlistTierFilter));
  }, [hub, watchlistTierFilter]);

  const moversStale = hub
    ? moversAreStale({ status: hub.movers.status, expiresAt: hub.movers.expiresAt })
    : false;

  const openReport = (conceptId: string) => {
    research.openOverlay();
    research.inspectConcept(conceptId);
  };

  const confirmWatchlist = useCallback(
    async (itemId: string) => {
      await api(`/api/companies/${mp.companyId}/watchlists/${itemId}`, {
        method: 'PATCH',
        body: { status: 'watching' },
      });
      invalidateMarketHub({ companyId: mp.companyId });
      await refresh(true);
    },
    [mp.companyId, refresh],
  );

  useEffect(() => {
    if (!mp.overlayOpen || !mp.selectedSymbol) return;
    const el = document.querySelector(
      `[data-posture-focus-symbol="${CSS.escape(mp.selectedSymbol)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (detailRef.current) {
      detailRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [mp.overlayOpen, mp.selectedSymbol, mp.selectedPositionId, mp.category]);

  if (!mp.overlayOpen) return null;

  return (
    <div
      data-testid="market-posture-overlay"
      className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm"
      role="dialog"
      aria-label="Market posture dashboard"
    >
      <header className="flex shrink-0 flex-col gap-1 border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-medium text-[var(--color-ink)]">Market posture</span>
            {hub && hub.sectorFocuses.length > 0 ? (
              <p className="truncate text-[10px] text-[var(--color-ink-faint)]">
                Sector lens: {hub.sectorFocuses.join(' · ')}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshMovers()}
              disabled={refreshing}
              className="border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-50"
            >
              {refreshing ? 'Sync…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={mp.closeWorkspace}
              aria-label="Close market posture"
              className="rounded p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {hub ? <MarketPostureFreshnessStrip freshness={hub.freshness} /> : null}
        {hub ? (
          <div className="px-3 pb-2">
            <MarketPostureSourcesStrip sources={hub.sources} />
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {error && !hub ? (
          <p className="text-xs text-[var(--color-block)]">{error}</p>
        ) : !hub && loading ? (
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Loading dashboard…
          </p>
        ) : !hub ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">No posture data</p>
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
              <MarketPostureEquityChart
                series={hub.equity.series}
                selectedQty={Number.isFinite(selectedQty) ? selectedQty : null}
                selectedMarkCents={selectedMark}
                selectedSymbol={selectedPosition?.symbol ?? mp.selectedSymbol}
                equityLabel={equityLabel}
                equityStatus={hub.equity.status}
                asOfIso={hub.equity.asOfIso}
                version={hub.equity.version}
              />
              <div
                className={`space-y-2 rounded border bg-[var(--color-surface-1)] p-2.5 ${
                  moversStale
                    ? 'border-[var(--color-warn,var(--color-ink-faint))]'
                    : 'border-[var(--color-line)]'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-1">
                  <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                    {hub.movers.title ?? 'Top movers in sector'}
                  </h3>
                  <span className="font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                    {hub.movers.status}
                    {hub.movers.corroborationBand
                      ? ` · ${hub.movers.corroborationBand}`
                      : ''}
                  </span>
                </div>
                <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                  Verified {formatOrientation(hub.movers.verifiedAt)} · expires{' '}
                  {formatOrientation(hub.movers.expiresAt)}
                  {moversStale ? ' · stale' : ''}
                </p>
                {hub.movers.items.length === 0 ? (
                  <p className="text-xs text-[var(--color-ink-faint)]">
                    No movers seal yet ({hub.movers.status}).
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {hub.movers.items.slice(0, 8).map((item, i) => (
                      <li key={`${item.symbolOrSector ?? 'm'}-${i}`}>
                        <Justification
                          sourceClass="system_seal"
                          lines={[
                            item.headline ?? 'Sealed movers board item',
                            `Bands: ${[item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || 'n/a'}`,
                          ]}
                        >
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="font-medium text-[var(--color-ink)]">
                              {item.symbolOrSector ?? 'Cluster'}
                            </span>
                            <span className="shrink-0 text-[10px] uppercase text-[var(--color-ink-faint)]">
                              {[item.directionBand, item.strengthBand].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        </Justification>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-line)] pt-2">
                  <span className="w-full text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                    Reports
                  </span>
                  {hub.reports.length === 0 ? (
                    <span className="text-[10px] text-[var(--color-ink-faint)]">
                      No sealed reports yet
                    </span>
                  ) : (
                    hub.reports.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openReport(r.id)}
                        className="rounded border border-[var(--color-line)] px-2 py-1 text-left text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                        title={
                          r.expiresAt
                            ? `Expires ${formatOrientation(r.expiresAt)}`
                            : reportKindLabel(r.kind)
                        }
                      >
                        <span className="mr-1 uppercase tracking-wider text-[var(--color-ink-faint)]">
                          {reportKindLabel(r.kind)}
                        </span>
                        {r.title}
                        {r.expiresAt ? (
                          <span className="mt-0.5 block font-mono text-[8px] text-[var(--color-ink-faint)]">
                            exp {formatOrientation(r.expiresAt)}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                  Open positions
                </h3>
                <span className="text-[10px] text-[var(--color-ink-faint)]">
                  Marks synthetic until live broker marks
                </span>
              </div>
              {hub.positions.length === 0 ? (
                <p className="rounded border border-[var(--color-line)] px-3 py-4 text-xs text-[var(--color-ink-faint)]">
                  No open positions. Holdings appear here after paper fills.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {hub.positions.map((p) => {
                    const selected = p.id === mp.selectedPositionId;
                    return (
                      <li key={p.id} data-posture-focus-symbol={p.symbol}>
                        <button
                          type="button"
                          data-testid={`market-posture-position-${p.id}`}
                          onClick={() =>
                            mp.selectPosition(selected ? null : p.id, selected ? null : p.symbol)
                          }
                          className={`w-full rounded border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                              : 'border-[var(--color-line)] bg-[var(--color-surface-1)] hover:border-[var(--color-ink-faint)]'
                          }`}
                        >
                          <Justification
                            sourceClass="derived"
                            block
                            lines={[
                              'Position row from paper fill book joined with module context.',
                              'Mark and unrealized PnL use synthetic marks until live broker marks are wired.',
                              `Module: ${p.moduleName}${p.moduleType ? ` (${p.moduleType})` : ''}.`,
                            ]}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-[var(--color-ink)]">
                                {p.symbol}
                              </span>
                              <span className="font-mono text-xs tabular-nums text-[var(--color-ink-dim)]">
                                qty {p.qty}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap justify-between gap-1 text-[10px] text-[var(--color-ink-faint)]">
                              <span>
                                avg {dollarsFromCents(p.avgCostCents)} · mark{' '}
                                {dollarsFromCents(p.markCents)}
                              </span>
                              <span className="font-mono tabular-nums">
                                uPnL {pnlLabel(p.unrealizedPnlCents)}
                                {p.realizedPnlCents != null ? (
                                  <> · rPnL {pnlLabel(p.realizedPnlCents)}</>
                                ) : null}
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                              {p.moduleName}
                              {p.moduleType ? ` · ${p.moduleType}` : ''}
                            </p>
                            <div className="mt-1.5">
                              <EngineChips engines={p.engines} />
                            </div>
                          </Justification>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {selectedPosition || pipelineForSelected ? (
              <section
                ref={detailRef}
                data-testid="market-posture-position-detail"
                data-posture-focus-symbol={mp.selectedSymbol ?? undefined}
                className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
              >
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                  Holding detail · {selectedPosition?.symbol ?? mp.selectedSymbol}
                </h3>
                {selectedPosition ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
                    <div>
                      <dt className="text-[10px] text-[var(--color-ink-faint)]">Module</dt>
                      <dd>{selectedPosition.moduleName}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-[var(--color-ink-faint)]">Qty</dt>
                      <dd className="font-mono tabular-nums">{selectedPosition.qty}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-[var(--color-ink-faint)]">Avg / Mark</dt>
                      <dd className="font-mono tabular-nums">
                        {dollarsFromCents(selectedPosition.avgCostCents)} /{' '}
                        {dollarsFromCents(selectedPosition.markCents)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-[var(--color-ink-faint)]">Unrealized</dt>
                      <dd className="font-mono tabular-nums">
                        {pnlLabel(selectedPosition.unrealizedPnlCents)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-[var(--color-ink-faint)]">Realized</dt>
                      <dd className="font-mono tabular-nums">
                        {pnlLabel(selectedPosition.realizedPnlCents)}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {selectedPosition ? (
                  <div className="mt-2">
                    <p className="text-[10px] text-[var(--color-ink-faint)]">Presiding engines</p>
                    <EngineChips engines={selectedPosition.engines} />
                  </div>
                ) : null}
                {pipelineForSelected ? (
                  <div className="mt-3 border-t border-[var(--color-line)] pt-2 text-xs">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                      Pipeline · continuation / exit
                    </p>
                    <p className="mt-1 text-[var(--color-ink-dim)]">
                      Lead: {pipelineForSelected.lead?.status ?? 'none'}
                      {pipelineForSelected.lead
                        ? ` · ${pipelineForSelected.lead.direction} · ${pipelineForSelected.lead.strategyFamily}`
                        : ''}
                    </p>
                    <p className="mt-0.5 text-[var(--color-ink-dim)]">
                      Tree: {pipelineForSelected.tree?.status ?? 'none'}
                    </p>
                    {pipelineForSelected.tree?.recoveryLadder?.length ? (
                      <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                        Ladder: {pipelineForSelected.tree.recoveryLadder.join(' → ')}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-[var(--color-ink-faint)]">
                        No recovery ladder recorded.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-3 md:grid-cols-3">
              <CategoryBlock
                title="Watchlists"
                empty="No watchlists for this tier"
                count={filteredWatchlists.length}
                headerExtra={
                  <WatchlistTierFilterChips
                    value={watchlistTierFilter}
                    onChange={setWatchlistTierFilter}
                    className="mt-1 flex flex-wrap gap-1"
                  />
                }
              >
                {filteredWatchlists.slice(0, 16).map((w) => {
                  const focused = mp.selectedSymbol === w.symbol && mp.category === 'watchlists';
                  return (
                    <li
                      key={w.id}
                      data-posture-focus-symbol={w.symbol}
                      className={`rounded border px-1.5 py-1 text-xs ${focusRing(focused)}`}
                    >
                      <Justification
                        sourceClass={w.sourceClass === 'operator' ? 'operator' : 'derived'}
                        lines={[
                          w.note || 'Watchlist row',
                          `Source: ${w.sourceClass} · status ${w.status}`,
                        ]}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() =>
                            mp.focusEntity({
                              symbol: w.symbol,
                              category: 'watchlists',
                              positionId: null,
                              openOverlay: true,
                            })
                          }
                        >
                          <span className="font-medium">{w.symbol}</span>
                          <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                            {w.bias} · {w.status} · {w.sourceClass} · {w.moduleName}
                          </span>
                          {w.note ? (
                            <p className="mt-0.5 truncate text-[10px] text-[var(--color-ink-faint)]">
                              {w.note}
                            </p>
                          ) : null}
                        </button>
                      </Justification>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <EngineChips engines={w.engines} />
                        {w.status === 'suggested_search' || w.status === 'suggested_verified' ? (
                          <button
                            type="button"
                            className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                            onClick={() => void confirmWatchlist(w.id)}
                          >
                            Confirm
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </CategoryBlock>
              <CategoryBlock
                title="Trend candidates"
                empty="No trend candidates"
                count={hub.trendCandidates.length}
              >
                {hub.trendCandidates.slice(0, 12).map((t) => {
                  const focused = mp.selectedSymbol === t.symbol && mp.category === 'trends';
                  return (
                    <li
                      key={t.id}
                      data-posture-focus-symbol={t.symbol}
                      className={`rounded border px-1.5 py-1 text-xs ${focusRing(focused)}`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          mp.focusEntity({
                            symbol: t.symbol,
                            category: 'trends',
                            positionId: null,
                          })
                        }
                      >
                        <span className="font-medium">{t.symbol}</span>
                        <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                          {t.direction} · {t.strengthBand} · {t.status}
                        </span>
                      </button>
                      <div className="mt-0.5">
                        <EngineChips engines={t.engines} />
                      </div>
                    </li>
                  );
                })}
              </CategoryBlock>
              <CategoryBlock
                title="Pipeline plans"
                empty="No lead / tree plans"
                count={hub.pipeline.length}
              >
                {hub.pipeline.slice(0, 12).map((row) => {
                  const focused = mp.selectedSymbol === row.symbol && mp.category === 'pipeline';
                  return (
                    <li
                      key={row.symbol}
                      data-posture-focus-symbol={row.symbol}
                      className={`rounded border px-1.5 py-1 text-xs ${focusRing(focused)}`}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          mp.focusEntity({
                            symbol: row.symbol,
                            category: 'pipeline',
                            positionId: null,
                          })
                        }
                      >
                        <span className="font-medium">{row.symbol}</span>
                        <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                          {row.lead?.status ?? 'no lead'}
                          {row.tree ? ` · tree ${row.tree.status}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </CategoryBlock>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryBlock(props: {
  title: string;
  empty: string;
  count: number;
  children: ReactNode;
  headerExtra?: ReactNode;
}) {
  return (
    <div className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5">
      <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {props.title}{' '}
        <span className="tabular-nums text-[var(--color-ink-dim)]">({props.count})</span>
      </h3>
      {props.headerExtra}
      {props.count === 0 ? (
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{props.empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">{props.children}</ul>
      )}
    </div>
  );
}
