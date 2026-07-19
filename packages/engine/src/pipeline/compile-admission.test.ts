/**
 * Unit tests for model-free compile admission cascade (D-159).
 */
import { describe, expect, it } from 'vitest';
import {
  childSliceFractionForSubtype,
  runCompileAdmissionCascade,
} from './compile-admission';

describe('childSliceFractionForSubtype', () => {
  it('uses denser slices for hft than day', () => {
    const day = childSliceFractionForSubtype('day');
    const hft = childSliceFractionForSubtype('hft');
    expect(hft).toBeLessThanOrEqual(day);
    expect(hft).toBeGreaterThan(0);
    expect(hft).toBeLessThanOrEqual(1);
  });
});

describe('runCompileAdmissionCascade', () => {
  const base = {
    quantity: 10,
    priceCents: 10_000,
    atrCents: 50,
    atrMultiplier: 2.25,
    existingOpenRiskCents: 0,
    equityCents: 1_000_000n,
    heatCapPct: 8,
    polarizationScore: 0.8,
  };

  it('admits when projected heat is under cap and returns POV plan', () => {
    const result = runCompileAdmissionCascade({ ...base, tradingSubtype: 'day' });
    expect(result.blocked).toBe(false);
    if (result.blocked) return;
    expect(result.childPlan.slices.length).toBeGreaterThanOrEqual(1);
    expect(result.urgency.value).toBeGreaterThan(0);
    expect(result.participation.value).toBeGreaterThan(0);
  });

  it('blocks when open risk already exceeds heat cap', () => {
    const result = runCompileAdmissionCascade({
      ...base,
      existingOpenRiskCents: 500_000,
      equityCents: 1_000_000n,
      heatCapPct: 4,
      quantity: 100,
      atrCents: 200,
    });
    expect(result.blocked).toBe(true);
    if (!result.blocked) return;
    expect(result.blockReason).toBe('portfolio_heat_exceeded');
  });

  it('plans denser child slices for hft subtype at same qty', () => {
    const day = runCompileAdmissionCascade({ ...base, quantity: 20, tradingSubtype: 'day' });
    const hft = runCompileAdmissionCascade({ ...base, quantity: 20, tradingSubtype: 'hft' });
    expect(day.blocked).toBe(false);
    expect(hft.blocked).toBe(false);
    if (day.blocked || hft.blocked) return;
    expect(hft.childPlan.sliceCount).toBeGreaterThanOrEqual(day.childPlan.sliceCount);
  });
});
