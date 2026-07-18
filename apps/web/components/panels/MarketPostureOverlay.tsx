'use client';

import { useMemo, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { MarketHubPosition } from '@hftr/contracts';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { MarketPostureEquityChart } from '@/components/panels/MarketPostureEquityChart';
import { useMarketPostureView } from '@/components/panels/MarketPostureViewContext';
import { Justification } from '@/components/panels/Justification';
import { useMarketHub } from '@/lib/use-market-hub';

function dollarsFromCents(cents: number | string): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
}

function pnlLabel(centsStr: string): string {
  const n = Number(centsStr);
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n / 100).toFixed(2)}`;
}

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

/**
 * Canvas overlay dashboard for Market posture (D-082) — galaxy-style main surface
 * with equity chart, sector movers, report nav, and detailed holdings.
 */
export function MarketPostureOverlay() {
  const mp = useMarketPostureView();
  const research = useResearchView();
  // Always subscribed while shell is up so overlay opens on warm cache;
  // poll only while overlay is visible (shell warm-prefetch covers background).
  const { data: hub, loading, refreshing, error, refreshMovers } = useMarketHub(mp.companyId, {
    enabled: true,
    poll: mp.overlayOpen,
  });

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
    if (!hub || !selectedPosition) return null;
    return hub.pipeline.find((p) => p.symbol === selectedPosition.symbol) ?? null;
  }, [hub, selectedPosition]);

  const openReport = (conceptId: string) => {
    research.openOverlay();
    research.inspectConcept(conceptId);
  };

  if (!mp.overlayOpen) return null;

  return (
    <div
      data-testid="market-posture-overlay"
      className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm"
      role="dialog"
      aria-label="Market posture dashboard"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
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
                selectedSymbol={selectedPosition?.symbol ?? null}
                equityLabel={equityLabel}
              />
              <div className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5">
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                  Top movers in sector
                </h3>
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
                        className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink-dim)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                      >
                        {r.title}
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
                      <li key={p.id}>
                        <button
                          type="button"
                          data-testid={`market-posture-position-${p.id}`}
                          onClick={() => mp.selectPosition(selected ? null : p.id, p.symbol)}
                          className={`w-full rounded border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                              : 'border-[var(--color-line)] bg-[var(--color-surface-1)] hover:border-[var(--color-ink-faint)]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-[var(--color-ink)]">
                              {p.symbol}
                            </span>
                            <span className="font-mono text-xs tabular-nums text-[var(--color-ink-dim)]">
                              qty {p.qty}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-[var(--color-ink-faint)]">
                            <span>
                              avg {dollarsFromCents(p.avgCostCents)} · mark{' '}
                              {dollarsFromCents(p.markCents)}
                            </span>
                            <span className="font-mono tabular-nums">
                              uPnL {pnlLabel(p.unrealizedPnlCents)}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                            {p.moduleName}
                            {p.moduleType ? ` · ${p.moduleType}` : ''}
                          </p>
                          <div className="mt-1.5">
                            <EngineChips engines={p.engines} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {selectedPosition ? (
              <section
                data-testid="market-posture-position-detail"
                className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3"
              >
                <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                  Holding detail · {selectedPosition.symbol}
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
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
                </dl>
                <div className="mt-2">
                  <p className="text-[10px] text-[var(--color-ink-faint)]">Presiding engines</p>
                  <EngineChips engines={selectedPosition.engines} />
                </div>
                {pipelineForSelected ? (
                  <div className="mt-3 border-t border-[var(--color-line)] pt-2 text-xs">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                      Continuation / exit
                    </p>
                    <p className="mt-1 text-[var(--color-ink-dim)]">
                      Lead: {pipelineForSelected.lead?.status ?? 'none'}
                      {pipelineForSelected.lead
                        ? ` · ${pipelineForSelected.lead.direction} · ${pipelineForSelected.lead.strategyFamily}`
                        : ''}
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
                empty="No watchlist symbols"
                count={hub.watchlists.length}
              >
                {hub.watchlists.slice(0, 12).map((w) => (
                  <li key={w.id} className="text-xs">
                    <span className="font-medium">{w.symbol}</span>
                    <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                      {w.bias} · {w.moduleName}
                    </span>
                    <div className="mt-0.5">
                      <EngineChips engines={w.engines} />
                    </div>
                  </li>
                ))}
              </CategoryBlock>
              <CategoryBlock
                title="Trend candidates"
                empty="No trend candidates"
                count={hub.trendCandidates.length}
              >
                {hub.trendCandidates.slice(0, 12).map((t) => (
                  <li key={t.id} className="text-xs">
                    <span className="font-medium">{t.symbol}</span>
                    <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                      {t.direction} · {t.strengthBand} · {t.status}
                    </span>
                    <div className="mt-0.5">
                      <EngineChips engines={t.engines} />
                    </div>
                  </li>
                ))}
              </CategoryBlock>
              <CategoryBlock
                title="Pipeline plans"
                empty="No lead / tree plans"
                count={hub.pipeline.length}
              >
                {hub.pipeline.slice(0, 12).map((row) => (
                  <li key={row.symbol} className="text-xs">
                    <span className="font-medium">{row.symbol}</span>
                    <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                      {row.lead?.status ?? 'no lead'}
                      {row.tree ? ` · tree ${row.tree.status}` : ''}
                    </span>
                  </li>
                ))}
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
}) {
  return (
    <div className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5">
      <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {props.title}{' '}
        <span className="tabular-nums text-[var(--color-ink-dim)]">({props.count})</span>
      </h3>
      {props.count === 0 ? (
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">{props.empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">{props.children}</ul>
      )}
    </div>
  );
}
