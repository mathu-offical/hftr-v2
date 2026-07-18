import { describe, expect, it } from 'vitest';
import {
  blendValveDrivers,
  proposeValvePositionDelta,
  resolveParticipationValve,
  resolveUrgencyValve,
  weightToBandPosition,
} from './weighted-valves';

describe('weighted-valves', () => {
  it('blends drivers as continuous weights', () => {
    expect(blendValveDrivers([{ score: 1 }, { score: 0 }])).toBeCloseTo(0.5);
    expect(blendValveDrivers([{ score: 1, weight: 3 }, { score: 0, weight: 1 }])).toBeCloseTo(0.75);
  });

  it('maps weight thirds to band positions', () => {
    expect(weightToBandPosition(0.1)).toBe('min');
    expect(weightToBandPosition(0.5)).toBe('typical');
    expect(weightToBandPosition(0.9)).toBe('max');
  });

  it('resolves participation inside catalog band under urgency pressure', () => {
    const calm = resolveParticipationValve({ urgencyWeight: 0.2, position: 'typical' });
    const hot = resolveParticipationValve({ urgencyWeight: 3, position: 'typical' });
    expect(calm.value).toBeGreaterThanOrEqual(calm.band.min);
    expect(hot.value).toBeLessThanOrEqual(hot.band.max);
    expect(hot.value).toBeGreaterThan(calm.value);
  });

  it('resolves urgency from polarization + recovery pressure', () => {
    const low = resolveUrgencyValve({ polarizationScore: 0.1, recoveryPressure: 0.1 });
    const high = resolveUrgencyValve({ polarizationScore: 0.95, recoveryPressure: 0.9 });
    expect(high.value).toBeGreaterThan(low.value);
    expect(high.value).toBeLessThanOrEqual(high.band.max);
  });

  it('proposes in-band position deltas for learning', () => {
    expect(proposeValvePositionDelta({ current: 'typical', outcomeScore: 0.5 })).toBe('max');
    expect(proposeValvePositionDelta({ current: 'typical', outcomeScore: -0.5 })).toBe('min');
    expect(proposeValvePositionDelta({ current: 'typical', outcomeScore: 0 })).toBe('typical');
  });
});
