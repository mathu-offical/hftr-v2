'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { MarketHubResponse, MarketHubSynthesisRun } from '@hftr/contracts';
import { MarketPostureEquityChart } from '@/components/panels/MarketPostureEquityChart';
import { MarketPostureSourcesStrip } from '@/components/panels/MarketPostureSourcesStrip';
import { SourceVerifyChips } from '@/components/panels/SourceVerifyChips';
import { MarketPostureAwarenessDock } from '@/components/panels/MarketPostureAwarenessDock';
import { MarketPostureAwarenessLevels } from '@/components/panels/MarketPostureAwarenessLevels';
import { MarketPosturePieChart } from '@/components/market/MarketPosturePieChart';
import { MarketPostureMetricBars } from '@/components/market/MarketPostureMetricBars';
import { MarketPostureEntityChartPanel } from '@/components/market/MarketPostureEntityChartPanel';
import {
  useMarketPostureView,
  type MarketPostureViewContextValue,
} from '@/components/panels/MarketPostureViewContext';
import {
  WatchlistTierFilterChips,
  type WatchlistTierFilter,
} from '@/components/panels/WatchlistTierFilters';
import { formatOrientation } from '@/components/panels/market-posture-format';
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
  buildCapitalEntityCharts,
  buildCapitalStageCharts,
  buildDayEntityCharts,
  buildDayStageCharts,
  buildLibraryEntityCharts,
  buildLibraryStageCharts,
  buildLiveEntityCharts,
  buildLiveStageCharts,
  buildProcessEntityCharts,
  buildProcessStageCharts,
  buildSealsEntityCharts,
  buildSealsStageCharts,
} from '@/lib/market-posture-stage-charts';

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
  const entities = buildCapitalEntityCharts(props.hub, view);
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
          heightPx={160}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Root funds · chart"
          rows={entities.rootFunds}
          empty="No root holding funds"
          testId="market-posture-root-holding-funds"
        />
        <MarketPostureEntityChartPanel
          title="Engine desks · chart"
          rows={entities.engineDesks}
          empty="No engine desk splits yet"
          testId="market-posture-engine-allocations"
        />
      </section>

      <MarketPostureEntityChartPanel
        title="Open positions · mark chart"
        rows={entities.positions}
        empty="No open positions"
        testId="market-posture-capital-positions"
      />
    </>
  );
}

function LibraryScreen(props: {
  hub: MarketHubResponse;
  mp: MarketPostureViewContextValue;
}) {
  const charts = buildLibraryStageCharts(props.hub);
  const entities = buildLibraryEntityCharts(props.hub);
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

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Positions · spark + mark"
          rows={entities.positions}
          empty="No open positions"
          onSelect={(row) => {
            const p = props.hub.positions.find((x) => x.id === row.id);
            if (!p) return;
            props.mp.focusEntity({
              symbol: p.symbol,
              positionId: p.id,
              category: 'positions',
              stageScreenId: 'library',
            });
          }}
        />
        <MarketPostureEntityChartPanel
          title="Libraries · admission chart"
          rows={entities.libraries}
          empty="No admitted library sources on Model"
        />
      </section>
    </>
  );
}

function LiveIngestScreen(props: { hub: MarketHubResponse }) {
  const { hub } = props;
  const totals = hub.modelHydration?.totals;
  const charts = buildLiveStageCharts(hub);
  const entities = buildLiveEntityCharts(hub);

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

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Live sources · filtered readout chart"
          rows={entities.sources}
          empty="No live sources — connect research keys / broker, then Sync"
        />
        <MarketPostureEntityChartPanel
          title="Adapters · hydrate chart"
          rows={entities.adapters}
          empty="No adapter flows hydrated"
        />
      </section>
    </>
  );
}

