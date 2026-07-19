/**
 * Stage-screen chart projections from hydrated Market Hub data (D-186).
 * Each screen gets slices derived from the same source that feeds its readouts —
 * not generic leftover metrics from other columns.
 */

import type {
  MarketHubChartSlice,
  MarketHubResponse,
  MarketHubSymbolViz,
} from '@hftr/contracts';
import {
  buildRootUserCapitalView,
  type RootUserCapitalView,
} from './market-posture-root-capital';

/** Individual hydrated row for entity chart panels (D-186). */
export type StageEntityChartRow = {
  id: string;
  label: string;
  valueLabel: string;
  shareBps: number;
  detail: string | null;
  viz: MarketHubSymbolViz | null;
};

function dollarsLabel(cents: number): string {
  if (!Number.isFinite(cents)) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function slicesFromCounts(
  entries: { id: string; label: string; count: number }[],
): MarketHubChartSlice[] {
  const total = entries.reduce((s, e) => s + e.count, 0);
  if (total <= 0) return [];
  return entries
    .filter((e) => e.count > 0)
    .map((e) => ({
      id: e.id,
      label: e.label,
      shareBps: Math.round((e.count / total) * 10_000),
      valueLabel: String(e.count),
    }));
}

function slicesFromNotionals(
  entries: { id: string; label: string; notionalCents: number }[],
): MarketHubChartSlice[] {
  const total = entries.reduce((s, e) => s + Math.abs(e.notionalCents), 0);
  if (total <= 0) return [];
  return entries
    .filter((e) => e.notionalCents !== 0)
    .sort((a, b) => Math.abs(b.notionalCents) - Math.abs(a.notionalCents))
    .slice(0, 24)
    .map((e) => ({
      id: e.id,
      label: e.label,
      shareBps: Math.round((Math.abs(e.notionalCents) / total) * 10_000),
      valueLabel: dollarsLabel(Math.abs(e.notionalCents)),
    }));
}

function parseCents(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Hub allocation slices with dollar tooltips (API stores raw cents). */
export function formatAllocationSlices(
  slices: MarketHubChartSlice[],
): MarketHubChartSlice[] {
  return slices.map((s) => {
    const raw = Number(s.valueLabel);
    if (!Number.isFinite(raw) || s.valueLabel.startsWith('$')) return s;
    return { ...s, valueLabel: dollarsLabel(raw) };
  });
}

export type CapitalStageCharts = {
  /** Open position mark notionals. */
  bookAllocation: MarketHubChartSlice[];
  /** Engine desk splits from capitalSources. */
  engineSplit: MarketHubChartSlice[];
  /** Company pool + root holding funds. */
  rootFunds: MarketHubChartSlice[];
};

export function buildCapitalStageCharts(
  hub: MarketHubResponse,
  view: RootUserCapitalView = buildRootUserCapitalView(hub),
): CapitalStageCharts {
  const bookAllocation =
    hub.charts.allocation.length > 0
      ? formatAllocationSlices(hub.charts.allocation)
      : slicesFromNotionals(
          hub.positions.map((p) => {
            const qty = Number(p.qty);
            const mark = parseCents(p.markCents) ?? 0;
            const notional =
              Number.isFinite(qty) && mark ? Math.round(Math.abs(qty) * mark) : 0;
            return { id: p.symbol, label: p.symbol, notionalCents: notional };
          }),
        );

  const engineSplit = slicesFromNotionals(
    view.engineGroups.map((g) => ({
      id: g.key,
      label: g.label,
      notionalCents: parseCents(g.allocationCentsTotal) ?? 0,
    })),
  );

  const rootFunds = slicesFromNotionals(
    [
      view.companyPool
        ? {
            id: view.companyPool.id,
            label: view.companyPool.name,
            notionalCents:
              parseCents(view.companyPool.allocationCents) ??
              parseCents(view.companyPool.ledgerBalanceCents) ??
              0,
          }
        : null,
      ...view.rootHoldingFunds.map((f) => ({
        id: f.id,
        label: f.name,
        notionalCents:
          parseCents(f.allocationCents) ?? parseCents(f.ledgerBalanceCents) ?? 0,
      })),
    ].filter((x): x is { id: string; label: string; notionalCents: number } => x != null),
  );

  return { bookAllocation, engineSplit, rootFunds };
}

export type LibraryStageCharts = {
  bookAllocation: MarketHubChartSlice[];
  shelfMix: MarketHubChartSlice[];
  admission: MarketHubChartSlice[];
  pnlMix: MarketHubChartSlice[];
};

export function buildLibraryStageCharts(hub: MarketHubResponse): LibraryStageCharts {
  const libs = hub.modelHydration?.librarySources ?? [];
  const shelfCounts = new Map<string, number>();
  let admitted = 0;
  let concepts = 0;
  for (const lib of libs) {
    shelfCounts.set(lib.shelf, (shelfCounts.get(lib.shelf) ?? 0) + 1);
    admitted += lib.admittedCount;
    concepts += lib.conceptCount;
  }
  const remaining = Math.max(0, concepts - admitted);

  let gain = 0;
  let loss = 0;
  let flat = 0;
  for (const p of hub.positions) {
    const u = parseCents(p.unrealizedPnlCents) ?? 0;
    if (u > 0) gain += 1;
    else if (u < 0) loss += 1;
    else flat += 1;
  }

  return {
    bookAllocation:
      hub.charts.allocation.length > 0
        ? formatAllocationSlices(hub.charts.allocation)
        : slicesFromNotionals(
            hub.positions.map((p) => {
              const qty = Number(p.qty);
              const mark = parseCents(p.markCents) ?? 0;
              return {
                id: p.symbol,
                label: p.symbol,
                notionalCents:
                  Number.isFinite(qty) && mark ? Math.round(Math.abs(qty) * mark) : 0,
              };
            }),
          ),
    shelfMix: slicesFromCounts(
      [...shelfCounts.entries()].map(([id, count]) => ({
        id,
        label: id.replace(/_/g, ' '),
        count,
      })),
    ),
    admission: slicesFromCounts([
      { id: 'admitted', label: 'admitted', count: admitted },
      { id: 'pending', label: 'not admitted', count: remaining },
    ]),
    pnlMix: slicesFromCounts([
      { id: 'gain', label: 'uPnL+', count: gain },
      { id: 'loss', label: 'uPnL−', count: loss },
      { id: 'flat', label: 'flat', count: flat },
    ]),
  };
}

export type LiveStageCharts = {
  sourceReady: MarketHubChartSlice[];
  domainMix: MarketHubChartSlice[];
  contributeMix: MarketHubChartSlice[];
  adapterStatus: MarketHubChartSlice[];
};

export function buildLiveStageCharts(hub: MarketHubResponse): LiveStageCharts {
  const lanes = hub.sources.lanes;
  const domainCounts = new Map<string, number>();
  let contributed = 0;
  let idle = 0;
  for (const lane of lanes) {
    domainCounts.set(lane.domain, (domainCounts.get(lane.domain) ?? 0) + 1);
    if (lane.contributed) contributed += 1;
    else idle += 1;
  }

  const flows = hub.modelHydration?.processingFlows ?? [];
  const statusCounts = new Map<string, number>();
  for (const f of flows) {
    statusCounts.set(f.status, (statusCounts.get(f.status) ?? 0) + 1);
  }

  return {
    sourceReady:
      hub.charts.sourceReady.length > 0
        ? hub.charts.sourceReady
        : slicesFromCounts([
            {
              id: 'ready',
              label: 'ready',
              count: lanes.filter((l) => l.status === 'ready').length,
            },
            {
              id: 'missing_key',
              label: 'need key',
              count: lanes.filter((l) => l.status === 'missing_key').length,
            },
          ]),
    domainMix: slicesFromCounts(
      [...domainCounts.entries()].map(([id, count]) => ({
        id,
        label: id.replace(/_/g, ' '),
        count,
      })),
    ),
    contributeMix: slicesFromCounts([
      { id: 'contributed', label: 'filtered in', count: contributed },
      { id: 'idle', label: 'not in seal', count: idle },
    ]),
    adapterStatus: slicesFromCounts(
      [...statusCounts.entries()].map(([id, count]) => ({
        id,
        label: id.replace(/_/g, ' '),
        count,
      })),
    ),
  };
}

export type ProcessStageCharts = {
  processFunctions: MarketHubChartSlice[];
  linkStrength: MarketHubChartSlice[];
  linkFrom: MarketHubChartSlice[];
  costBasis: MarketHubChartSlice[];
};

export function buildProcessStageCharts(hub: MarketHubResponse): ProcessStageCharts {
  const steps = hub.modelHydration?.processSteps ?? [];
  const fnCounts = new Map<string, number>();
  for (const s of steps) {
    const key = s.processFunction || s.operation || 'step';
    fnCounts.set(key, (fnCounts.get(key) ?? 0) + 1);
  }

  const aw = hub.awarenessAnalysis;
  const strengthCounts = new Map<string, number>();
  const fromCounts = new Map<string, number>();
  for (const link of aw?.links ?? []) {
    strengthCounts.set(
      link.strengthBand,
      (strengthCounts.get(link.strengthBand) ?? 0) + 1,
    );
    fromCounts.set(link.fromKind, (fromCounts.get(link.fromKind) ?? 0) + 1);
  }

  const costBasis = slicesFromNotionals(
    hub.positions.map((p) => {
      const qty = Number(p.qty);
      const cost = parseCents(p.avgCostCents) ?? 0;
      return {
        id: p.symbol,
        label: p.symbol,
        notionalCents:
          Number.isFinite(qty) && cost ? Math.round(Math.abs(qty) * cost) : 0,
      };
    }),
  );

  return {
    processFunctions: slicesFromCounts(
      [...fnCounts.entries()].map(([id, count]) => ({
        id,
        label: id.replace(/_/g, ' '),
        count,
      })),
    ),
    linkStrength: slicesFromCounts(
      [...strengthCounts.entries()].map(([id, count]) => ({
        id,
        label: id,
        count,
      })),
    ),
    linkFrom: slicesFromCounts(
      [...fromCounts.entries()].map(([id, count]) => ({
        id,
        label: id.replace(/_/g, ' '),
        count,
      })),
    ),
    costBasis,
  };
}

export type SealsStageCharts = {
  moverDirections: MarketHubChartSlice[];
  moverStrength: MarketHubChartSlice[];
  newsStrength: MarketHubChartSlice[];
  reportKinds: MarketHubChartSlice[];
};

export function buildSealsStageCharts(hub: MarketHubResponse): SealsStageCharts {
  const strengthCounts = new Map<string, number>();
  for (const item of hub.movers.items) {
    const band = item.strengthBand ?? 'unknown';
    strengthCounts.set(band, (strengthCounts.get(band) ?? 0) + 1);
  }
  const newsCounts = new Map<string, number>();
  for (const item of hub.news.items) {
    const band = item.strengthBand ?? item.directionBand ?? 'unknown';
    newsCounts.set(band, (newsCounts.get(band) ?? 0) + 1);
  }
  const reportCounts = new Map<string, number>();
  for (const r of hub.reports) {
    reportCounts.set(r.kind, (reportCounts.get(r.kind) ?? 0) + 1);
  }

  const dirFromItems = new Map<string, number>();
  for (const item of hub.movers.items) {
    const d = item.directionBand ?? 'unknown';
    dirFromItems.set(d, (dirFromItems.get(d) ?? 0) + 1);
  }

  return {
    moverDirections:
      hub.charts.moverDirections.length > 0
        ? hub.charts.moverDirections
        : slicesFromCounts(
            [...dirFromItems.entries()].map(([id, count]) => ({
              id,
              label: id,
              count,
            })),
          ),
    moverStrength: slicesFromCounts(
      [...strengthCounts.entries()].map(([id, count]) => ({
        id,
        label: id,
        count,
      })),
    ),
    newsStrength: slicesFromCounts(
      [...newsCounts.entries()].map(([id, count]) => ({
        id,
        label: id,
        count,
      })),
    ),
    reportKinds: slicesFromCounts(
      [...reportCounts.entries()].map(([id, count]) => ({
        id,
        label: id.replace(/_/g, ' '),
        count,
      })),
    ),
  };
}

export type DayStageCharts = {
  movements: MarketHubChartSlice[];
  actions: MarketHubChartSlice[];
  trends: MarketHubChartSlice[];
};

export function buildDayStageCharts(hub: MarketHubResponse): DayStageCharts {
  const actionStatuses = new Map<string, number>();
  for (const w of hub.watchlists) {
    if (
      w.status === 'suggested_search' ||
      w.status === 'suggested_verified' ||
      w.status === 'watching'
    ) {
      actionStatuses.set(w.status, (actionStatuses.get(w.status) ?? 0) + 1);
    }
  }
  const pipelinePlans = hub.pipeline.filter((p) => p.lead || p.tree).length;
  if (pipelinePlans > 0) {
    actionStatuses.set('plans', pipelinePlans);
  }

  return {
    movements:
      hub.charts.moverDirections.length > 0
        ? hub.charts.moverDirections
        : buildSealsStageCharts(hub).moverDirections,
    actions:
      actionStatuses.size > 0
        ? slicesFromCounts(
            [...actionStatuses.entries()].map(([id, count]) => ({
              id,
              label: id.replace(/_/g, ' '),
              count,
            })),
          )
        : hub.charts.watchlistTiers,
    trends:
      hub.charts.trendStrength.length > 0
        ? hub.charts.trendStrength
        : slicesFromCounts(
            (() => {
              const c = { weak: 0, moderate: 0, strong: 0 };
              for (const t of hub.trendCandidates) {
                const b = t.strengthBand;
                if (b === 'weak' || b === 'moderate' || b === 'strong') c[b] += 1;
              }
              return [
                { id: 'weak', label: 'weak', count: c.weak },
                { id: 'moderate', label: 'moderate', count: c.moderate },
                { id: 'strong', label: 'strong', count: c.strong },
              ];
            })(),
          ),
  };
}

function strengthToBps(band: string | null | undefined): number {
  switch (band) {
    case 'strong':
    case 'high':
      return 10_000;
    case 'moderate':
    case 'medium':
      return 6_500;
    case 'weak':
    case 'low':
      return 3_500;
    default:
      return 2_000;
  }
}

function rowsFromNotionals(
  entries: {
    id: string;
    label: string;
    notionalCents: number;
    detail?: string | null;
    viz?: MarketHubSymbolViz | null;
  }[],
): StageEntityChartRow[] {
  const total = entries.reduce((s, e) => s + Math.abs(e.notionalCents), 0);
  if (total <= 0) {
    return entries
      .filter((e) => e.label)
      .slice(0, 24)
      .map((e) => ({
        id: e.id,
        label: e.label,
        valueLabel: dollarsLabel(Math.abs(e.notionalCents)),
        shareBps: 0,
        detail: e.detail ?? null,
        viz: e.viz ?? null,
      }));
  }
  return entries
    .filter((e) => e.notionalCents !== 0 || e.viz)
    .sort((a, b) => Math.abs(b.notionalCents) - Math.abs(a.notionalCents))
    .slice(0, 24)
    .map((e) => ({
      id: e.id,
      label: e.label,
      valueLabel: dollarsLabel(Math.abs(e.notionalCents)),
      shareBps: Math.round((Math.abs(e.notionalCents) / total) * 10_000),
      detail: e.detail ?? null,
      viz: e.viz ?? null,
    }));
}

export function buildCapitalEntityCharts(
  hub: MarketHubResponse,
  view: RootUserCapitalView = buildRootUserCapitalView(hub),
): {
  rootFunds: StageEntityChartRow[];
  engineDesks: StageEntityChartRow[];
  positions: StageEntityChartRow[];
} {
  const rootFunds = rowsFromNotionals(
    [
      view.companyPool
        ? {
            id: view.companyPool.id,
            label: view.companyPool.name,
            notionalCents:
              parseCents(view.companyPool.allocationCents) ??
              parseCents(view.companyPool.ledgerBalanceCents) ??
              0,
            detail: `pool · ${view.companyPool.status}`,
          }
        : null,
      ...view.rootHoldingFunds.map((f) => ({
        id: f.id,
        label: f.name,
        notionalCents:
          parseCents(f.allocationCents) ?? parseCents(f.ledgerBalanceCents) ?? 0,
        detail:
          f.allocationShareBps != null
            ? `holding · ${(f.allocationShareBps / 100).toFixed(1)}% of pool`
            : 'holding fund',
      })),
    ].filter((x): x is NonNullable<typeof x> => x != null),
  );

  const deskEntries: {
    id: string;
    label: string;
    notionalCents: number;
    detail?: string;
  }[] = [];
  for (const g of view.engineGroups) {
    for (const d of g.desks) {
      deskEntries.push({
        id: d.id,
        label: d.name,
        notionalCents:
          parseCents(d.allocationCents) ?? parseCents(d.ledgerBalanceCents) ?? 0,
        detail: g.label,
      });
    }
  }

  const positions = rowsFromNotionals(
    hub.positions.map((p) => {
      const qty = Number(p.qty);
      const mark = parseCents(p.markCents) ?? 0;
      return {
        id: p.id,
        label: p.symbol,
        notionalCents:
          Number.isFinite(qty) && mark ? Math.round(Math.abs(qty) * mark) : 0,
        detail: `qty ${p.qty} · uPnL ${dollarsLabel(parseCents(p.unrealizedPnlCents) ?? 0)}`,
        viz: p.viz ?? null,
      };
    }),
  );

  return {
    rootFunds,
    engineDesks: rowsFromNotionals(deskEntries),
    positions,
  };
}

export function buildLibraryEntityCharts(hub: MarketHubResponse): {
  positions: StageEntityChartRow[];
  libraries: StageEntityChartRow[];
} {
  const positions = rowsFromNotionals(
    hub.positions.map((p) => {
      const qty = Number(p.qty);
      const mark = parseCents(p.markCents) ?? 0;
      return {
        id: p.id,
        label: p.symbol,
        notionalCents:
          Number.isFinite(qty) && mark ? Math.round(Math.abs(qty) * mark) : 0,
        detail: `${p.moduleName} · cost ${dollarsLabel(parseCents(p.avgCostCents) ?? 0)}`,
        viz: p.viz ?? null,
      };
    }),
  );

  const libs = hub.modelHydration?.librarySources ?? [];
  const maxAdmitted = Math.max(1, ...libs.map((l) => l.admittedCount));
  const libraries: StageEntityChartRow[] = libs.map((lib) => ({
    id: lib.id,
    label: lib.name,
    valueLabel: `${lib.admittedCount}/${lib.conceptCount}`,
    shareBps: Math.round((lib.admittedCount / maxAdmitted) * 10_000),
    detail: `${lib.shelf} · ${lib.operation} · ${lib.amount}`,
    viz: null,
  }));

  return { positions, libraries };
}

export function buildLiveEntityCharts(hub: MarketHubResponse): {
  sources: StageEntityChartRow[];
  adapters: StageEntityChartRow[];
} {
  const live = hub.modelHydration?.liveSources ?? [];
  const lanes = hub.sources.lanes;
  const sources: StageEntityChartRow[] = (lanes.length > 0 ? lanes : []).map((lane) => {
    const hydration = live.find((s) => s.kind === lane.kind);
    const readyBoost = lane.status === 'ready' ? 7_000 : 2_500;
    const contribBoost = lane.contributed ? 3_000 : 0;
    return {
      id: lane.kind,
      label: lane.label,
      valueLabel: hydration?.amount ?? (lane.contributed ? 'filtered' : lane.status),
      shareBps: Math.min(10_000, readyBoost + contribBoost),
      detail: [
        lane.domain,
        lane.status,
        lane.contributed ? 'in seal' : 'idle',
        hydration?.operation,
      ]
        .filter(Boolean)
        .join(' · '),
      viz: null,
    };
  });

  const flows = hub.modelHydration?.processingFlows ?? [];
  const adapters: StageEntityChartRow[] = flows.map((f) => ({
    id: f.id,
    label: f.adapterLabel,
    valueLabel: f.amount,
    shareBps:
      f.status === 'ready' || f.contributed
        ? 8_500
        : f.status === 'idle'
          ? 2_000
          : 4_500,
    detail: [f.operation, f.status, f.route, f.analysisRoles.join(', ')]
      .filter(Boolean)
      .join(' · '),
    viz: null,
  }));

  return { sources, adapters };
}

export function buildProcessEntityCharts(hub: MarketHubResponse): {
  steps: StageEntityChartRow[];
  links: StageEntityChartRow[];
  costBasis: StageEntityChartRow[];
  limits: StageEntityChartRow[];
} {
  const steps = (hub.modelHydration?.processSteps ?? []).map((s, i, arr) => ({
    id: s.id,
    label: s.label,
    valueLabel: s.amount,
    shareBps: Math.round(((arr.length - i) / Math.max(arr.length, 1)) * 10_000),
    detail: `${s.route} · ${s.processFunction} · ${s.operation}`,
    viz: null,
  }));

  const links = (hub.awarenessAnalysis?.links ?? []).map((link) => ({
    id: link.id,
    label: `${link.fromLabel} → ${link.toId}`,
    valueLabel: link.strengthBand,
    shareBps: strengthToBps(link.strengthBand),
    detail: `${link.fromKind}→${link.toKind}`,
    viz: null,
  }));

  const costBasis = rowsFromNotionals(
    hub.positions.map((p) => {
      const qty = Number(p.qty);
      const cost = parseCents(p.avgCostCents) ?? 0;
      const mark = parseCents(p.markCents) ?? 0;
      return {
        id: p.id,
        label: p.symbol,
        notionalCents:
          Number.isFinite(qty) && cost ? Math.round(Math.abs(qty) * cost) : 0,
        detail: `cost ${dollarsLabel(cost)} · mark ${dollarsLabel(mark)} · uPnL ${dollarsLabel(parseCents(p.unrealizedPnlCents) ?? 0)}`,
        viz: p.viz ?? null,
      };
    }),
  );

  const limits = (hub.modelHydration?.stageOps ?? [])
    .filter((s) => s.stageId === 'thresholds' || s.stageId === 'defaults')
    .map((op) => ({
      id: op.stageId,
      label: op.stageId,
      valueLabel: op.amount,
      shareBps: op.stageId === 'thresholds' ? 8_000 : 5_500,
      detail: op.operation,
      viz: null,
    }));

  return { steps, links, costBasis, limits };
}

export function buildSealsEntityCharts(hub: MarketHubResponse): {
  movers: StageEntityChartRow[];
  news: StageEntityChartRow[];
  reports: StageEntityChartRow[];
} {
  const movers: StageEntityChartRow[] = hub.movers.items.slice(0, 24).map((item, i) => {
    const symbol = item.symbolOrSector?.trim().replace(/^\$/, '').toUpperCase() ?? null;
    const viz =
      (symbol && hub.movers.itemViz.find((v) => v.symbol === symbol)) || null;
    return {
      id: `${symbol ?? 'm'}-${i}`,
      label: item.symbolOrSector ?? item.headline ?? `mover ${i + 1}`,
      valueLabel: [item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || 'sealed',
      shareBps: strengthToBps(item.strengthBand),
      detail: item.headline ?? null,
      viz,
    };
  });

  const news: StageEntityChartRow[] = hub.news.items.slice(0, 24).map((item, i) => ({
    id: `news-${i}-${item.symbolOrSector ?? i}`,
    label: item.headline ?? item.symbolOrSector ?? `news ${i + 1}`,
    valueLabel: [item.directionBand, item.strengthBand].filter(Boolean).join(' · ') || 'sealed',
    shareBps: strengthToBps(item.strengthBand ?? item.directionBand),
    detail: item.symbolOrSector ?? null,
    viz: null,
  }));

  const reports: StageEntityChartRow[] = hub.reports.slice(0, 16).map((r) => ({
    id: r.id,
    label: r.title,
    valueLabel: r.kind,
    shareBps: r.expiresAt ? 5_000 : 8_000,
    detail: r.expiresAt ? 'expiring' : 'sealed',
    viz: null,
  }));

  return { movers, news, reports };
}

export function buildDayEntityCharts(hub: MarketHubResponse): {
  movements: StageEntityChartRow[];
  actions: StageEntityChartRow[];
  trends: StageEntityChartRow[];
} {
  const movements = buildSealsEntityCharts(hub).movers;

  const actions: StageEntityChartRow[] = [
    ...hub.watchlists
      .filter(
        (w) =>
          w.status === 'suggested_search' ||
          w.status === 'suggested_verified' ||
          w.status === 'watching',
      )
      .slice(0, 16)
      .map((w) => ({
        id: w.id,
        label: w.symbol,
        valueLabel: `${w.bias} · ${w.status}`,
        shareBps:
          w.status === 'watching'
            ? 9_000
            : w.status === 'suggested_verified'
              ? 7_000
              : 4_500,
        detail: w.note || w.sourceClass,
        viz: w.viz ?? null,
      })),
    ...hub.pipeline.slice(0, 8).map((row) => ({
      id: `pipe:${row.symbol}`,
      label: row.symbol,
      valueLabel: row.lead?.status ?? 'plan',
      shareBps: row.lead ? 7_500 : 3_500,
      detail: row.tree ? `tree ${row.tree.status}` : 'pipeline',
      viz: null,
    })),
  ];

  const trends: StageEntityChartRow[] = hub.trendCandidates.slice(0, 16).map((t) => ({
    id: t.id,
    label: t.symbol,
    valueLabel: `${t.direction} · ${t.strengthBand}`,
    shareBps: strengthToBps(t.strengthBand),
    detail: t.status,
    viz: t.viz ?? null,
  }));

  return { movements, actions, trends };
}
