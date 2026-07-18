/**
 * Portfolio heat (Grinold & Kahn open-risk budget).
 * Model-free: sum open ATR-risk dollars vs equity × catalog heat band %.
 */

import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { positions } from '@hftr/db/schema';
import {
  riskDistanceCents,
  syntheticAtrCents,
} from '../dispatch/position-exits';

export interface OpenPositionRiskInput {
  qty: bigint;
  avgCostCents: number;
}

/** Per-position open risk in cents = qty × (ATR × atr_mult). */
export function computePositionOpenRiskCents(
  qty: bigint,
  avgCostCents: number,
  atrMultiplier: number,
  atrCents?: number,
): number {
  if (qty <= 0n || avgCostCents <= 0 || atrMultiplier <= 0) return 0;
  const atr = atrCents ?? syntheticAtrCents(avgCostCents);
  const riskPerShare = riskDistanceCents(atr, atrMultiplier);
  if (riskPerShare <= 0) return 0;
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n * riskPerShare);
}

/** Sum open risk across positions. */
export function sumOpenRiskCents(
  rows: OpenPositionRiskInput[],
  atrMultiplier: number,
): number {
  let total = 0;
  for (const row of rows) {
    total += computePositionOpenRiskCents(row.qty, row.avgCostCents, atrMultiplier);
  }
  return total;
}

/** Heat as % of equity: open_risk / equity × 100. */
export function portfolioHeatPct(openRiskCents: number, equityCents: bigint): number {
  const eq = Number(equityCents);
  if (!Number.isFinite(eq) || eq <= 0) return 0;
  if (!Number.isFinite(openRiskCents) || openRiskCents <= 0) return 0;
  return (openRiskCents / eq) * 100;
}

/**
 * Project heat after a candidate entry. Returns whether the entry would
 * exceed the catalog heat ceiling (max band position used as hard gate).
 */
export function projectHeatAfterEntry(args: {
  existingOpenRiskCents: number;
  entryQty: number;
  entryPriceCents: number;
  atrMultiplier: number;
  equityCents: bigint;
  heatCapPct: number;
}): {
  projectedOpenRiskCents: number;
  projectedHeatPct: number;
  exceeds: boolean;
} {
  const entryRisk = computePositionOpenRiskCents(
    BigInt(Math.max(0, Math.floor(args.entryQty))),
    args.entryPriceCents,
    args.atrMultiplier,
  );
  const projectedOpenRiskCents = args.existingOpenRiskCents + entryRisk;
  const projectedHeatPct = portfolioHeatPct(projectedOpenRiskCents, args.equityCents);
  const cap =
    Number.isFinite(args.heatCapPct) && args.heatCapPct > 0 ? args.heatCapPct : 8;
  return {
    projectedOpenRiskCents,
    projectedHeatPct,
    exceeds: projectedHeatPct > cap,
  };
}

/** Load company open positions for heat accounting. */
export async function loadCompanyOpenPositionRisks(
  db: Db,
  companyId: string,
): Promise<OpenPositionRiskInput[]> {
  const rows = await db
    .select({
      qty: positions.qty,
      avgCostCents: positions.avgCostCents,
    })
    .from(positions)
    .where(and(eq(positions.companyId, companyId), gt(positions.qty, 0n)));
  return rows.map((r) => ({ qty: r.qty, avgCostCents: r.avgCostCents }));
}
