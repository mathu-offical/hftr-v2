/**
 * Panel surface projections for Market Posture Model (D-161).
 * Mirrors left-rail + overlay boards so hub_ready hydrates into operator panels.
 */

import type {
  MarketHubCapitalSource,
  MarketHubCharts,
  MarketHubEquity,
  MarketHubModelHydration,
  MarketHubModelPanelSurface,
  MarketHubModelStageOp,
  MarketHubMovers,
  MarketHubNews,
  MarketHubPosition,
  MarketHubReportLink,
  MarketHubWatchlistItem,
} from '@hftr/contracts';

export type PanelSurfaceHubSlice = {
  equity: Pick<MarketHubEquity, 'status' | 'asOfIso' | 'equityCents'>;
  movers: Pick<MarketHubMovers, 'status' | 'items' | 'verifiedAt'>;
  news: Pick<MarketHubNews, 'status' | 'items' | 'verifiedAt'>;
  positions: Pick<MarketHubPosition, 'id'>[];
  watchlists: Pick<MarketHubWatchlistItem, 'id'>[];
  capitalSources: Pick<MarketHubCapitalSource, 'id' | 'tier'>[];
  reports: Pick<MarketHubReportLink, 'id'>[];
  charts: Pick<
    MarketHubCharts,
    'watchlistTiers' | 'trendStrength' | 'moverDirections' | 'sourceReady'
  >;
};

function panelEquityAmount(equity: PanelSurfaceHubSlice['equity']): string {
  if (equity.status === 'unavailable') return 'unavailable';
  if (equity.equityCents == null) return equity.status;
  // Counts/status only — never LLM dollars on the Model.
  return `${equity.status} · book`;
}

/**
 * Build panelSurfaces from current hub boards (rail + overlay).
 */
export function buildMarketHubModelPanelSurfaces(
  slice: PanelSurfaceHubSlice,
): MarketHubModelPanelSurface[] {
  const rootFunds = slice.capitalSources.filter((c) => c.tier === 'company_root').length;
  const desks = slice.capitalSources.filter((c) => c.tier === 'execution_split').length;
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
      updatedAt: slice.equity.asOfIso,
    },
    {
      id: 'capital',
      label: 'Funds outline',
      panel: 'rail',
      status: slice.capitalSources.length > 0 ? 'ready' : 'empty',
      operation: 'rail funds',
      amount: `${rootFunds} root · ${desks} desk`,
      sourceStageId: 'hub_ready',
      updatedAt: slice.equity.asOfIso,
    },
    {
      id: 'equity',
      label: 'Day equity',
      panel: 'overlay',
      status: slice.equity.status,
      operation: 'live book',
      amount: panelEquityAmount(slice.equity),
      sourceStageId: 'hub_ready',
      updatedAt: slice.equity.asOfIso,
    },
    {
      id: 'movers',
      label: 'Stock movers',
      panel: 'overlay',
      status: slice.movers.status,
      operation: 'seal board',
      amount: `${slice.movers.items.length} items`,
      sourceStageId: 'seal_movers',
      updatedAt: slice.movers.verifiedAt,
    },
    {
      id: 'news',
      label: 'Sector news',
      panel: 'overlay',
      status: slice.news.status,
      operation: 'seal board',
      amount: `${slice.news.items.length} items`,
      sourceStageId: 'sector',
      updatedAt: slice.news.verifiedAt,
    },
    {
      id: 'watchlists',
      label: 'Watch recommendations',
      panel: 'overlay',
      status: slice.watchlists.length > 0 ? 'ready' : 'empty',
      operation: 'tier board',
      amount: `${slice.watchlists.length} rows`,
      sourceStageId: 'verify',
      updatedAt: slice.movers.verifiedAt,
    },
    {
      id: 'reports',
      label: 'Reports dock',
      panel: 'both',
      status: slice.reports.length > 0 ? 'ready' : 'empty',
      operation: 'report links',
      amount: `${slice.reports.length} links`,
      sourceStageId: 'narrative',
      updatedAt: slice.movers.verifiedAt,
    },
    {
      id: 'charts',
      label: 'Day charts',
      panel: 'overlay',
      status: chartSlices > 0 ? 'ready' : 'empty',
      operation: 'chart hydrate',
      amount: `${chartSlices} slices`,
      sourceStageId: 'hub_ready',
      updatedAt: slice.equity.asOfIso,
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
        amount: panelEquityAmount(equity),
        updatedAt: equity.asOfIso ?? fetchedAt,
      };
    }
    if (s.id === 'positions') {
      return {
        ...s,
        status: positionCount > 0 ? 'ready' : 'empty',
        amount: `${positionCount} open`,
        updatedAt: equity.asOfIso ?? fetchedAt,
      };
    }
    if (s.id === 'capital') {
      return { ...s, updatedAt: equity.asOfIso ?? fetchedAt };
    }
    return s;
  });

  let stageOps = hydration.stageOps;
  stageOps = patchStageOp(stageOps, 'narrative', `${positionCount} held`);
  stageOps = patchStageOp(stageOps, 'hub_ready', stageOps.find((s) => s.stageId === 'hub_ready')?.amount ?? 'project', 'project hub');

  return {
    ...hydration,
    panelSurfaces,
    stageOps,
    livePatchedAt: fetchedAt,
  };
}
