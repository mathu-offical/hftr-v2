'use client';

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { MarketHubResponse } from '@hftr/contracts';
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
  buildStageNodeNumberFlow,
  type StageNodeNumberStep,
} from '@/lib/market-posture-stage-processing';
import {
  buildRootUserCapitalView,
  formatCapitalCents,
} from '@/lib/market-posture-root-capital';
import { buildMarketPostureAlgorithmGraph } from '@/lib/market-posture-algorithm-graph';
import {
  buildCapitalEntityCharts,
  buildCapitalStageCharts,
  buildDayEntityCharts,
  buildDayStageCharts,
  buildLibraryEntityCharts,
  buildLibraryStageCharts,
  buildLiveEntityCharts,
  buildLiveStageCharts,
  buildOutlookEntityCharts,
  buildOutlookStageCharts,
  buildProcessEntityCharts,
  buildProcessStageCharts,
} from '@/lib/market-posture-stage-charts';

function ScreenShell(props: {
  id: MarketPostureStageScreenId;
  label: string;
  summary: string;
  numberFlow: StageNodeNumberStep[];
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
      <div className="mx-auto mt-3 max-w-5xl">
        <StageNodeNumberFlow steps={props.numberFlow} screenId={props.id} />
      </div>
    </section>
  );
}

