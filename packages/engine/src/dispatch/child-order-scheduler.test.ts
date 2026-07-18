import { describe, expect, it } from 'vitest';
import { normalizeChildSliceFraction, planChildSlices, sliceDrainIntervalMs } from './child-order-scheduler';

describe('sliceDrainIntervalMs', () => {
  it('maps low urgency to ~30s and high urgency to ~5s', () => {
    expect(sliceDrainIntervalMs(0.2)).toBe(30_000);
    expect(sliceDrainIntervalMs(3)).toBe(5_000);
  });

  it('clamps out-of-range urgency', () => {
    expect(sliceDrainIntervalMs(0)).toBe(sliceDrainIntervalMs(0.2));
    expect(sliceDrainIntervalMs(10)).toBe(sliceDrainIntervalMs(3));
  });

  it('decreases monotonically as urgency rises', () => {
    const low = sliceDrainIntervalMs(0.5);
    const mid = sliceDrainIntervalMs(1.5);
    const high = sliceDrainIntervalMs(2.5);
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
  });
});

describe('child-order-scheduler', () => {
  it('plans slices that sum to parent qty', () => {
    const plan = planChildSlices({
      parentQty: 20,
      participationPct: 8,
      urgencyScalar: 1,
      childSliceFraction: 0.6,
    });
    expect(plan.slices.reduce((a, b) => a + b, 0)).toBe(20);
    expect(plan.sliceCount).toBeGreaterThanOrEqual(2);
  });

  it('front-loads under high urgency (fewer slices)', () => {
    const calm = planChildSlices({
      parentQty: 40,
      participationPct: 8,
      urgencyScalar: 0.2,
      childSliceFraction: 1,
    });
    const hot = planChildSlices({
      parentQty: 40,
      participationPct: 8,
      urgencyScalar: 3,
      childSliceFraction: 1,
    });
    expect(hot.sliceCount).toBeLessThanOrEqual(calm.sliceCount);
    expect(hot.slices[0]!).toBeGreaterThanOrEqual(calm.slices[0]!);
  });

  it('caps slice by POV vs interval volume', () => {
    const plan = planChildSlices({
      parentQty: 100,
      participationPct: 5,
      urgencyScalar: 1,
      childSliceFraction: 1,
      intervalVolumeShares: 40,
    });
    // 5% of 40 = 2
    expect(Math.max(...plan.slices)).toBeLessThanOrEqual(2);
    expect(plan.slices.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('normalizes child_slice catalog pct', () => {
    expect(normalizeChildSliceFraction(60)).toBe(0.6);
    expect(normalizeChildSliceFraction(0.5)).toBe(0.5);
  });
});
