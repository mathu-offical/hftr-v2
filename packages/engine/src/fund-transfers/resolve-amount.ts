import type { Db } from '@hftr/db';
import { load } from '../calc/store';

/** Matches apps/web/lib/module-setup.ts PERCENT_SCALE for operator pct allocations. */
export const CAPITAL_ALLOCATION_PCT_SCALE = 4;

const PCT_DENOMINATOR = 100n * 10n ** BigInt(CAPITAL_ALLOCATION_PCT_SCALE);

export type ResolveCapitalAllocationOpts = {
  /**
   * Balance base in USD cents when the allocation ref is `pct` (typically company pool).
   * Required for percentage resolve; ignored for fixed `usd_cents`.
   */
  baseBalanceCents?: bigint;
};

/**
 * Resolve a module `capital_allocation_ref` to USD cents.
 * - Fixed: scale-0 `usd_cents` → valueInt
 * - Pct: scale-4 `pct` → floor(baseBalanceCents * valueInt / (100 * 10^4))
 * Returns null when ref is missing, unloadable, or fail-closed (no base for pct, ≤0 result).
 */
export async function resolveCapitalAllocationUsdCents(
  db: Db,
  capitalAllocationRef: string | null | undefined,
  opts?: ResolveCapitalAllocationOpts,
): Promise<bigint | null> {
  if (!capitalAllocationRef) return null;
  let row;
  try {
    row = await load(db, capitalAllocationRef);
  } catch {
    return null;
  }

  if (row.kind === 'usd_cents' && row.scale === 0) {
    if (row.valueInt <= 0n) return null;
    return row.valueInt;
  }

  if (row.kind === 'pct' && row.scale === CAPITAL_ALLOCATION_PCT_SCALE) {
    const base = opts?.baseBalanceCents;
    if (base === undefined || base <= 0n) return null;
    if (row.valueInt <= 0n || row.valueInt > PCT_DENOMINATOR) return null;
    const amount = (base * row.valueInt) / PCT_DENOMINATOR;
    if (amount <= 0n) return null;
    return amount;
  }

  return null;
}
