/**
 * Materialize compile-planned childSlices into paper fill legs (POV drain).
 * Deterministic, model-free. Sum of slice qtys must equal parentQty.
 */

export interface ChildSliceFillLeg {
  qtyInt: string;
  qtyScale: number;
  priceCents: number;
  atRef: string;
  sliceIndex: number;
  venueOrderId: string;
}

export interface MaterializeChildSliceFillsResult {
  usedChildDrain: boolean;
  fills: ChildSliceFillLeg[];
  /** Share-weighted average fill price (cents). */
  vwapCents: number;
  totalQty: number;
}

/**
 * Normalize a compile lineage childSlices array: accept only positive ints that
 * sum to parentQty. Otherwise fall back to a single parent fill (no drain).
 */
export function normalizeChildSlicesForDrain(
  parentQty: number,
  slices: unknown,
): number[] | null {
  if (!Array.isArray(slices) || parentQty <= 0) return null;
  const ints: number[] = [];
  let sum = 0;
  for (const s of slices) {
    if (typeof s !== 'number' || !Number.isInteger(s) || s <= 0) return null;
    ints.push(s);
    sum += s;
  }
  if (ints.length < 2 || sum !== parentQty) return null;
  return ints;
}

/**
 * Build one child fill leg with 1¢ adverse walk per slice index
 * (buy: higher asks; sell: lower bids).
 */
export function materializeOneChildSliceFill(args: {
  sliceIndex: number;
  qty: number;
  basePriceCents: number;
  actionVerb: 'buy' | 'sell';
  quoteRef: string;
  venueOrderId: string;
}): ChildSliceFillLeg {
  const walk = args.actionVerb === 'buy' ? args.sliceIndex : -args.sliceIndex;
  const priceCents = Math.max(1, args.basePriceCents + walk);
  return {
    qtyInt: String(args.qty),
    qtyScale: 0,
    priceCents,
    atRef: args.quoteRef,
    sliceIndex: args.sliceIndex,
    venueOrderId: `${args.venueOrderId}_s${args.sliceIndex}`,
  };
}

/**
 * Build sequential child fill legs with a 1¢ adverse walk per slice
 * (buy: higher asks; sell: lower bids) — honest paper impact proxy under POV.
 */
export function materializeChildSliceFills(args: {
  parentQty: number;
  slices: unknown;
  basePriceCents: number;
  actionVerb: 'buy' | 'sell';
  quoteRef: string;
  venueOrderId: string;
}): MaterializeChildSliceFillsResult {
  const normalized = normalizeChildSlicesForDrain(args.parentQty, args.slices);
  if (!normalized) {
    return {
      usedChildDrain: false,
      fills: [
        {
          qtyInt: String(args.parentQty),
          qtyScale: 0,
          priceCents: args.basePriceCents,
          atRef: args.quoteRef,
          sliceIndex: 0,
          venueOrderId: args.venueOrderId,
        },
      ],
      vwapCents: args.basePriceCents,
      totalQty: args.parentQty,
    };
  }

  const fills: ChildSliceFillLeg[] = [];
  let notional = 0;
  for (let i = 0; i < normalized.length; i++) {
    const qty = normalized[i]!;
    const leg = materializeOneChildSliceFill({
      sliceIndex: i,
      qty,
      basePriceCents: args.basePriceCents,
      actionVerb: args.actionVerb,
      quoteRef: args.quoteRef,
      venueOrderId: args.venueOrderId,
    });
    fills.push(leg);
    notional += qty * leg.priceCents;
  }
  const totalQty = args.parentQty;
  const vwapCents = Math.max(1, Math.round(notional / totalQty));
  return { usedChildDrain: true, fills, vwapCents, totalQty };
}
