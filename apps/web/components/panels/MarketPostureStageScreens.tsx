'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { MarketHubResponse } from '@hftr/contracts';
import { MarketPostureEquityChart } from '@/components/panels/MarketPostureEquityChart';
import { MarketPostureSourcesStrip } from '@/components/panels/MarketPostureSourcesStrip';
import { SourceVerifyChips } from '@/components/panels/SourceVerifyChips';
import { MarketPostureAwarenessDock } from '@/components/panels/MarketPostureAwarenessDock';
import { MarketPostureAwarenessLevels } from '@/components/panels/MarketPostureAwarenessLevels';
import { SymbolTicker } from '@/components/market/SymbolTicker';
import { MarketPosturePieChart } from '@/components/market/MarketPosturePieChart';
import { MarketPostureMetricBars } from '@/components/market/MarketPostureMetricBars';
import {
  useMarketPostureView,
  type MarketPostureViewContextValue,
} from '@/components/panels/MarketPostureViewContext';
import { Justification } from '@/components/panels/Justification';
import {
  WatchlistTierFilterChips,
  type WatchlistTierFilter,
} from '@/components/panels/WatchlistTierFilters';
import {
  dollarsFromCents,
  formatOrientation,
  reportKindLabel,
} from '@/components/panels/market-posture-format';
import { masterEquityHeadline } from '@/lib/capital-mode-label';
import {
  MARKET_POSTURE_STAGE_SCREENS,
  type MarketPostureStageScreenId,
} from '@/lib/market-posture-stage-screens';

function focusRing(active: boolean): string {
  return active
    ? 'ring-1 ring-[var(--color-accent)] border-[var(--color-accent)]'
    : 'border-[var(--color-line)]';
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

function ScreenShell(props: {
  id: MarketPostureStageScreenId;
  label: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <section
      data-stage-screen={props.id}
      data-testid={`market-posture-stage-${props.id}`}
      className="min-h-0 min-w-full max-w-full shrink-0 snap-start snap-always overflow-y-auto overscroll-contain px-3 py-2"
      aria-label={`${props.label} stage`}
    >
      <header className="mb-2 border-b border-[var(--color-line)] pb-1.5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink)]">
          {props.label}
        </h2>
        <p className="text-[10px] text-[var(--color-ink-faint)]">{props.summary}</p>
      </header>
      <div className="mx-auto flex max-w-5xl flex-col gap-3">{props.children}</div>
    </section>
  );
}

export type MarketPostureStageScreensProps = {
  hub: MarketHubResponse;
  equityLabel: string;
  dayLens: 'both' | 'stock' | 'news';
  setDayLens: (v: 'both' | 'stock' | 'news') => void;
  watchlistTierFilter: WatchlistTierFilter;
  setWatchlistTierFilter: (v: WatchlistTierFilter) => void;
  filteredWatchlists: MarketHubResponse['watchlists'];
  moversStale: boolean;
  openReport: (conceptId: string) => void;
  confirmWatchlist: (itemId: string) => void;
};

/** Horizontal snap rail of pipeline-column stage screens (D-186). */
export function MarketPostureStageScreens(props: MarketPostureStageScreensProps) {
  const mp = useMarketPostureView();
  const railRef = useRef<HTMLDivElement>(null);
  const scrollingFromNav = useRef(false);

  const scrollToScreen = useCallback((id: MarketPostureStageScreenId) => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-stage-screen="${id}"]`);
    if (!el) return;
    scrollingFromNav.current = true;
    el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    window.setTimeout(() => {
      scrollingFromNav.current = false;
    }, 450);
  }, []);

  useEffect(() => {
    scrollToScreen(mp.activeStageScreenId);
  }, [mp.activeStageScreenId, scrollToScreen]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingFromNav.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio >= 0.55)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0];
        if (!top) return;
        const id = (top.target as HTMLElement).dataset.stageScreen as
          | MarketPostureStageScreenId
          | undefined;
        if (id && id !== mp.activeStageScreenId) {
          mp.setActiveStageScreenId(id);
        }
      },
      { root: rail, threshold: [0.55, 0.75] },
    );

    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      const el = rail.querySelector(`[data-stage-screen="${screen.id}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [mp.activeStageScreenId, mp.setActiveStageScreenId, props.hub]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <nav
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--color-line)] px-2 py-1"
        aria-label="Stage screens"
        data-testid="market-posture-stage-tabs"
      >
        {MARKET_POSTURE_STAGE_SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => mp.setActiveStageScreenId(s.id)}
            className={`shrink-0 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
              mp.activeStageScreenId === s.id
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-dim)]'
            }`}
            data-testid={`market-posture-stage-tab-${s.id}`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div
        ref={railRef}
        data-testid="market-posture-stage-rail"
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
      >
        {MARKET_POSTURE_STAGE_SCREENS.map((meta) => (
          <ScreenShell key={meta.id} id={meta.id} label={meta.label} summary={meta.summary}>
            {renderScreenBody(meta.id, props, mp)}
          </ScreenShell>
        ))}
      </div>
    </div>
  );
}

