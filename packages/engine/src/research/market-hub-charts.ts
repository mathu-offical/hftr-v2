import type { MarketHubChartSlice, MarketHubCharts, QualitativeBand } from '@hftr/contracts';

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
      valueLabel: String(Math.round(Math.abs(e.notionalCents))),
    }));
}

/** Build Market posture chart projections (model-free counts / notionals). */
export function buildMarketHubCharts(input: {
  positions: { symbol: string; qty: string; markCents: number | string }[];
  watchlists: { status: string }[];
  trends: { strengthBand: 'weak' | 'moderate' | 'strong' }[];
  moverDirections: ('up' | 'down' | 'flat')[];
  sourceLanes: { status: 'ready' | 'missing_key' }[];
}): MarketHubCharts {
  const allocation = slicesFromNotionals(
    input.positions.map((p) => {
      const qty = Number(p.qty);
      const mark = Number(p.markCents);
      const notional =
        Number.isFinite(qty) && Number.isFinite(mark) ? Math.round(Math.abs(qty) * mark) : 0;
      return { id: p.symbol, label: p.symbol, notionalCents: notional };
    }),
  );

  const tierCounts = new Map<string, number>();
  for (const w of input.watchlists) {
    tierCounts.set(w.status, (tierCounts.get(w.status) ?? 0) + 1);
  }
  const watchlistTiers = slicesFromCounts(
    [...tierCounts.entries()].map(([id, count]) => ({
      id,
      label: id.replace(/_/g, ' '),
      count,
    })),
  );

  const strengthCounts = { weak: 0, moderate: 0, strong: 0 };
  for (const t of input.trends) {
    strengthCounts[t.strengthBand] += 1;
  }
  const trendStrength = slicesFromCounts([
    { id: 'weak', label: 'weak', count: strengthCounts.weak },
    { id: 'moderate', label: 'moderate', count: strengthCounts.moderate },
    { id: 'strong', label: 'strong', count: strengthCounts.strong },
  ]);

  const dirCounts = { up: 0, down: 0, flat: 0 };
  for (const d of input.moverDirections) {
    dirCounts[d] += 1;
  }
  const moverDirections = slicesFromCounts([
    { id: 'up', label: 'up', count: dirCounts.up },
    { id: 'down', label: 'down', count: dirCounts.down },
    { id: 'flat', label: 'flat', count: dirCounts.flat },
  ]);

  let ready = 0;
  let missing = 0;
  for (const lane of input.sourceLanes) {
    if (lane.status === 'ready') ready += 1;
    else missing += 1;
  }
  const sourceReady = slicesFromCounts([
    { id: 'ready', label: 'ready', count: ready },
    { id: 'missing_key', label: 'need key', count: missing },
  ]);

  return {
    allocation,
    watchlistTiers,
    trendStrength,
    moverDirections,
    sourceReady,
  };
}

export function qualitativeFromMoversBand(
  band: QualitativeBand | undefined,
): QualitativeBand {
  return band ?? 'medium';
}
