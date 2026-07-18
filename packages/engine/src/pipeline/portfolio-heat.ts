/**
 * Portfolio heat (Grinold & Kahn open-risk budget).
 * Model-free: sum open ATR-risk dollars vs equity × catalog heat band %.
 * Prefer atr_stream / bars via resolveAtrCents; synthetic only as fallback.
 */

import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { positions } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { resolveAtrCents } from '../calc/resolve-atr';
import {
  riskDistanceCents,
  syntheticAtrCents,
} from '../dispatch/position-exits';

export interface OpenPositionRiskInput {
  qty: bigint;
  avgCostCents: number;
  /** When set, used instead of synthetic ATR for open-risk geometry. */
  atrCents?: number;
  symbol?: string;
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

/** Sum open risk across positions (honors per-row atrCents when present). */
export function sumOpenRiskCents(
  rows: OpenPositionRiskInput[],
  atrMultiplier: number,
): number {
  let total = 0;
  for (const row of rows) {
    total += computePositionOpenRiskCents(
      row.qty,
      row.avgCostCents,
      atrMultiplier,
      row.atrCents,
    );
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
  /** Prefer live/stream ATR for the candidate entry when known. */
  entryAtrCents?: number;
}): {
  projectedOpenRiskCents: number;
  projectedHeatPct: number;
  exceeds: boolean;
} {
  const entryRisk = computePositionOpenRiskCents(
    BigInt(Math.max(0, Math.floor(args.entryQty))),
    args.entryPriceCents,
    args.atrMultiplier,
    args.entryAtrCents,
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

/** Load company open positions for heat accounting (qty + cost only). */
export async function loadCompanyOpenPositionRisks(
  db: Db,
  companyId: string,
): Promise<OpenPositionRiskInput[]> {
  const rows = await db
    .select({
      qty: positions.qty,
      avgCostCents: positions.avgCostCents,
      symbol: positions.symbol,
    })
    .from(positions)
    .where(and(eq(positions.companyId, companyId), gt(positions.qty, 0n)));
  return rows.map((r) => ({
    qty: r.qty,
    avgCostCents: r.avgCostCents,
    symbol: r.symbol,
  }));
}

/**
 * Load open positions and attach atr_stream (or bars/synthetic) per symbol
 * via resolveAtrCents. Used by compile heat gate so live ATR is preferred.
 */
export async function loadCompanyOpenPositionRisksWithAtr(
  db: Db,
  clock: Clock,
  companyId: string,
): Promise<OpenPositionRiskInput[]> {
  const rows = await loadCompanyOpenPositionRisks(db, companyId);
  const out: OpenPositionRiskInput[] = [];
  for (const row of rows) {
    const symbol = row.symbol ?? 'UNKNOWN';
    try {
      const { atrCents } = await resolveAtrCents({
        db,
        clock,
        symbol,
        markCents: row.avgCostCents,
        companyId,
      });
      out.push({ ...row, atrCents });
    } catch {
      out.push(row);
    }
  }
  return out;
}
