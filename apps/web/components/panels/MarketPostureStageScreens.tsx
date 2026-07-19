'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { MarketHubResponse, MarketHubSynthesisRun } from '@hftr/contracts';
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
import {
  buildStageProcessingRows,
  type StageProcessingRow,
} from '@/lib/market-posture-stage-processing';
import {
  buildRootUserCapitalView,
  formatCapitalCents,
} from '@/lib/market-posture-root-capital';
import {
  buildCapitalStageCharts,
  buildDayStageCharts,
  buildLibraryStageCharts,
  buildLiveStageCharts,
  buildProcessStageCharts,
  buildSealsStageCharts,
} from '@/lib/market-posture-stage-charts';

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
  processingRows: StageProcessingRow[];
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
      <StageProcessingTape rows={props.processingRows} screenId={props.id} />
      <div className="mx-auto mt-3 flex max-w-5xl flex-col gap-3">{props.children}</div>
    </section>
  );
}

function StageProcessingTape(props: {
  rows: StageProcessingRow[];
  screenId: MarketPostureStageScreenId;
}) {
  return (
    <div
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2"
      data-testid={`market-posture-stage-tape-${props.screenId}`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
          Processing now
        </p>
        <span className="font-mono text-[9px] tabular-nums text-[var(--color-ink-dim)]">
          {props.rows.length} rows
        </span>
      </div>
      {props.rows.length === 0 ? (
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          No live rows for this column yet — Sync or Analyze to hydrate.
        </p>
      ) : (
        <ul className="max-h-36 space-y-1 overflow-y-auto">
          {props.rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto] items-baseline gap-1 border-b border-[var(--color-line)] py-0.5 last:border-0"
            >
              <span className="truncate text-[11px] text-[var(--color-ink)]" title={row.detail}>
                {row.label}
              </span>
              <span className="truncate font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                {row.operation}
              </span>
              <span className="truncate font-mono text-[9px] text-[var(--color-ink-dim)]">
                {row.amount}
              </span>
              <span className="shrink-0 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type MarketPostureStageScreensProps = {
  hub: MarketHubResponse;
  synthesisRun: MarketHubSynthesisRun | null;
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
          <ScreenShell
            key={meta.id}
            id={meta.id}
            label={meta.label}
            summary={meta.summary}
            processingRows={buildStageProcessingRows(
              meta.id,
              props.hub,
              props.synthesisRun,
            )}
          >
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
      return <LiveIngestScreen hub={hub} />;
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
    case 'day':
      return (
        <DayPlanScreen
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
  const view = buildRootUserCapitalView(props.hub);
  const charts = buildCapitalStageCharts(props.hub, view);
  const poolLabel = formatCapitalCents(view.companyPool?.allocationCents);
  const equityLabel = formatCapitalCents(view.equityCents);

  return (
    <>
      <section
        className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-capital-totals"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          User-controlled funds
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              Company pool
            </p>
            <p className="font-mono text-lg tabular-nums text-[var(--color-ink)]">{poolLabel}</p>
            <p className="text-[10px] text-[var(--color-ink-dim)]">
              {view.companyPool?.name ?? 'No company pool'} ·{' '}
              {view.companyPool?.status ?? 'unavailable'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              {masterEquityHeadline(props.companyMode)}
            </p>
            <p className="font-mono text-lg tabular-nums text-[var(--color-ink)]">{equityLabel}</p>
            <p className="text-[10px] text-[var(--color-ink-dim)]">
              status {view.equityStatus}
              {view.equityAsOfIso
                ? ` · asOf ${new Date(view.equityAsOfIso).toLocaleTimeString()}`
                : ''}
            </p>
          </div>
        </div>
        <SourceVerifyChips
          chips={props.hub.equity.sourceChips ?? []}
          data-testid="market-posture-equity-source-chips"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MarketPosturePieChart
          title="Root funds split"
          slices={charts.rootFunds}
          empty="No root fund balances"
        />
        <MarketPosturePieChart
          title="Engine allocations"
          slices={charts.engineSplit}
          empty="No engine desk splits"
        />
        <MarketPosturePieChart
          title="Open book by mark"
          slices={charts.bookAllocation}
          empty="No open position notionals"
        />
      </section>

      <section className="space-y-2" data-testid="market-posture-master-equity">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Equity path
        </h3>
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

      <section className="space-y-2" data-testid="market-posture-root-holding-funds">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Root holding funds{' '}
          <span className="tabular-nums text-[var(--color-ink-dim)]">
            ({view.rootHoldingFunds.length})
          </span>
        </h3>
        {view.rootHoldingFunds.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">No root holding funds</p>
        ) : (
          <ul className="space-y-1">
            {view.rootHoldingFunds.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1.5 text-xs"
              >
                <span className="font-medium text-[var(--color-ink)]">{f.name}</span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-dim)]">
                  {formatCapitalCents(f.allocationCents ?? f.ledgerBalanceCents)}
                  {f.allocationShareBps != null
                    ? ` · ${(f.allocationShareBps / 100).toFixed(1)}%`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="market-posture-engine-allocations">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Engine allocations{' '}
          <span className="tabular-nums text-[var(--color-ink-dim)]">
            ({view.engineGroups.length})
          </span>
        </h3>
        {view.engineGroups.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">
            No engine desk splits yet — root funds are not allocated to execution desks.
          </p>
        ) : (
          <ul className="space-y-2">
            {view.engineGroups.map((g) => (
              <li
                key={g.key}
                className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--color-ink)]">{g.label}</span>
                  <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-dim)]">
                    {formatCapitalCents(g.allocationCentsTotal)} · {g.desks.length} desk
                    {g.desks.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {g.desks.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-baseline justify-between gap-1 font-mono text-[10px] text-[var(--color-ink-faint)]"
                    >
                      <span>{d.name}</span>
                      <span className="tabular-nums">
                        {formatCapitalCents(d.allocationCents ?? d.ledgerBalanceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="market-posture-capital-positions">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Open position values{' '}
          <span className="tabular-nums text-[var(--color-ink-dim)]">
            ({view.positions.length})
          </span>
        </h3>
        {view.positions.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">No open positions</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {view.positions.slice(0, 24).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-[var(--color-line)] px-2 py-1 text-xs"
              >
                <span className="font-medium text-[var(--color-ink)]">
                  {p.symbol}{' '}
                  <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                    qty {p.qty}
                  </span>
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-dim)]">
                  mark {formatCapitalCents(String(p.markCents))} · uPnL{' '}
                  {formatCapitalCents(p.unrealizedPnlCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function LibraryScreen(props: {
  hub: MarketHubResponse;
  mp: MarketPostureViewContextValue;
}) {
  const positions = props.hub.positions;
  const libSources = props.hub.modelHydration?.librarySources ?? [];
  const charts = buildLibraryStageCharts(props.hub);
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MarketPosturePieChart
          title="Book by mark"
          slices={charts.bookAllocation}
          empty="No open positions"
        />
        <MarketPostureMetricBars
          title="Held uPnL mix"
          slices={charts.pnlMix}
          empty="No position PnL yet"
        />
        <MarketPosturePieChart
          title="Library shelves"
          slices={charts.shelfMix}
          empty="No library sources hydrated"
        />
        <MarketPostureMetricBars
          title="Corpus admission"
          slices={charts.admission}
          empty="No admitted concepts"
        />
      </section>

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

function LiveIngestScreen(props: { hub: MarketHubResponse }) {
  const { hub } = props;
  const live = hub.modelHydration?.liveSources ?? [];
  const flows = hub.modelHydration?.processingFlows ?? [];
  const totals = hub.modelHydration?.totals;
  const lanes = hub.sources.lanes;
  const charts = buildLiveStageCharts(hub);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MarketPosturePieChart
          title="Lane entitlement"
          slices={charts.sourceReady}
          empty="No lane inventory"
        />
        <MarketPosturePieChart
          title="Source domains"
          slices={charts.domainMix}
          empty="No domains hydrated"
        />
        <MarketPostureMetricBars
          title="Filtered into seal"
          slices={charts.contributeMix}
          empty="No contribution mix yet"
        />
        <MarketPostureMetricBars
          title="Adapter flow status"
          slices={charts.adapterStatus}
          empty="No adapter flows hydrated"
        />
      </section>

      <section className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Live entitlement strip
        </h3>
        <MarketPostureSourcesStrip sources={hub.sources} />
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Mark feed: {hub.sources.markFeedClass}
          {hub.sources.scannedAt
            ? ` · scanned ${formatOrientation(hub.sources.scannedAt)}`
            : ''}
          {totals
            ? ` · ready ${totals.liveReady} · admitted ${totals.admittedConcepts}`
            : ''}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Source → adapter → filtered readout
        </h3>
        {lanes.length === 0 && live.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">
            No live sources — connect research keys / broker, then Sync.
          </p>
        ) : (
          <ul className="space-y-2">
            {(lanes.length > 0 ? lanes : live.map((s) => ({
              kind: s.kind,
              label: s.label,
              status: s.status,
              domain: s.domain,
              contributed: s.contributed,
            }))).map((lane) => {
              const hydration = live.find((s) => s.kind === lane.kind);
              const relatedFlows = flows.filter(
                (f) =>
                  f.route?.toLowerCase().includes(String(lane.kind).toLowerCase()) ||
                  f.analysisRoles.some((r) =>
                    String(lane.domain ?? '').toLowerCase().includes(r.toLowerCase()),
                  ) ||
                  f.adapterLabel.toLowerCase().includes(String(lane.label).toLowerCase().slice(0, 6)),
              );
              const readout =
                hydration?.amount ??
                (lane.contributed ? 'contributed' : lane.status);
              return (
                <li
                  key={String(lane.kind)}
                  className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-xs font-medium text-[var(--color-ink)]">
                        {lane.label}
                      </span>
                      <span className="ml-2 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                        {lane.domain ?? hydration?.domain ?? 'live'} · {lane.status}
                        {lane.contributed ? ' · contributed' : ''}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--color-accent)]">
                      {readout}
                    </span>
                  </div>
                  {hydration ? (
                    <p className="mt-1 text-[10px] text-[var(--color-ink-dim)]">
                      Filter op: {hydration.operation}
                    </p>
                  ) : null}
                  {relatedFlows.length > 0 ? (
                    <ul className="mt-1.5 space-y-1 border-t border-[var(--color-line)] pt-1.5">
                      {relatedFlows.map((f) => (
                        <li
                          key={f.id}
                          className="flex flex-wrap items-baseline justify-between gap-1 text-[10px] text-[var(--color-ink-dim)]"
                        >
                          <span>
                            <span className="font-mono uppercase text-[var(--color-ink-faint)]">
                              adapter
                            </span>{' '}
                            {f.adapterLabel}
                          </span>
                          <span className="font-mono text-[var(--color-ink-faint)]">
                            {f.operation} · {f.amount} · {f.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[10px] text-[var(--color-ink-faint)]">
                      No adapter flow matched this source yet
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {flows.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            All adapter flows
          </h3>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {flows.map((f) => (
              <li
                key={f.id}
                className="rounded border border-[var(--color-line)] px-2 py-1.5 text-xs"
              >
                <span className="font-medium">{f.adapterLabel}</span>
                <span className="ml-2 font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                  {f.status}
                  {f.contributed ? ' · contributed' : ''}
                </span>
                <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">
                  {f.operation} · {f.amount}
                  {f.route ? ` · ${f.route}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ProcessScreen(props: { hub: MarketHubResponse }) {
  const { hub } = props;
  const steps = hub.modelHydration?.processSteps ?? [];
  const stageOps = hub.modelHydration?.stageOps ?? [];
  const limitOps = stageOps.filter(
    (s) => s.stageId === 'thresholds' || s.stageId === 'defaults',
  );
  const aw = hub.awarenessAnalysis;
  const charts = buildProcessStageCharts(hub);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MarketPostureMetricBars
          title="Ingest process functions"
          slices={charts.processFunctions}
          empty="No process steps hydrated"
        />
        <MarketPosturePieChart
          title="Link strength"
          slices={charts.linkStrength}
          empty="No awareness links"
        />
        <MarketPosturePieChart
          title="Link sources"
          slices={charts.linkFrom}
          empty="No link origins"
        />
        <MarketPosturePieChart
          title="Cost basis by symbol"
          slices={charts.costBasis}
          empty="No held cost basis"
        />
      </section>

      <section className="space-y-1.5">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Ingest filtered feeds
        </h3>
        {steps.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">
            No process steps yet — Sync or Analyze to hydrate ingest.
          </p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
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

      <section className="space-y-1.5">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Linking
        </h3>
        {aw ? (
          <>
            <MarketPostureAwarenessLevels analysis={aw} />
            <div className="grid gap-2 md:grid-cols-2">
              <CategoryBlock title="Evidence" empty="No evidence" count={aw.evidence.length}>
                {aw.evidence.slice(0, 12).map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded border border-[var(--color-line)] px-1.5 py-1 text-xs"
                  >
                    <span className="font-medium">{ev.label}</span>
                    <span className="ml-1 font-mono text-[9px] text-[var(--color-ink-faint)]">
                      {ev.kind} · {ev.linkedSymbolCount} symbols · {ev.strengthBand}
                    </span>
                  </li>
                ))}
              </CategoryBlock>
              <CategoryBlock title="Links" empty="No links" count={aw.links.length}>
                {aw.links.slice(0, 12).map((link) => (
                  <li
                    key={link.id}
                    className="rounded border border-[var(--color-line)] px-1.5 py-1 text-xs"
                  >
                    <span className="font-medium">
                      {link.fromLabel} → {link.toId}
                    </span>
                    <span className="ml-1 font-mono text-[9px] text-[var(--color-ink-faint)]">
                      {link.fromKind}→{link.toKind} · {link.strengthBand}
                    </span>
                  </li>
                ))}
              </CategoryBlock>
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--color-ink-faint)]">
            Awareness links appear after linkage analysis is projected.
          </p>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Limits · thresholds & defaults
          </h3>
          {limitOps.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-faint)]">No limit stage ops hydrated</p>
          ) : (
            <ul className="space-y-1">
              {limitOps.map((op) => (
                <li
                  key={op.stageId}
                  className="flex flex-wrap items-baseline justify-between gap-1 rounded border border-[var(--color-line)] px-2 py-1.5 text-xs"
                >
                  <span className="font-mono uppercase text-[var(--color-ink-faint)]">
                    {op.stageId}
                  </span>
                  <span className="text-[var(--color-ink-dim)]">
                    {op.operation} · {op.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Cost basis · mark vs avg
          </h3>
          {hub.positions.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-faint)]">No open positions</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {hub.positions.map((p) => (
                <li
                  key={p.id}
                  className="rounded border border-[var(--color-line)] px-2 py-1.5 text-xs"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-medium">{p.symbol}</span>
                    <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                      qty {String(p.qty)}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--color-ink-dim)]">
                    cost {dollarsFromCents(p.avgCostCents)} · mark{' '}
                    {dollarsFromCents(p.markCents)} · uPnL{' '}
                    {dollarsFromCents(p.unrealizedPnlCents)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
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
  const charts = buildSealsStageCharts(hub);
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MarketPostureMetricBars
          title="Sealed mover directions"
          slices={charts.moverDirections}
          empty="No sealed movers"
        />
        <MarketPosturePieChart
          title="Mover strength bands"
          slices={charts.moverStrength}
          empty="No mover strength"
        />
        <MarketPosturePieChart
          title="News seal bands"
          slices={charts.newsStrength}
          empty="No news seal items"
        />
        <MarketPostureMetricBars
          title="Report kinds"
          slices={charts.reportKinds}
          empty="No sealed reports"
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

function DayPlanScreen(props: {
  hub: MarketHubResponse;
  mp: MarketPostureViewContextValue;
  watchlistTierFilter: WatchlistTierFilter;
  setWatchlistTierFilter: (v: WatchlistTierFilter) => void;
  filteredWatchlists: MarketHubResponse['watchlists'];
  confirmWatchlist: (itemId: string) => void;
  openReport: (conceptId: string) => void;
}) {
  const { hub, mp } = props;
  const charts = buildDayStageCharts(hub);
  const actionWatchlists = props.filteredWatchlists.filter(
    (w) =>
      w.status === 'suggested_search' ||
      w.status === 'suggested_verified' ||
      w.status === 'watching',
  );

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        <MarketPostureMetricBars
          title="Movements · sealed direction"
          slices={charts.movements}
          empty="No sealed movers"
        />
        <MarketPosturePieChart
          title="Actions · watch + plans"
          slices={charts.actions}
          empty="No suggested actions"
        />
        <MarketPostureMetricBars
          title="Trends · strength"
          slices={charts.trends}
          empty="No trend candidates"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <CategoryBlock
          title="Movements"
          empty="No sealed movements for today"
          count={hub.movers.items.length}
        >
          {hub.movers.items.slice(0, 16).map((item, i) => {
            const symbol = item.symbolOrSector?.trim().replace(/^\$/, '').toUpperCase() ?? null;
            const viz =
              hub.movers.itemViz.find((v) => v.symbol === symbol) ?? null;
            const focused = Boolean(symbol && mp.selectedSymbol === symbol);
            return (
              <li
                key={`${item.symbolOrSector ?? 'm'}-${i}`}
                className={`rounded border px-1.5 py-1 text-xs ${focusRing(focused)}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    if (!symbol) return;
                    mp.focusEntity({
                      symbol,
                      positionId: null,
                      stageScreenId: 'day',
                    });
                  }}
                >
                  {viz ? (
                    <SymbolTicker
                      viz={viz}
                      density="compact"
                      meta={
                        <span className="text-[10px] text-[var(--color-ink-faint)]">
                          {[item.directionBand, item.strengthBand].filter(Boolean).join(' · ')}
                        </span>
                      }
                    />
                  ) : (
                    <>
                      <span className="font-medium">{item.symbolOrSector ?? '—'}</span>
                      <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                        {[item.directionBand, item.strengthBand].filter(Boolean).join(' · ') ||
                          'movement'}
                      </span>
                    </>
                  )}
                </button>
                {item.headline ? (
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">{item.headline}</p>
                ) : null}
              </li>
            );
          })}
        </CategoryBlock>

        <CategoryBlock
          title="Actions"
          empty="No suggested actions for this tier"
          count={actionWatchlists.length + hub.pipeline.length}
          headerExtra={
            <WatchlistTierFilterChips
              value={props.watchlistTierFilter}
              onChange={props.setWatchlistTierFilter}
              className="mt-1 flex flex-wrap gap-1"
            />
          }
        >
          {actionWatchlists.slice(0, 12).map((w) => {
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
                    w.note || 'Suggested action',
                    `Status ${w.status} · bias ${w.bias}`,
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
                        stageScreenId: 'day',
                      })
                    }
                  >
                    {w.viz ? (
                      <SymbolTicker
                        viz={w.viz}
                        density="compact"
                        meta={
                          <span className="text-[10px] text-[var(--color-ink-faint)]">
                            {w.bias} · {w.status}
                          </span>
                        }
                      />
                    ) : (
                      <>
                        <span className="font-medium">{w.symbol}</span>
                        <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                          {w.bias} · {w.status}
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
          {hub.pipeline.slice(0, 8).map((row) => {
            const focused = mp.selectedSymbol === row.symbol && mp.category === 'pipeline';
            return (
              <li
                key={`pipe:${row.symbol}`}
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
                      stageScreenId: 'day',
                    })
                  }
                >
                  <span className="font-medium">{row.symbol}</span>
                  <span className="ml-1 text-[10px] text-[var(--color-ink-faint)]">
                    plan · {row.lead?.status ?? 'no lead'}
                    {row.tree ? ` · tree ${row.tree.status}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </CategoryBlock>

        <CategoryBlock
          title="Trends"
          empty="No trend candidates"
          count={hub.trendCandidates.length}
        >
          {hub.trendCandidates.slice(0, 16).map((t) => {
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
                      stageScreenId: 'day',
                    })
                  }
                >
                  {t.viz ? (
                    <SymbolTicker
                      viz={t.viz}
                      density="compact"
                      meta={
                        <span className="text-[10px] text-[var(--color-ink-faint)]">
                          {t.direction} · {t.strengthBand} · {t.status}
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
      </section>

      <MarketPostureAwarenessDock hub={hub} onOpenConcept={props.openReport} />
    </>
  );
}
