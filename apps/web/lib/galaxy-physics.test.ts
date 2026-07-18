import { describe, expect, it } from 'vitest';
import {
  chargeStrengthForGraphSize,
  createLibraryNestForce,
  linkDistanceForWeight,
  linkStrengthForWeight,
} from './galaxy-physics';

describe('galaxy-physics', () => {
  it('maps weight bands to spring distance and strength', () => {
    expect(linkDistanceForWeight('strong', 'supports')).toBeLessThan(
      linkDistanceForWeight('typical', 'supports'),
    );
    expect(linkDistanceForWeight('weak', 'mentions')).toBeGreaterThan(
      linkDistanceForWeight('typical', 'correlates'),
    );
    expect(linkStrengthForWeight('strong')).toBeGreaterThan(linkStrengthForWeight('weak'));
  });

  it('scales charge with graph size', () => {
    expect(chargeStrengthForGraphSize(20)).toBeLessThan(chargeStrengthForGraphSize(500));
  });

  it('soft nest force pulls outliers inward', () => {
    const centers = new Map([
      ['lib', { x: 0, y: 0, z: 0, radius: 40, name: 'Test' }],
    ]);
    const force = createLibraryNestForce(centers);
    const node = {
      primaryLibraryId: 'lib',
      x: 200,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    force.initialize([node]);
    force(1);
    expect(node.vx).toBeLessThan(0);
  });
});