function ProcessScreen(props: { hub: MarketHubResponse }) {
  const { hub } = props;
  const aw = hub.awarenessAnalysis;
  const charts = buildProcessStageCharts(hub);
  const entities = buildProcessEntityCharts(hub);

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

      {aw ? <MarketPostureAwarenessLevels analysis={aw} /> : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Ingest steps · chart"
          rows={entities.steps}
          empty="No process steps yet — Sync or Analyze"
        />
        <MarketPostureEntityChartPanel
          title="Links · chart"
          rows={entities.links}
          empty="No awareness links projected"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Limits · thresholds & defaults"
          rows={entities.limits}
          empty="No limit stage ops hydrated"
        />
        <MarketPostureEntityChartPanel
          title="Cost basis · avg vs mark"
          rows={entities.costBasis}
          empty="No open positions"
        />
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
  const entities = buildSealsEntityCharts(hub);
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
          Seal lens
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
        {moversStale ? (
          <span className="font-mono text-[9px] uppercase text-[var(--color-warn,var(--color-ink-faint))]">
            movers stale
          </span>
        ) : null}
        <SourceVerifyChips chips={hub.movers.sourceChips ?? []} />
      </div>

      <section
        className={`grid gap-3 ${dayLens === 'both' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}
      >
        {dayLens !== 'news' ? (
          <MarketPostureEntityChartPanel
            title={`Stock seals · ${hub.movers.title ?? 'movers'} chart`}
            rows={entities.movers}
            empty="No movers seal yet — Analyze reseals stock compound"
            testId="market-posture-stock-board"
            headerExtra={
              hub.movers.reportConceptId ? (
                <button
                  type="button"
                  onClick={() => openReport(hub.movers.reportConceptId!)}
                  className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                >
                  Open report
                </button>
              ) : null
            }
          />
        ) : null}
        {dayLens !== 'stock' ? (
          <MarketPostureEntityChartPanel
            title={`News seals · ${hub.news.title ?? 'sector'} chart`}
            rows={entities.news}
            empty="No news seal yet"
            testId="market-posture-news-board"
            headerExtra={
              hub.news.reportConceptId ? (
                <button
                  type="button"
                  onClick={() => openReport(hub.news.reportConceptId!)}
                  className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                >
                  Open report
                </button>
              ) : null
            }
          />
        ) : null}
      </section>

      <MarketPostureEntityChartPanel
        title="Phase reports · chart"
        rows={entities.reports}
        empty="No sealed reports yet"
        onSelect={(row) => openReport(row.id)}
      />
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
  void props.confirmWatchlist;
  const charts = buildDayStageCharts(hub);
  const entities = buildDayEntityCharts(hub);
  // Prefer filtered watchlist actions when tier chips narrow the set.
  const filteredActionIds = new Set(
    props.filteredWatchlists
      .filter(
        (w) =>
          w.status === 'suggested_search' ||
          w.status === 'suggested_verified' ||
          w.status === 'watching',
      )
      .map((w) => w.id),
  );
  const actionRows = entities.actions.filter(
    (row) => row.id.startsWith('pipe:') || filteredActionIds.has(row.id),
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

      <MarketPostureEntityChartPanel
        title="Movements · chart"
        rows={entities.movements}
        empty="No sealed movements for today"
        onSelect={(row) => {
          const symbol = row.label.trim().replace(/^\$/, '').toUpperCase();
          if (!symbol || symbol.includes(' ')) return;
          mp.focusEntity({ symbol, positionId: null, stageScreenId: 'day' });
        }}
      />

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Actions · chart"
          rows={actionRows}
          empty="No suggested actions for this tier"
          headerExtra={
            <WatchlistTierFilterChips
              value={props.watchlistTierFilter}
              onChange={props.setWatchlistTierFilter}
              className="flex flex-wrap gap-1"
            />
          }
          onSelect={(row) => {
            if (row.id.startsWith('pipe:')) {
              mp.focusEntity({
                symbol: row.label,
                category: 'pipeline',
                positionId: null,
                stageScreenId: 'day',
              });
              return;
            }
            const w = hub.watchlists.find((x) => x.id === row.id);
            if (!w) return;
            mp.focusEntity({
              symbol: w.symbol,
              category: 'watchlists',
              positionId: null,
              openOverlay: true,
              stageScreenId: 'day',
            });
          }}
        />
        <MarketPostureEntityChartPanel
          title="Trends · chart"
          rows={entities.trends}
          empty="No trend candidates"
          onSelect={(row) => {
            mp.focusEntity({
              symbol: row.label,
              category: 'trends',
              positionId: null,
              stageScreenId: 'day',
            });
          }}
        />
      </section>

      <MarketPostureAwarenessDock hub={hub} onOpenConcept={props.openReport} />
    </>
  );
}
