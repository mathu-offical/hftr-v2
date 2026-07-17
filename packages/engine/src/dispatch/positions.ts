import { and, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { positions } from '@hftr/db/schema';

/**
 * Position bookkeeping — written ONLY from the dispatch layer at fill time.
 * Whole-unit quantities, integer cents, average-cost basis. Paper v1 does not
 * support shorting: sells are capped at the held quantity by the gauntlet.
 */

export interface PositionRow {
  qty: bigint;
  avgCostCents: number;
  realizedPnlCents: bigint;
}

/** Weighted average cost after a buy, rounded to the nearest cent. Pure. */
export function nextAverageCost(
  heldQty: bigint,
  avgCostCents: number,
  fillQty: bigint,
  fillPriceCents: number,
): number {
  const newQty = heldQty + fillQty;
  const totalCost = heldQty * BigInt(avgCostCents) + fillQty * BigInt(fillPriceCents);
  return Number((totalCost + newQty / 2n) / newQty);
}

/** Realized PnL in cents for a sell against average cost. Pure. */
export function realizedOnSell(
  fillQty: bigint,
  fillPriceCents: number,
  avgCostCents: number,
): bigint {
  return fillQty * BigInt(fillPriceCents - avgCostCents);
}

export async function getPosition(
  db: Db,
  moduleId: string,
  symbol: string,
): Promise<PositionRow | null> {
  const rows = await db
    .select({
      qty: positions.qty,
      avgCostCents: positions.avgCostCents,
      realizedPnlCents: positions.realizedPnlCents,
    })
    .from(positions)
    .where(and(eq(positions.moduleId, moduleId), eq(positions.symbol, symbol)))
    .limit(1);
  return rows[0] ?? null;
}

/** Apply a fill to the position book. Returns realized PnL in cents (sells). */
export async function applyFill(
  db: Db,
  args: {
    companyId: string;
    moduleId: string;
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
    priceCents: number;
  },
): Promise<bigint> {
  const existing = await getPosition(db, args.moduleId, args.symbol);
  const fillQty = BigInt(args.qty);
  const now = new Date();

  if (args.side === 'buy') {
    if (!existing) {
      await db.insert(positions).values({
        companyId: args.companyId,
        moduleId: args.moduleId,
        symbol: args.symbol,
        qty: fillQty,
        avgCostCents: args.priceCents,
      });
      return 0n;
    }
    const newQty = existing.qty + fillQty;
    const newAvg = nextAverageCost(existing.qty, existing.avgCostCents, fillQty, args.priceCents);
    await db
      .update(positions)
      .set({ qty: newQty, avgCostCents: newAvg, updatedAt: now })
      .where(and(eq(positions.moduleId, args.moduleId), eq(positions.symbol, args.symbol)));
    return 0n;
  }

  // Sell: gauntlet guarantees existing && qty sufficient; defend anyway.
  if (!existing || existing.qty < fillQty) {
    throw new Error('position_underflow: sell exceeds held quantity');
  }
  const realized = realizedOnSell(fillQty, args.priceCents, existing.avgCostCents);
  await db
    .update(positions)
    .set({
      qty: existing.qty - fillQty,
      realizedPnlCents: existing.realizedPnlCents + realized,
      updatedAt: now,
    })
    .where(and(eq(positions.moduleId, args.moduleId), eq(positions.symbol, args.symbol)));
  return realized;
}
