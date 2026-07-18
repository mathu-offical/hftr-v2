'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useResearchView } from '@/components/research/ResearchViewContext';
import { MarketPostureEquityChart } from '@/components/panels/MarketPostureEquityChart';
import { MarketPostureFreshnessStrip } from '@/components/panels/MarketPostureFreshnessStrip';
import { MarketPostureSourcesStrip } from '@/components/panels/MarketPostureSourcesStrip';
import { MarketPostureModelCanvas } from '@/components/panels/MarketPostureModelCanvas';
import { MarketPostureAwarenessDock } from '@/components/panels/MarketPostureAwarenessDock';
import { SymbolTicker } from '@/components/market/SymbolTicker';
import { MarketPosturePieChart } from '@/components/market/MarketPosturePieChart';
import { MarketPostureMetricBars } from '@/components/market/MarketPostureMetricBars';
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
  reportKindLabel,
} from '@/components/panels/market-posture-format';
import { api } from '@/lib/client';
import { invalidateMarketHub } from '@/lib/market-hub-cache';
import { useMarketHub } from '@/lib/use-market-hub';
import { useMarketHubSynthesis } from '@/lib/use-market-hub-synthesis';

const SYNTHESIS_TERMINAL = new Set(['succeeded', 'failed', 'partial']);

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
 * Canvas overlay: day quant dashboard (D-131) — sealed tape, recommendations,
 * synthesis Model. Holdings inventory stays on the left Posture rail.
 */
