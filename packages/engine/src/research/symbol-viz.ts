import type { MarketHubSparkSeries, MarketHubSymbolViz, QualitativeBand } from '@hftr/contracts';
import type { Clock } from '../clock';
import { createFixedClock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';

const FLAT_BPS = 15;

export type SparkBuildOpts = {
  /** Number of samples including the current bucket (default 32). */
  count?: number;
  /** Milliseconds between samples (default 60_000 = one quote minute bucket). */
  stepMs?: number;
};

/**
 * Deterministic synthetic spark from the baseline quote walk (D-109).
 * Honest feedClass synthetic_sim — not broker mark history.
 */
export function buildSyntheticSparkSeries(
  symbol: string,
  clock: Clock,
  opts?: SparkBuildOpts,
): MarketHubSparkSeries {
  const count = Math.min(64, Math.max(2, opts?.count ?? 32));
  const stepMs = opts?.stepMs ?? 60_000;
  const now = clock.nowMs();
  const points: MarketHubSparkSeries['points'] = [];
  for (let i = count - 1; i >= 0; i--) {
    const at = now - i * stepMs;
    const q = getSyntheticQuote(symbol, createFixedClock(at));
    points.push({
      t: new Date(at).toISOString(),
      valueCents: String(q.lastCents),
    });
  }
  return { points, feedClass: 'synthetic_sim' };
}

export function directionFromSpark(spark: MarketHubSparkSeries): 'up' | 'down' | 'flat' {
  const first = Number(spark.points[0]?.valueCents);
  const last = Number(spark.points[spark.points.length - 1]?.valueCents);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return 'flat';
  const bps = Math.round(((last - first) / first) * 10_000);
  if (Math.abs(bps) < FLAT_BPS) return 'flat';
  return bps > 0 ? 'up' : 'down';
}

export function heldVsCostFromMarks(
  markCents: number,
  avgCostCents: number,
): 'up' | 'down' | 'flat' {
  if (!Number.isFinite(markCents) || !Number.isFinite(avgCostCents) || avgCostCents <= 0) {
    return 'flat';
  }
  const bps = Math.round(((markCents - avgCostCents) / avgCostCents) * 10_000);
  if (Math.abs(bps) < FLAT_BPS) return 'flat';
  return bps > 0 ? 'up' : 'down';
}

export function strengthTicksFromBand(band: QualitativeBand): 0 | 1 | 2 | 3 {
  switch (band) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function mapTrendStrengthToBand(
  band: 'weak' | 'moderate' | 'strong',
): QualitativeBand {
  switch (band) {
    case 'weak':
      return 'low';
    case 'moderate':
      return 'medium';
    case 'strong':
      return 'high';
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function buildSymbolViz(opts: {
  symbol: string;
  clock: Clock;
  strengthBand: QualitativeBand;
  relevanceBand: QualitativeBand;
  direction?: 'up' | 'down' | 'flat';
  held?: { markCents: number; avgCostCents: number; unrealizedPnlCents: string };
  sparkOpts?: SparkBuildOpts;
}): MarketHubSymbolViz {
  const spark = buildSyntheticSparkSeries(opts.symbol, opts.clock, opts.sparkOpts);
  const direction = opts.direction ?? directionFromSpark(spark);
  const heldVsCost =
    opts.held != null
      ? heldVsCostFromMarks(opts.held.markCents, opts.held.avgCostCents)
      : null;
  return {
    symbol: opts.symbol.toUpperCase(),
    spark,
    direction,
    strengthBand: opts.strengthBand,
    strengthTicks: strengthTicksFromBand(opts.strengthBand),
    relevanceBand: opts.relevanceBand,
    heldVsCost,
    markCents: opts.held?.markCents ?? Number(spark.points[spark.points.length - 1]?.valueCents) || null,
    avgCostCents: opts.held?.avgCostCents ?? null,
    unrealizedPnlCents: opts.held?.unrealizedPnlCents ?? null,
  };
}
