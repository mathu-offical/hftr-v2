import type { Db } from '@hftr/db';
import { load } from '../calc/store';

/**
 * Resolve a module `capital_allocation_ref` to fixed USD cents (scale-0 `usd_cents` only).
 * Returns null when ref is missing or not a fixed-usd allocation.
 */
export async function resolveCapitalAllocationUsdCents(
  db: Db,
  capitalAllocationRef: string | null | undefined,
): Promise<bigint | null> {
  if (!capitalAllocationRef) return null;
  let row;
  try {
    row = await load(db, capitalAllocationRef);
  } catch {
    return null;
  }
  if (row.kind !== 'usd_cents' || row.scale !== 0) return null;
  if (row.valueInt <= 0n) return null;
  return row.valueInt;
}