export function MarketPostureOverlay() {
  const mp = useMarketPostureView();
  const research = useResearchView();
  const { data: hub, loading, refreshing, analyzing, error, refresh, analyze } = useMarketHub(
    mp.companyId,
    {
      enabled: true,
      poll: mp.overlayOpen,
    },
  );
  const synthesis = useMarketHubSynthesis(mp.companyId, { enabled: mp.overlayOpen });
  const [watchlistTierFilter, setWatchlistTierFilter] = useState<WatchlistTierFilter>('default');
  const [dayLens, setDayLens] = useState<'both' | 'stock' | 'news'>('both');
  const lastTerminalRunId = useRef<string | null>(null);

  useEffect(() => {
    const run = synthesis.run;
    if (!run || !SYNTHESIS_TERMINAL.has(run.status)) return;
    if (lastTerminalRunId.current === run.id) return;
    lastTerminalRunId.current = run.id;
    void refresh(true);
  }, [synthesis.run, refresh]);

  const onAnalyze = useCallback(async () => {
    const runId = await analyze();
    if (runId) synthesis.setActiveRunId(runId);
  }, [analyze, synthesis.setActiveRunId]);

  const equityLabel = hub?.equity.equityCents
    ? dollarsFromCents(hub.equity.equityCents)
    : 'Unavailable';

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

  if (!mp.overlayOpen) return null;

  return (
    <div
      data-testid="market-posture-overlay"
      className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-0)]/95 shadow-lg backdrop-blur-sm"
      role="dialog"
      aria-label="Market posture day dashboard"
    >
      <header className="flex shrink-0 flex-col gap-1 border-b border-[var(--color-line)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs font-medium text-[var(--color-ink)]">Market posture · day</span>
            {hub && hub.sectorFocuses.length > 0 ? (
              <p className="truncate text-[10px] text-[var(--color-ink-faint)]">
                Sector lens: {hub.sectorFocuses.join(' · ')}
                {hub.universeExcludes.length > 0
                  ? ` · Exclude: ${hub.universeExcludes.join(', ')}`
                  : ''}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(refreshing || analyzing || synthesis.activeRunId) && (
              <span
                className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]"
                data-testid="market-posture-sync-state"
              >
                {analyzing || synthesis.activeRunId ? 'Analyzing…' : 'Syncing…'}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={refreshing || analyzing}
              title="Full hub reload (seals, reports, charts). Live equity/marks poll separately."
              className="border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-ink-dim)] hover:border-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-50"
            >
              Sync
            </button>
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={analyzing || refreshing}
              title="Analyze reseals stock movers (bars+news compound) and sector news in parallel, then daily + narrative"
              className="border border-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 disabled:opacity-50"
              data-testid="market-posture-analyze"
            >
              {analyzing ? 'Analyze…' : 'Analyze'}
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
        {synthesis.run &&
        (synthesis.activeRunId ||
          synthesis.run.status === 'running' ||
          synthesis.run.status === 'pending') ? (
          <div
            className="flex items-center justify-between gap-2 px-0 pt-1"
            data-testid="market-posture-overlay-synthesis-strip"
          >
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
              Synthesis {synthesis.run.status}
              {synthesis.run.stages.length > 0
                ? ` · ${
                    synthesis.run.stages.filter(
                      (s) =>
                        s.status === 'succeeded' ||
                        s.status === 'skipped' ||
                        s.status === 'failed',
                    ).length
                  }/${synthesis.run.stages.length} stages`
                : ''}
            </p>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('market-posture-model-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
            >
              Open Model
            </button>
          </div>
        ) : null}
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
            <section className="space-y-2" data-testid="market-posture-master-equity">
              <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                Master equity
              </h3>
              <MarketPostureEquityChart
                series={hub.equity.series}
                selectedQty={null}
                selectedMarkCents={null}
                selectedSymbol={null}
                equityLabel={equityLabel}
                equityStatus={hub.equity.status}
                asOfIso={hub.equity.asOfIso}
                version={hub.equity.version}
              />
            </section>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                Live streams
              </span>
              {(
                [
                  ['both', 'Stock + news'],
                  ['stock', 'Stock'],
                  ['news', 'News'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDayLens(id)}
                  className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    dayLens === id
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-[var(--color-line)] text-[var(--color-ink-dim)]'
                  }`}
                  data-testid={`market-posture-lens-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <section
              className={`grid gap-3 ${dayLens === 'both' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}
            >
              {dayLens !== 'news' ? (
                <div
                  className={`space-y-2 rounded border bg-[var(--color-surface-1)] p-2.5 ${
                    moversStale
                      ? 'border-[var(--color-warn,var(--color-ink-faint))]'
                      : 'border-[var(--color-line)]'
                  }`}
                  data-testid="market-posture-stock-board"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                      Stock · {hub.movers.title ?? 'Top movers'}
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
                      No movers seal yet — Analyze reseals stock compound (bars + news).
                    </p>
                  ) : (
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                      {hub.movers.items.slice(0, 12).map((item, i) => {
                        const viz =
                          hub.movers.itemViz.find(
                            (v) =>
                              v.symbol ===
                              item.symbolOrSector?.trim().replace(/^\$/, '').toUpperCase(),
                          ) ?? null;
                        return (
                          <li key={`${item.symbolOrSector ?? 'm'}-${i}`}>
                            <Justification
                              sourceClass="system_seal"
                              lines={[
                                item.headline ?? 'Sealed movers board item',
                                `Bands: ${[item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || 'n/a'}`,
                              ]}
                            >
                              {viz ? (
                                <SymbolTicker viz={viz} density="compact" />
                              ) : (
                                <div className="flex items-start justify-between gap-2 text-xs">
                                  <span className="font-medium text-[var(--color-ink)]">
                                    {item.symbolOrSector ?? 'Cluster'}
                                  </span>
                                  <span className="shrink-0 text-[10px] uppercase text-[var(--color-ink-faint)]">
                                    {[item.directionBand, item.strengthBand]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                </div>
                              )}
                            </Justification>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {hub.movers.reportConceptId ? (
                    <button
                      type="button"
                      onClick={() => openReport(hub.movers.reportConceptId!)}
                      className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                    >
                      Open movers report
                    </button>
                  ) : null}
                </div>
              ) : null}

              {dayLens !== 'stock' ? (
                <div
                  className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
                  data-testid="market-posture-news-board"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                      News · {hub.news.title ?? 'Sector bulletin'}
                    </h3>
                    <span className="font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                      {hub.news.status}
                      {hub.news.corroborationBand
                        ? ` · ${hub.news.corroborationBand}`
                        : ''}
                    </span>
                  </div>
                  <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                    Verified {formatOrientation(hub.news.verifiedAt)} · expires{' '}
                    {formatOrientation(hub.news.expiresAt)}
                  </p>
                  {hub.news.items.length === 0 ? (
                    <p className="text-xs text-[var(--color-ink-faint)]">
                      No sector news seal yet — Analyze reseals news lanes in parallel.
                    </p>
                  ) : (
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                      {hub.news.items.slice(0, 12).map((item, i) => (
                        <li
                          key={`${item.symbolOrSector ?? 'n'}-${i}`}
                          className="rounded border border-[var(--color-line)] px-1.5 py-1 text-xs"
                        >
                          <Justification
                            sourceClass="system_seal"
                            lines={[
                              item.headline ?? 'Sector news item',
                              item.symbolOrSector
                                ? `Sector/symbol: ${item.symbolOrSector}`
                                : 'No sector label',
                              `Bands: ${[item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || 'n/a'}`,
                            ]}
                          >
                            <p className="font-medium text-[var(--color-ink)]">
                              {item.headline ?? item.symbolOrSector ?? 'Headline'}
                            </p>
                            <p className="mt-0.5 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                              {[item.symbolOrSector, item.directionBand, item.strengthBand]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </Justification>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hub.news.reportConceptId ? (
                    <button
                      type="button"
                      onClick={() => openReport(hub.news.reportConceptId!)}
                      className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                    >
                      Open sector news report
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <div className="flex flex-wrap gap-1.5">
              <span className="w-full text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                Sealed reports
              </span>
              {hub.reports.length === 0 ? (
                <span className="text-[10px] text-[var(--color-ink-faint)]">No sealed reports yet</span>
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
                  </button>
                ))
              )}
            </div>

            <section
              id="market-posture-model-section"
              className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
              data-testid="market-posture-overlay-model"
            >
              <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                Synthesis model · stock + news
              </h3>
              <p className="text-[10px] text-[var(--color-ink-dim)]">
                Analyze runs stock movers (compound bars + news) and sector news seals in
                parallel, then daily summaries and posture narrative. Funds stay on the left
                rail.
              </p>
              <MarketPostureModelCanvas run={synthesis.run} />
              <MarketPostureAwarenessDock hub={hub} onOpenConcept={openReport} />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MarketPosturePieChart
                title="Watchlist tiers"
                slices={hub.charts.watchlistTiers}
                empty="No watchlist rows"
              />
              <MarketPostureMetricBars
                title="Trend strength"
                slices={hub.charts.trendStrength}
                empty="No trend candidates"
              />
              <MarketPostureMetricBars
                title="Mover directions"
                slices={hub.charts.moverDirections}
                empty="No sealed movers"
              />
              <MarketPosturePieChart
                title="Provider surfaces"
                slices={hub.charts.sourceReady}
                empty="No lane inventory"
              />
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              <CategoryBlock
                title="Recommendations · watch"
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
                          w.viz?.heldVsCost
                            ? `Also held — P&L color wins (${w.viz.heldVsCost}).`
                            : `Relevance ${w.viz?.relevanceBand ?? 'n/a'} (non-color ticks).`,
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
                          {w.viz ? (
                            <SymbolTicker
                              viz={w.viz}
                              density="compact"
                              meta={
                                <span className="text-[10px] text-[var(--color-ink-faint)]">
                                  {w.bias} · {w.status} · {w.sourceClass}
                                </span>
                              }
                            />
                          ) : (
                            <>
                              <span className="font-medium">{w.symbol}</span>
                              <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                                {w.bias} · {w.status} · {w.sourceClass} · {w.moduleName}
                              </span>
                            </>
                          )}
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
                title="Recommendations · trends"
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
                        {t.viz ? (
                          <SymbolTicker
                            viz={t.viz}
                            density="compact"
                            meta={
                              <span className="text-[10px] text-[var(--color-ink-faint)]">
                                {t.status}
                              </span>
                            }
                          />
                        ) : (
                          <>
                            <span className="font-medium">{t.symbol}</span>
                            <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                              {t.direction} · {t.strengthBand} · {t.status}
                            </span>
                          </>
                        )}
                      </button>
                      <div className="mt-0.5">
                        <EngineChips engines={t.engines} />
                      </div>
                    </li>
                  );
                })}
              </CategoryBlock>
              <CategoryBlock
                title="Recommendations · plans"
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
