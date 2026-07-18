import { describe, expect, it } from 'vitest';
import {
  materializeChildSliceFills,
  normalizeChildSlicesForDrain,
} from './child-slice-fills';

describe('normalizeChildSlicesForDrain', () => {
  it('accepts positive ints that sum to parent', () => {
    expect(normalizeChildSlicesForDrain(10, [4, 3, 3])).toEqual([4, 3, 3]);
  });

  it('rejects single slice, bad sum, or non-ints', () => {
    expect(normalizeChildSlicesForDrain(10, [10])).toBeNull();
    expect(normalizeChildSlicesForDrain(10, [5, 4])).toBeNull();
    expect(normalizeChildSlicesForDrain(10, [5, 5.5])).toBeNull();
    expect(normalizeChildSlicesForDrain(0, [1, 1])).toBeNull();
  });
});

describe('materializeChildSliceFills', () => {
  it('falls back to one fill when slices invalid', () => {
    const r = materializeChildSliceFills({
      parentQty: 5,
      slices: null,
      basePriceCents: 10_000,
      actionVerb: 'buy',
      quoteRef: 'nv_q',
      venueOrderId: 'psim_abc',
    });
    expect(r.usedChildDrain).toBe(false);
    expect(r.fills).toHaveLength(1);
    expect(r.vwapCents).toBe(10_000);
  });

  it('drains buy slices with adverse 1¢ walk and VWAP', () => {
    const r = materializeChildSliceFills({
      parentQty: 6,
      slices: [3, 2, 1],
      basePriceCents: 100,
      actionVerb: 'buy',
      quoteRef: 'nv_q',
      venueOrderId: 'psim_abc',
    });
    expect(r.usedChildDrain).toBe(true);
    expect(r.fills.map((f) => f.priceCents)).toEqual([100, 101, 102]);
    expect(r.fills.map((f) => f.qtyInt)).toEqual(['3', '2', '1']);
    // (3*100 + 2*101 + 1*102) / 6 = 604/6 → 101
    expect(r.vwapCents).toBe(101);
  });

  it('walks sell prices down', () => {
    const r = materializeChildSliceFills({
      parentQty: 4,
      slices: [2, 2],
      basePriceCents: 50,
      actionVerb: 'sell',
      quoteRef: 'nv_q',
      venueOrderId: 'psim_x',
    });
    expect(r.fills.map((f) => f.priceCents)).toEqual([50, 49]);
  });
});
