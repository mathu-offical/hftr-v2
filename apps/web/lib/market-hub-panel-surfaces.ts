/**
 * Panel surface projections for Market Posture Model (D-161 / D-163).
 * Mirrors left-rail + overlay boards so hub_ready hydrates into operator panels.
 * Capital-bearing surfaces carry hub-resolved dollar amount readouts (not LLM).
 */

import type {
  MarketHubAwarenessAnalysis,
  MarketHubCapitalSource,
  MarketHubCharts,
  MarketHubEquity,
  MarketHubModelCapitalSource,
  MarketHubModelHydration,
  MarketHubModelPanelSurface,
  MarketHubModelStageOp,
  MarketHubMovers,
  MarketHubNews,
  MarketHubPosition,
  MarketHubReportLink,
  MarketHubWatchlistItem,
} from '@hftr/contracts';

/** Hub-resolved display dollars — never for LLM prompts (D-008). */
function dollarsFromCents(cents: number | string): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
}

export type PanelSurfaceHubSlice = {
  equity: Pick<MarketHubEquity, 'status' | 'asOfIso' | 'equityCents'>;
  movers: Pick<MarketHubMovers, 'status' | 'items' | 'verifiedAt'>;
  news: Pick<MarketHubNews, 'status' | 'items' | 'verifiedAt'>;
  positions: Pick<MarketHubPosition, 'id'>[];
  watchlists: Pick<MarketHubWatchlistItem, 'id'>[];
  capitalSources: Pick<
    MarketHubCapitalSource,
    | 'id'
    | 'name'
    | 'tier'
    | 'kind'
    | 'status'
    | 'allocationCents'
    | 'ledgerBalanceCents'
    | 'allocationStatus'
  >[];
  reports: Pick<MarketHubReportLink, 'id'>[];
  charts: Pick<
    MarketHubCharts,
    'watchlistTiers' | 'trendStrength' | 'moverDirections' | 'sourceReady'
  >;
  awarenessAnalysis?: Pick<
    MarketHubAwarenessAnalysis,
    'evidence' | 'links' | 'trends' | 'recommendations' | 'asOfIso' | 'coverageSummary'
  > | null;
};

function panelEquityAmount(equity: PanelSurfaceHubSlice['equity']): string {
  if (equity.status === 'unavailable') return 'unavailable';
  if (equity.equityCents == null) return equity.status;
  return `${dollarsFromCents(equity.equityCents)} · ${equity.status}`;
}

function capitalRowAmount(
  s: PanelSurfaceHubSlice['capitalSources'][number],
): string {
  if (s.allocationCents) return dollarsFromCents(s.allocationCents);
  if (s.ledgerBalanceCents) return `L ${dollarsFromCents(s.ledgerBalanceCents)}`;
  switch (s.allocationStatus) {
    case 'missing_base':
      return 'need pool';
    case 'missing_ref':
      return 'unresolved';
    case 'unconfigured':
      return '—';
    case 'resolved':
      return '—';
    default: {
      const _exhaustive: never = s.allocationStatus;
      return _exhaustive;
    }
  }
}