function renderScreenBody(
  id: MarketPostureStageScreenId,
  props: MarketPostureStageScreensProps,
  mp: MarketPostureViewContextValue,
): ReactNode {
  const { hub } = props;
  switch (id) {
    case 'capital':
      return (
        <CapitalScreen hub={hub} equityLabel={props.equityLabel} companyMode={mp.companyMode} />
      );
    case 'library':
      return <LibraryScreen hub={hub} mp={mp} />;
    case 'live':
      return <LiveScreen hub={hub} />;
    case 'adapt':
      return <AdaptScreen hub={hub} />;
    case 'process':
      return <ProcessScreen hub={hub} />;
    case 'seals':
      return (
        <SealsScreen
          hub={hub}
          dayLens={props.dayLens}
          setDayLens={props.setDayLens}
          moversStale={props.moversStale}
          openReport={props.openReport}
        />
      );
    case 'compose':
      return (
        <ComposeScreen
          hub={hub}
          mp={mp}
          watchlistTierFilter={props.watchlistTierFilter}
          setWatchlistTierFilter={props.setWatchlistTierFilter}
          filteredWatchlists={props.filteredWatchlists}
          confirmWatchlist={props.confirmWatchlist}
          openReport={props.openReport}
        />
      );
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function CapitalScreen(props: {
  hub: MarketHubResponse;
  equityLabel: string;
  companyMode: MarketPostureViewContextValue['companyMode'];
}) {
  const modelCap = props.hub.modelHydration?.capitalSources ?? [];
  const hubCap = props.hub.capitalSources;
  const chips: Array<{ id: string; name: string; amountLabel: string }> =
    modelCap.length > 0
      ? modelCap.map((c) => ({ id: c.id, name: c.name, amountLabel: c.amount }))
      : hubCap.map((c) => ({
          id: c.id,
          name: c.name,
          amountLabel:
            c.allocationCents != null ? dollarsFromCents(c.allocationCents) : c.status,
        }));
  return (
    <>
      <section className="space-y-2" data-testid="market-posture-master-equity">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            {masterEquityHeadline(props.companyMode)}
          </h3>
          <SourceVerifyChips
            chips={props.hub.equity.sourceChips ?? []}
            data-testid="market-posture-equity-source-chips"
          />
        </div>
        <MarketPostureEquityChart
          series={props.hub.equity.series}
          selectedQty={null}
          selectedMarkCents={null}
          selectedSymbol={null}
          equityLabel={props.equityLabel}
          capitalModeTitle={masterEquityHeadline(props.companyMode)}
          equityStatus={props.hub.equity.status}
          asOfIso={props.hub.equity.asOfIso}
          version={props.hub.equity.version}
        />
      </section>
      <div className="flex flex-wrap gap-1.5">
        <span className="w-full text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Capital sources
        </span>
        {chips.length === 0 ? (
          <span className="text-[10px] text-[var(--color-ink-faint)]">No capital sources</span>
        ) : (
          chips.map((c) => (
            <span
              key={c.id}
              className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1 font-mono text-[10px] text-[var(--color-ink-dim)]"
            >
              {c.name}
              {c.amountLabel ? (
                <span className="ml-1 text-[var(--color-ink-faint)]">{c.amountLabel}</span>
              ) : null}
            </span>
          ))
        )}
      </div>
    </>
  );
}

function LibraryScreen(props: {
  hub: MarketHubResponse;
  mp: MarketPostureViewContextValue;
}) {
  const positions = props.hub.positions;
  const libSources = props.hub.modelHydration?.librarySources ?? [];
  return (
    <>
      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Open positions{' '}
          <span className="tabular-nums text-[var(--color-ink-dim)]">({positions.length})</span>
        </h3>
        {positions.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">No open positions</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {positions.slice(0, 24).map((p) => {
              const focused =
                props.mp.selectedPositionId === p.id || props.mp.selectedSymbol === p.symbol;
              return (
                <li
                  key={p.id}
                  className={`rounded border px-1.5 py-1 text-xs ${focusRing(focused)}`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() =>
                      props.mp.focusEntity({
                        symbol: p.symbol,
                        positionId: p.id,
                        category: 'positions',
                        stageScreenId: 'library',
                      })
                    }
                  >
                    {p.viz ? (
                      <SymbolTicker
                        viz={p.viz}
                        density="compact"
                        meta={
                          <span className="text-[10px] text-[var(--color-ink-faint)]">
                            qty {p.qty} · {p.moduleName}
                          </span>
                        }
                      />
                    ) : (
                      <>
                        <span className="font-medium">{p.symbol}</span>
                        <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                          qty {p.qty} · {p.moduleName}
                        </span>
                      </>
                    )}
                  </button>
                  <div className="mt-0.5 flex items-center gap-1">
                    <EngineChips engines={p.engines} />
                    <SourceVerifyChips chips={p.sourceChips ?? []} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <div className="flex flex-wrap gap-1.5">
        <span className="w-full text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Library corpus
        </span>
        {libSources.length === 0 ? (
          <span className="text-[10px] text-[var(--color-ink-faint)]">
            No admitted library sources on Model
          </span>
        ) : (
          libSources.map((lib) => (
            <span
              key={lib.id}
              className="rounded border border-[var(--color-line)] px-2 py-1 font-mono text-[10px] text-[var(--color-ink-dim)]"
            >
              {lib.name}
              <span className="ml-1 text-[var(--color-ink-faint)]">
                {lib.admittedCount}/{lib.conceptCount} · {lib.shelf}
              </span>
            </span>
          ))
        )}
      </div>
    </>
  );
}

function LiveScreen(props: { hub: MarketHubResponse }) {
  const live = props.hub.modelHydration?.liveSources ?? [];
  return (
    <>
      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Entitled sources
        </h3>
        <MarketPostureSourcesStrip sources={props.hub.sources} />
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Mark feed: {props.hub.sources.markFeedClass}
          {props.hub.sources.scannedAt
            ? ` · scanned ${formatOrientation(props.hub.sources.scannedAt)}`
            : ''}
        </p>
      </section>
      <ul className="space-y-1.5">
        {live.length === 0 ? (
          <li className="text-xs text-[var(--color-ink-faint)]">
            No live sources in Model hydration — connect research keys / broker.
          </li>
        ) : (
          live.map((s) => (
            <li
              key={s.kind}
              className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs"
            >
              <span className="font-medium text-[var(--color-ink)]">{s.label}</span>
              <span className="ml-2 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                {s.status}
                {s.contributed ? ' · contributed' : ''}
              </span>
              <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                {s.operation} · {s.amount}
              </p>
            </li>
          ))
        )}
      </ul>
    </>
  );
}

function AdaptScreen(props: { hub: MarketHubResponse }) {
  const flows = props.hub.modelHydration?.processingFlows ?? [];
  const totals = props.hub.modelHydration?.totals;
  return (
    <>
      <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Adapter / hydrate status
        {totals
          ? ` · live ready ${totals.liveReady} · admitted ${totals.admittedConcepts}`
          : ''}
      </p>
      {flows.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-faint)]">
          No processing flows yet — Sync or Analyze to hydrate adapters.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {flows.map((f) => (
            <li
              key={f.id}
              className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs"
            >
              <span className="font-medium">{f.adapterLabel}</span>
              <span className="ml-2 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                {f.status}
                {f.contributed ? ' · contributed' : ''}
              </span>
              <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                {f.operation} · {f.amount}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProcessScreen(props: { hub: MarketHubResponse }) {
  const steps = props.hub.modelHydration?.processSteps ?? [];
  return (
    <>
      {props.hub.awarenessAnalysis ? (
        <MarketPostureAwarenessLevels analysis={props.hub.awarenessAnalysis} />
      ) : (
        <p className="text-xs text-[var(--color-ink-faint)]">
          Awareness levels appear after linkage analysis is projected.
        </p>
      )}
      <section className="space-y-1.5">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Process steps
        </h3>
        {steps.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">No process steps in hydration</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {steps.slice(0, 40).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-1 border-b border-[var(--color-line)] py-1 font-mono text-[10px] text-[var(--color-ink-dim)]"
              >
                <span>{s.label}</span>
                <span className="uppercase text-[var(--color-ink-faint)]">
                  {s.route} · {s.processFunction} · {s.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SealsScreen(props: {
  hub: MarketHubResponse;
  dayLens: 'both' | 'stock' | 'news';
  setDayLens: (v: 'both' | 'stock' | 'news') => void;
  moversStale: boolean;
  openReport: (conceptId: string) => void;
}) {
  const { hub, dayLens, moversStale, openReport } = props;
  return (
    <>
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
        ).map(([lid, label]) => (
          <button
            key={lid}
            type="button"
            onClick={() => props.setDayLens(lid)}
            className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
              dayLens === lid
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-[var(--color-line)] text-[var(--color-ink-dim)]'
            }`}
            data-testid={`market-posture-lens-${lid}`}
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
                {hub.movers.corroborationBand ? ` · ${hub.movers.corroborationBand}` : ''}
              </span>
            </div>
            <SourceVerifyChips
              chips={hub.movers.sourceChips ?? []}
              data-testid="market-posture-movers-source-chips"
            />
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
                {hub.news.corroborationBand ? ` · ${hub.news.corroborationBand}` : ''}
              </span>
            </div>
            <SourceVerifyChips
              chips={hub.news.sourceChips ?? []}
              data-testid="market-posture-news-source-chips"
            />
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
    </>
  );
}

function ComposeScreen(props: {
  hub: MarketHubResponse;
  mp: MarketPostureViewContextValue;
  watchlistTierFilter: WatchlistTierFilter;
  setWatchlistTierFilter: (v: WatchlistTierFilter) => void;
  filteredWatchlists: MarketHubResponse['watchlists'];
  confirmWatchlist: (itemId: string) => void;
  openReport: (conceptId: string) => void;
}) {
  const { hub, mp } = props;
  return (
    <>
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
          count={props.filteredWatchlists.length}
          headerExtra={
            <WatchlistTierFilterChips
              value={props.watchlistTierFilter}
              onChange={props.setWatchlistTierFilter}
              className="mt-1 flex flex-wrap gap-1"
            />
          }
        >
          {props.filteredWatchlists.slice(0, 16).map((w) => {
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
                        stageScreenId: 'compose',
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
                  <SourceVerifyChips chips={w.sourceChips ?? []} />
                  {w.status === 'suggested_search' || w.status === 'suggested_verified' ? (
                    <button
                      type="button"
                      className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                      onClick={() => void props.confirmWatchlist(w.id)}
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
                      stageScreenId: 'compose',
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
                      stageScreenId: 'compose',
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

      <MarketPostureAwarenessDock hub={hub} onOpenConcept={props.openReport} />
    </>
  );
}
