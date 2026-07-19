import { describe, expect, it } from 'vitest';
import {
  COMPANY_HULL_ID,
  buildCompanyHullNode,
  buildLibraryHullNodes,
  buildTopicHullNode,
  createDerivedFolderHullForce,
  fitSphereAroundPoints,
  folderHullId,
  isNestHullNode,
  nestHullId,
} from './galaxy-nest-hulls';

describe('galaxy-nest-hulls', () => {
  const centers = new Map([
    ['a', { x: 100, y: 0, z: 0, radius: 40, name: 'Alpha Library' }],
    ['b', { x: -100, y: 0, z: 0, radius: 50, name: 'Beta ← Gamma → Delta' }],
  ]);

  it('builds pinned library hull nodes with visible radii', () => {
    const nodes = buildLibraryHullNodes(centers, null);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.id).toBe(nestHullId('a'));
    expect(nodes[0]?.fx).toBe(100);
    expect(nodes[0]?.__radius).toBe(40);
    expect(nodes[1]?.__label).toBe('Beta');
    expect(isNestHullNode(nodes[0]!)).toBe(true);
  });

  it('respects library filter for hull visibility', () => {
    const nodes = buildLibraryHullNodes(centers, new Set(['b']));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.__libraryId).toBe('b');
  });

  it('builds company envelope enclosing nests', () => {
    const company = buildCompanyHullNode(centers, null);
    expect(company.id).toBe(COMPANY_HULL_ID);
    expect(company.__radius).toBeGreaterThan(140);
  });

  it('always builds a company envelope even with no libraries', () => {
    const company = buildCompanyHullNode(new Map(), null);
    expect(company.id).toBe(COMPANY_HULL_ID);
    expect(company.__radius).toBeGreaterThan(0);
  });

  it('keeps company envelope when library filter excludes all', () => {
    const company = buildCompanyHullNode(centers, new Set(['missing']));
    expect(company.id).toBe(COMPANY_HULL_ID);
    expect(company.__radius).toBeGreaterThan(140);
  });

  it('builds topic focus hull from member positions', () => {
    const topic = buildTopicHullNode([
      { x: 0, y: 0, z: 0 },
      { x: 40, y: 0, z: 0 },
      { x: 0, y: 30, z: 0 },
    ]);
    expect(topic?.__hullKind).toBe('topic');
    expect(topic?.__radius).toBeGreaterThan(40);
  });

  it('fits a sphere around outermost member points', () => {
    const fit = fitSphereAroundPoints(
      [
        { x: 0, y: 0, z: 0, pad: 2 },
        { x: 40, y: 0, z: 0, pad: 2 },
        { x: 0, y: 30, z: 0, pad: 2 },
      ],
      { minRadius: 10, pad: 4 },
    );
    expect(fit).not.toBeNull();
    expect(fit!.x).toBeCloseTo(40 / 3, 5);
    expect(fit!.radius).toBeGreaterThan(30);
  });

  it('derived folder hull force wraps concepts without moving them', () => {
    const force = createDerivedFolderHullForce();
    const conceptA = {
      id: 'c1',
      primaryLibraryId: 'lib',
      primaryFolderKey: 'strategy_families',
      x: 10,
      y: 0,
      z: 0,
      val: 2,
    };
    const conceptB = {
      id: 'c2',
      primaryLibraryId: 'lib',
      primaryFolderKey: 'strategy_families',
      x: 50,
      y: 0,
      z: 0,
      val: 2,
    };
    const hull = {
      id: folderHullId('lib', 'strategy_families'),
      __kind: 'nest-hull' as const,
      __hullKind: 'folder' as const,
      __libraryId: 'lib',
      __radius: 12,
      x: 0,
      y: 0,
      z: 0,
      fx: 0,
      fy: 0,
      fz: 0,
    };
    force.initialize([conceptA, conceptB, hull]);
    force(1);
    expect(conceptA.x).toBe(10);
    expect(conceptB.x).toBe(50);
    expect(hull.fx).toBeCloseTo(30, 5);
    expect(hull.__radius).toBeGreaterThan(20);
  });
});