function capitalPanelAmount(sources: PanelSurfaceHubSlice['capitalSources']): string {
  const pool = sources.find((c) => c.kind === 'company_pool');
  if (pool?.allocationCents) {
    const desks = sources.filter((c) => c.tier === 'execution_split').length;
    return desks > 0
      ? `${dollarsFromCents(pool.allocationCents)} · ${desks} desk`
      : dollarsFromCents(pool.allocationCents);
  }
  const summed = sources.reduce((acc, s) => {
    if (!s.allocationCents) return acc;
    const n = Number(s.allocationCents);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
  if (summed > 0) return dollarsFromCents(summed);
  const rootFunds = sources.filter((c) => c.tier === 'company_root').length;
  const desks = sources.filter((c) => c.tier === 'execution_split').length;
  return `${rootFunds} root · ${desks} desk`;
}

/**
 * Project capital fund rows onto the Model as data-source nodes (D-163).
 */
export function buildMarketHubModelCapitalSources(
  sources: PanelSurfaceHubSlice['capitalSources'],
): MarketHubModelCapitalSource[] {
  return sources
    .filter((s) => s.status !== 'unavailable')
    .slice(0, 32)
    .map((s) => ({
      id: s.id,
      name: s.name.slice(0, 120),
      tier: s.tier,
      kind: s.kind,
      operation: s.tier === 'company_root' ? 'root fund' : 'desk split',
      amount: capitalRowAmount(s).slice(0, 40),
      status: s.status,
    }));
}

/**
 * Build panelSurfaces from current hub boards (rail + overlay).
 */
export function buildMarketHubModelPanelSurfaces(
  slice: PanelSurfaceHubSlice,
): MarketHubModelPanelSurface[] {
  const chartSlices =
    slice.charts.watchlistTiers.length +
    slice.charts.trendStrength.length +
    slice.charts.moverDirections.length +
    slice.charts.sourceReady.length;

  return [
    {
      id: 'positions',
      label: 'Open positions',
      panel: 'rail',
      status: slice.positions.length > 0 ? 'ready' : 'empty',
      operation: 'rail inventory',
      amount: `${slice.positions.length} open`,
      sourceStageId: 'narrative',
      emitFromStages: [],
      emitFromFunctions: [],
      updatedAt: slice.equity.asOfIso,
      capitalBearing: true,
    },
    {
      id: 'capital',
      label: 'Funds outline',
      panel: 'rail',
      status: slice.capitalSources.length > 0 ? 'ready' : 'empty',
      operation: 'rail funds',
      amount: capitalPanelAmount(slice.capitalSources).slice(0, 40),
      sourceStageId: 'hub_ready',
      emitFromStages: [],
      emitFromFunctions: [],
      updatedAt: slice.equity.asOfIso,
      capitalBearing: true,
    },
    {
      id: 'equity',
      label: 'Day equity',
      panel: 'overlay',
      status: slice.equity.status,
      operation: 'live book',
      amount: panelEquityAmount(slice.equity).slice(0, 40),
      sourceStageId: 'hub_ready',
      emitFromStages: [],
      emitFromFunctions: [],
      updatedAt: slice.equity.asOfIso,
      capitalBearing: true,
    },
    {
      id: 'movers',
      label: 'Stock movers',
      panel: 'overlay',
      status: slice.movers.status,
      operation: 'seal board',
      amount: `${slice.movers.items.length} items`,
      sourceStageId: 'seal_movers',
      emitFromStages: ['rank', 'rs', 'verify'],
      emitFromFunctions: ['rank', 'score'],
      updatedAt: slice.movers.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'news',
      label: 'Sector news',
      panel: 'overlay',
      status: slice.news.status,
      operation: 'seal board',
      amount: `${slice.news.items.length} items`,
      sourceStageId: 'sector',
      emitFromStages: ['gather', 'sector'],
      emitFromFunctions: ['fetch', 'corroborate', 'seal'],
      updatedAt: slice.news.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'watchlists',
      label: 'Watch recommendations',
      panel: 'overlay',
      status: slice.watchlists.length > 0 ? 'ready' : 'empty',
      operation: 'tier board',
      amount: `${slice.watchlists.length} rows`,
      sourceStageId: 'verify',
      emitFromStages: ['verify', 'rank'],
      emitFromFunctions: ['verify', 'rank'],
      updatedAt: slice.movers.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'reports',
      label: 'Reports dock',
      panel: 'both',
      status: slice.reports.length > 0 ? 'ready' : 'empty',
      operation: 'report links',
      amount: `${slice.reports.length} links`,
      sourceStageId: 'narrative',
      emitFromStages: [],
      emitFromFunctions: [],
      updatedAt: slice.movers.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'charts',
      label: 'Day charts',
      panel: 'overlay',
      status: chartSlices > 0 ? 'ready' : 'empty',
      operation: 'chart hydrate',
      amount: `${chartSlices} slices`,
      sourceStageId: 'hub_ready',
      emitFromStages: ['rs', 'rank'],
      emitFromFunctions: ['score', 'rank'],
      updatedAt: slice.equity.asOfIso,
      capitalBearing: false,
    },
    {
      id: 'awareness_evidence',
      label: 'Awareness · evidence',
      panel: 'overlay',
      status: (slice.awarenessAnalysis?.evidence.length ?? 0) > 0 ? 'ready' : 'empty',
      operation: 'link evidence',
      amount: `${slice.awarenessAnalysis?.evidence.length ?? 0} pkgs`,
      sourceStageId: 'gather',
      emitFromStages: ['gather', 'sector'],
      emitFromFunctions: ['fetch', 'corroborate'],
      updatedAt: slice.awarenessAnalysis?.asOfIso ?? slice.movers.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'awareness_links',
      label: 'Awareness · links',
      panel: 'overlay',
      status: (slice.awarenessAnalysis?.links.length ?? 0) > 0 ? 'ready' : 'empty',
      operation: 'pre-link edges',
      amount: `${slice.awarenessAnalysis?.links.length ?? 0} edges`,
      sourceStageId: 'universe',
      emitFromStages: ['universe', 'gather'],
      emitFromFunctions: ['extract', 'corroborate', 'normalize'],
      updatedAt: slice.awarenessAnalysis?.asOfIso ?? slice.movers.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'awareness_trends',
      label: 'Awareness · trends',
      panel: 'overlay',
      status: (slice.awarenessAnalysis?.trends.length ?? 0) > 0 ? 'ready' : 'empty',
      operation: 'trend grounding',
      amount: `${slice.awarenessAnalysis?.trends.length ?? 0} trends`,
      sourceStageId: 'rank',
      emitFromStages: ['rank', 'rs'],
      emitFromFunctions: ['score', 'context'],
      updatedAt: slice.awarenessAnalysis?.asOfIso ?? slice.movers.verifiedAt,
      capitalBearing: false,
    },
    {
      id: 'awareness_recommendations',
      label: 'Awareness · recommendations',
      panel: 'overlay',
      status: (slice.awarenessAnalysis?.recommendations.length ?? 0) > 0 ? 'ready' : 'empty',
      operation: 'promote tiers',
      amount: `${slice.awarenessAnalysis?.recommendations.length ?? 0} recs`,
      sourceStageId: 'verify',
      emitFromStages: ['verify', 'seal_movers'],
      emitFromFunctions: ['verify', 'rank'],
      updatedAt: slice.awarenessAnalysis?.asOfIso ?? slice.movers.verifiedAt,
      capitalBearing: false,
    },
  ];
}

function patchStageOp(
  stageOps: MarketHubModelStageOp[],
  stageId: MarketHubModelStageOp['stageId'],
  amount: string,
  operation?: string,
): MarketHubModelStageOp[] {
  return stageOps.map((s) =>
    s.stageId === stageId
      ? { ...s, amount, ...(operation ? { operation } : {}) }
      : s,
  );
}

/**
 * Patch modelHydration from a live equity/marks poll without bumping asOfIso (D-161).
 */
export function patchModelHydrationFromLive(opts: {
  hydration: MarketHubModelHydration;
  equity: PanelSurfaceHubSlice['equity'];
  positionCount: number;
  fetchedAt: string;
}): MarketHubModelHydration {
  const { hydration, equity, positionCount, fetchedAt } = opts;
  const panelSurfaces = (hydration.panelSurfaces ?? []).map((s) => {
    if (s.id === 'equity') {
      return {
        ...s,
        status: equity.status,
        amount: panelEquityAmount(equity).slice(0, 40),
        updatedAt: equity.asOfIso ?? fetchedAt,
        capitalBearing: true,
      };
    }
    if (s.id === 'positions') {
      return {
        ...s,
        status: positionCount > 0 ? 'ready' : 'empty',
        amount: `${positionCount} open`,
        updatedAt: equity.asOfIso ?? fetchedAt,
        capitalBearing: true,
      };
    }
    if (s.id === 'capital') {
      return { ...s, updatedAt: equity.asOfIso ?? fetchedAt, capitalBearing: true };
    }
    return s;
  });

  let stageOps = hydration.stageOps;
  stageOps = patchStageOp(stageOps, 'narrative', `${positionCount} held`);
  stageOps = patchStageOp(
    stageOps,
    'hub_ready',
    stageOps.find((s) => s.stageId === 'hub_ready')?.amount ?? 'project',
    'project hub',
  );

  return {
    ...hydration,
    panelSurfaces,
    stageOps,
    livePatchedAt: fetchedAt,
  };
}
