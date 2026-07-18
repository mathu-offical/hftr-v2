import { describe, expect, it } from 'vitest';
import {
  applyPolarizationToSizingBps,
  resolveComplexSignalPolarization,
  strengthPolarizationMultiplier,
} from './signal-polarization';

describe('signal polarization', () => {
  it('maps strength bands to fixed-fractional multipliers', () => {
    expect(strengthPolarizationMultiplier('weak')).toBe(0.6);
    expect(strengthPolarizationMultiplier('moderate')).toBe(1.0);
    expect(strengthPolarizationMultiplier('strong')).toBe(1.35);
  });

  it('raises sizing when strong + full gates + aligned', () => {
    const pol = resolveComplexSignalPolarization({
      strengthBand: 'strong',
      gatePassCount: 6,
      gateTotal: 6,
      directionAligned: true,
    });
    expect(pol.score).toBeGreaterThan(0.85);
    expect(pol.sizingMultiplier).toBeGreaterThan(1.3);
    expect(applyPolarizationToSizingBps(75, pol.sizingMultiplier)).toBeGreaterThan(75);
  });

  it('de-risks weak + misaligned signals', () => {
    const pol = resolveComplexSignalPolarization({
      strengthBand: 'weak',
      gatePassCount: 3,
      gateTotal: 6,
      directionAligned: false,
    });
    expect(pol.score).toBeLessThan(0.45);
    expect(pol.sizingMultiplier).toBeLessThan(1);
    expect(applyPolarizationToSizingBps(75, pol.sizingMultiplier)).toBeLessThan(75);
  });

  it('clamps multiplier into [0.5, 1.5]', () => {
    expect(applyPolarizationToSizingBps(100, 0.1)).toBe(50);
    expect(applyPolarizationToSizingBps(100, 9)).toBe(150);
  });
});