/** Model group nodes → transforms → numeric readouts (replaces status tape). */
function StageNodeNumberFlow(props: {
  steps: StageNodeNumberStep[];
  screenId: MarketPostureStageScreenId;
}) {
  return (
    <div
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2"
      data-testid={`market-posture-stage-number-flow-${props.screenId}`}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
          Group nodes → numbers
        </p>
        <span className="font-mono text-[9px] tabular-nums text-[var(--color-ink-dim)]">
          {props.steps.length} traces
        </span>
      </div>
      {props.steps.length === 0 ? (
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          No active services or pipelines in this column yet.
        </p>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto">
          {props.steps.map((step) => (
            <li
              key={step.id}
              className="grid grid-cols-1 gap-0.5 border-b border-[var(--color-line)] py-1 last:border-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-2"
              title={step.nodeId}
            >
              <span className="truncate text-[11px] text-[var(--color-ink)]">
                <span className="font-mono text-[9px] uppercase text-[var(--color-ink-faint)]">
                  node
                </span>{' '}
                {step.nodeLabel}
              </span>
              <span className="truncate font-mono text-[9px] text-[var(--color-ink-dim)]">
                → {step.transform}
                {step.formula ? ` · ${step.formula}` : ''}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-[var(--color-accent)] sm:text-right">
                {step.valueLabel}
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

  const stripGraphNodes = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration: props.hub.modelHydration ?? null,
        stages: null,
        layoutMode: 'stripExpanded',
      }).nodes,
    [props.hub.modelHydration],
  );

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
            numberFlow={buildStageNodeNumberFlow(meta.id, props.hub, stripGraphNodes)}
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
    case 'live':
      return <LiveIngestScreen hub={hub} />;
    case 'library':
      return <LibraryScreen hub={hub} mp={mp} />;
    case 'process':
      return <ProcessScreen hub={hub} />;
    case 'outlook':
      return (
        <OutlookScreen
          hub={hub}
          dayLens={props.dayLens}
          setDayLens={props.setDayLens}
          moversStale={props.moversStale}
          openReport={props.openReport}
          mp={mp}
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
  const { hub } = props;
  const libs = hub.modelHydration?.librarySources ?? [];
  return (
    <>
      <section
        className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-library-positioning"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Market-aware company positioning
        </h3>
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Sector and company constants (numerical + semantic) seed from scored live
          analysis, company sectors, included engines, library shelves, and held book
          values — then resolve into discrete ranges and context for downstream process /
          outlook.
        </p>
        <div className="flex flex-wrap gap-1">
          {hub.sectorFocuses.length === 0 ? (
            <span className="font-mono text-[9px] text-[var(--color-ink-faint)]">
              No sector focuses seeded
            </span>
          ) : (
            hub.sectorFocuses.map((s) => (
              <span
                key={s}
                className="border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
              >
                {s}
              </span>
            ))
          )}
        </div>
        {hub.universeExcludes.length > 0 ? (
          <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
            Universe excludes:{' '}
            <span className="text-[var(--color-ink-dim)]">
              {hub.universeExcludes.join(', ')}
            </span>
          </p>
        ) : null}
      </section>

      <section
        className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-library-incoming-seed"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Incoming analysis seed
        </h3>
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Scored live packages land on admitted shelves before constants are used
          downstream. Each row is a live source → library seed edge from the Model strip.
        </p>
        <MarketPostureEntityChartPanel
          title="Scored seed → shelves"
          rows={entities.incomingSeeds}
          empty="No scored seed yet — entitle live sources and admit library concepts"
          testId="market-posture-library-seed-rows"
        />
      </section>

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

      <section
        className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-library-constants"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Seeded constants → discrete ranges
        </h3>
        {libs.length === 0 ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">
            No library shelves hydrated — Sync after sector/engines seed.
          </p>
        ) : (
          <ul className="space-y-1">
            {libs.map((lib) => {
              const pct = Math.round(
                (lib.admittedCount / Math.max(lib.conceptCount, 1)) * 100,
              );
              return (
                <li
                  key={lib.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)]/60 py-1 last:border-0"
                >
                  <div>
                    <p className="text-[11px] text-[var(--color-ink)]">{lib.name}</p>
                    <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                      {lib.shelf} · {lib.topicScope} · {lib.operation}
                    </p>
                  </div>
                  <p className="font-mono text-[10px] tabular-nums text-[var(--color-ink-dim)]">
                    {lib.admittedCount}/{lib.conceptCount} ({pct}% admitted)
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Holdings · numerical context"
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
          title="Libraries · admission ranges"
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
  const flows = (hub.modelHydration?.processingFlows ?? []).filter(
    (f) => f.contributed || f.status === 'ready' || f.status === 'public',
  );
  const normalizeChain = (hub.modelHydration?.processSteps ?? []).filter(
    (s) =>
      (s.status === 'ready' || s.status === 'public') &&
      (s.processFunction === 'fetch' ||
        s.processFunction === 'normalize' ||
        s.processFunction === 'extract' ||
        s.processFunction === 'corroborate'),
  );
  const systemVars = Array.from(
    new Set(flows.flatMap((f) => f.analysisRoles)),
  ).slice(0, 16);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          title="Filtered onto board"
          slices={charts.contributeMix}
          empty="No contribution mix yet"
        />
        <MarketPostureMetricBars
          title="Adapter flow status"
          slices={charts.adapterStatus}
          empty="No adapter flows hydrated"
        />
        <MarketPostureMetricBars
          title="Analysis → library seed"
          slices={charts.analysisPhases}
          empty="No analysis phases yet"
        />
      </section>

      <section
        className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-live-entitle"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Active live sources
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

      <section
        className="space-y-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-live-queries"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Search queries + filters → normalize
        </h3>
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Each active adapter applies route filters (domain, canvas bind, contribution)
          then runs fetch → normalize → extract into system-usable variables for all
          downstream nodes.
        </p>
        {flows.length === 0 ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">
            No active adapter flows — connect keys / bind canvas modules, then Sync.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {flows.slice(0, 12).map((f) => (
              <li
                key={f.id}
                className="border-b border-[var(--color-line)]/60 py-1 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] text-[var(--color-ink)]">{f.adapterLabel}</p>
                  <p className="font-mono text-[9px] tabular-nums text-[var(--color-ink-dim)]">
                    {f.amount}
                  </p>
                </div>
                <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
                  {[f.route, f.operation, f.contributed ? 'contributed' : f.status]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {f.analysisRoles.length > 0 ? (
                  <p className="mt-0.5 font-mono text-[9px] text-[var(--color-accent)]">
                    vars: {f.analysisRoles.join(', ')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {normalizeChain.length > 0 ? (
        <section
          className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
          data-testid="market-posture-live-normalize"
        >
          <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Normalize pipeline
          </h3>
          <ol className="space-y-1">
            {normalizeChain.slice(0, 14).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[9px]"
              >
                <span className="text-[var(--color-ink-dim)]">
                  <span className="uppercase text-[var(--color-ink-faint)]">
                    {s.processFunction}
                  </span>{' '}
                  {s.label}
                </span>
                <span className="tabular-nums text-[var(--color-ink-faint)]">
                  {s.amount}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {systemVars.length > 0 ? (
        <section className="flex flex-wrap gap-1" data-testid="market-posture-live-vars">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            System variables
          </span>
          {systemVars.map((v) => (
            <span
              key={v}
              className="border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--color-ink-dim)]"
            >
              {v}
            </span>
          ))}
        </section>
      ) : null}

      <section
        className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-live-analysis"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Analysis module · organize → route → score
        </h3>
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Raw provider packages are organized by domain, routed into movers/sector/bars
          pipelines, then scored before seeding admitted library shelves. Results appear
          below and as analyze nodes on the Model strip.
        </p>
        <MarketPostureEntityChartPanel
          title="Analysis results · per source"
          rows={entities.analysis}
          empty="No active sources to analyze — connect keys / Sync"
          testId="market-posture-live-analysis-results"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Live sources · filtered readout"
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
  const taggedTrends = aw?.trends ?? [];

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MarketPostureMetricBars
          title="Process functions"
          slices={charts.processFunctions}
          empty="No process steps hydrated"
        />
        <MarketPostureMetricBars
          title="Route clusters"
          slices={charts.routeClusters}
          empty="No route clusters yet"
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

      <section
        className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-process-link-intro"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Link market + news + library
        </h3>
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Discrete market data joins news and library evidence into edges, then emits
          trend lists with tagged symbols for outlook and day plan. Model strip nests
          each process route as a fetch→…→board cluster.
        </p>
        {aw?.coverageSummary ? (
          <p className="font-mono text-[9px] text-[var(--color-ink-faint)]">
            {aw.coverageSummary}
          </p>
        ) : null}
      </section>

      {aw ? <MarketPostureAwarenessLevels analysis={aw} /> : null}

      <section
        className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-tagged-trends"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Tagged trend list
        </h3>
        {taggedTrends.length === 0 ? (
          <p className="text-[10px] text-[var(--color-ink-faint)]">
            No tagged trends yet — Analyze to link boards and emit symbol-tagged trends.
          </p>
        ) : (
          <ul className="space-y-1">
            {taggedTrends.slice(0, 16).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-line)]/60 py-1 last:border-0"
              >
                <div>
                  <p className="font-mono text-[11px] text-[var(--color-ink)]">
                    {t.symbol ? `$${t.symbol}` : t.label}
                  </p>
                  <p className="text-[9px] text-[var(--color-ink-faint)]">{t.label}</p>
                </div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
                  {[t.status, t.linkStrengthBand].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Route clusters · pipeline"
          rows={entities.routes}
          empty="No process routes hydrated — Sync or Analyze"
          testId="market-posture-process-routes"
        />
        <MarketPostureEntityChartPanel
          title="Ingest steps · chart"
          rows={entities.steps}
          empty="No process steps yet — Sync or Analyze"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Links · chart"
          rows={entities.links}
          empty="No awareness links projected"
        />
        <MarketPostureEntityChartPanel
          title="Limits · thresholds & defaults"
          rows={entities.limits}
          empty="No limit stage ops hydrated"
        />
      </section>

      <MarketPostureEntityChartPanel
        title="Cost basis · avg vs mark"
        rows={entities.costBasis}
        empty="No open positions"
      />
    </>
  );
}

function OutlookScreen(props: {
  hub: MarketHubResponse;
  dayLens: 'both' | 'stock' | 'news';
  setDayLens: (v: 'both' | 'stock' | 'news') => void;
  moversStale: boolean;
  openReport: (conceptId: string) => void;
  mp: MarketPostureViewContextValue;
}) {
  const { hub, dayLens, moversStale, openReport, mp } = props;
  const charts = buildOutlookStageCharts(hub);
  const entities = buildOutlookEntityCharts(hub);
  const awareness = hub.marketModelAwareness;

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MarketPostureMetricBars
          title="Watch tiers"
          slices={charts.watchStatus}
          empty="No watched symbols"
        />
        <MarketPostureMetricBars
          title="Board mover directions"
          slices={charts.moverDirections}
          empty="No board movers"
        />
        <MarketPosturePieChart
          title="Mover strength bands"
          slices={charts.moverStrength}
          empty="No mover strength"
        />
        <MarketPosturePieChart
          title="News bands"
          slices={charts.newsStrength}
          empty="No news items"
        />
        <MarketPostureMetricBars
          title="Report kinds"
          slices={charts.reportKinds}
          empty="No committed reports"
        />
      </section>

      {awareness ? (
        <p
          className="font-mono text-[9px] text-[var(--color-ink-faint)]"
          data-testid="market-posture-outlook-sim-honesty"
        >
          Sim substrate: live {awareness.usedLiveCount} · synthetic {awareness.syntheticCount}
          {awareness.feedClasses.length
            ? ` · feeds ${awareness.feedClasses.join(', ')}`
            : ''}
        </p>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPostureEntityChartPanel
          title="Watched symbols · values"
          rows={entities.watched}
          empty="No watched or suggested symbols"
          testId="market-posture-outlook-watched"
          onSelect={(row) => {
            const w = hub.watchlists.find((x) => x.id === row.id);
            if (!w) return;
            mp.focusEntity({
              symbol: w.symbol,
              category: 'watchlists',
              positionId: null,
              openOverlay: true,
              stageScreenId: 'outlook',
            });
          }}
        />
        <MarketPostureEntityChartPanel
          title="Growth outlook · spark path (orientation)"
          rows={entities.growth}
          empty="No spark / heldVsCost outlook yet — Sync or Analyze"
          testId="market-posture-outlook-growth"
          onSelect={(row) => {
            const id = row.id.replace(/^growth:/, '');
            const w = hub.watchlists.find((x) => x.id === id);
            if (!w) return;
            mp.focusEntity({
              symbol: w.symbol,
              category: 'watchlists',
              positionId: null,
              stageScreenId: 'outlook',
            });
          }}
        />
      </section>

      <MarketPostureEntityChartPanel
        title="Open positions · marks"
        rows={entities.positions}
        empty="No open positions"
        testId="market-posture-outlook-positions"
        onSelect={(row) => {
          const p = hub.positions.find((x) => x.id === row.id);
          if (!p) return;
          mp.focusEntity({
            symbol: p.symbol,
            category: 'positions',
            positionId: p.id,
            stageScreenId: 'outlook',
          });
        }}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          Outlook board lens
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
            title={`Stock board · ${hub.movers.title ?? 'movers'}`}
            rows={entities.movers}
            empty="No movers board yet — Analyze commits stock compound"
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
            title={`News board · ${hub.news.title ?? 'sector'}`}
            rows={entities.news}
            empty="No news board yet"
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
        empty="No committed reports yet"
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
      <section
        className="space-y-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
        data-testid="market-posture-day-plan-intro"
      >
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Actionable day plan
        </h3>
        <p className="text-[10px] text-[var(--color-ink-dim)]">
          Combines capital, live normalize vars, library positioning, linked trends, and
          outlook watches into today&apos;s movements, actions, research topics, and trends.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MarketPostureMetricBars
          title="Movements · board direction"
          slices={charts.movements}
          empty="No board movers"
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
        title="Research topics · sectors + reports"
        rows={entities.topics}
        empty="No sector focuses or committed reports yet"
        testId="market-posture-day-topics"
        onSelect={(row) => {
          if (row.id.startsWith('report:')) {
            props.openReport(row.id.slice('report:'.length));
          }
        }}
      />

      <MarketPostureEntityChartPanel
        title="Movements · chart"
        rows={entities.movements}
        empty="No board movements for today"
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
          title="Daily trends · chart"
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
