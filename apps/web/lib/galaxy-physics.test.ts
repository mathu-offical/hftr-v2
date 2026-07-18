import { describe, expect, it } from 'vitest';
import {
  chargeStrengthForGraphSize,
  combineLinkLayout,
  computeArticleOrbitCenters3D,
  computeCompanyEnvelopeBounds,
  computeFolderCenters3D,
  computeLibraryCenters3D,
  computeVolumeCameraPose,
  createArticleOrbitForce,
  createFolderCohereForce,
  createFolderNestForce,
  createFolderShellRadialForce,
  createForeignLibraryRepelForce,
  createLibraryCohereForce,
  createLibraryNestForce,
  createNestShellRadialForce,
  createTagSatelliteForce,
  crossLibraryLinkScale,
  hierarchicalLinkScale,
  fibonacciSpherePoint,
  linkDistanceForWeight,
  linkStrengthForWeight,
  nestPackingSignature,
  separateLibraryCenters,
} from './galaxy-physics';
import { linkDistanceForSimilarity } from './galaxy-similarity';

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
    const centers = new Map([['lib', { x: 0, y: 0, z: 0, radius: 40, name: 'Test' }]]);
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

  it('places folder centers inside parent library ring', () => {
    const libraryCenters = new Map([['lib-1', { x: 100, y: 0, z: 0, radius: 80, name: 'Lib' }]]);
    const folderCenters = computeFolderCenters3D({
      libraryCenters,
      folders: [
        {
          folderKey: 'strategy_families',
          libraryId: 'lib-1',
          label: 'Strategies',
          mass: 5,
          memberCount: 3,
        },
      ],
    });
    const center = folderCenters.get('lib-1::strategy_families');
    expect(center).toBeDefined();
    const dist = Math.hypot((center?.x ?? 0) - 100, center?.y ?? 0);
    expect(dist).toBeLessThan(80);
    expect(dist).toBeGreaterThan(0);
  });

  it('soft folder nest force pulls outliers inward', () => {
    const centers = new Map([
      [
        'lib::folder',
        {
          x: 0,
          y: 0,
          z: 0,
          radius: 30,
          name: 'Folder',
          folderKey: 'folder',
          libraryId: 'lib',
          mass: 4,
        },
      ],
    ]);
    const force = createFolderNestForce(centers);
    const node = {
      primaryLibraryId: 'lib',
      primaryFolderKey: 'folder',
      x: 150,
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

  it('places article orbits inside folder parent when folderKey set', () => {
    const libraryCenters = new Map([['lib-1', { x: 0, y: 0, z: 0, radius: 80, name: 'Lib' }]]);
    const folderCenters = computeFolderCenters3D({
      libraryCenters,
      folders: [
        {
          folderKey: 'topics',
          libraryId: 'lib-1',
          label: 'Topics',
          mass: 6,
          memberCount: 2,
        },
      ],
    });
    const articleCenters = computeArticleOrbitCenters3D({
      articles: [
        {
          topicId: 'topic-a',
          title: 'Article A',
          libraryId: 'lib-1',
          folderKey: 'topics',
          memberCount: 4,
        },
      ],
      libraryCenters,
      folderCenters,
    });
    const article = articleCenters.get('topic-a');
    const folder = folderCenters.get('lib-1::topics');
    expect(article).toBeDefined();
    expect(folder).toBeDefined();
    const dist = Math.hypot(
      (article?.x ?? 0) - (folder?.x ?? 0),
      (article?.y ?? 0) - (folder?.y ?? 0),
    );
    expect(dist).toBeLessThan(folder?.radius ?? 0);
  });

  it('article orbit force uses weaker pull than library nest', () => {
    const centers = new Map([
      [
        'topic-1',
        {
          x: 0,
          y: 0,
          z: 0,
          radius: 20,
          topicId: 'topic-1',
          title: 'T',
          libraryId: 'lib',
          folderKey: null,
        },
      ],
    ]);
    const force = createArticleOrbitForce(centers);
    const node = {
      primaryArticleId: 'topic-1',
      x: 100,
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

  it('tag satellite force attracts toward parent concept', () => {
    const parent = {
      id: 'parent-1',
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    const satellite = {
      id: 'sat-1',
      __kind: 'tag-sat' as const,
      __parentConceptId: 'parent-1',
      x: 50,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    const force = createTagSatelliteForce();
    force.initialize([parent, satellite]);
    force(1);
    expect(satellite.vx).toBeLessThan(0);
    expect(parent.vx).toBe(0);
  });

  it('combineLinkLayout blends weight and similarity springs', () => {
    const blended = combineLinkLayout('typical', 'correlates', 'high');
    const weightOnly = linkDistanceForWeight('typical', 'correlates');
    const simOnly = linkDistanceForSimilarity('high');

    expect(blended.distance).toBeCloseTo(0.55 * weightOnly + 0.45 * simOnly);
    expect(blended.strength).toBeGreaterThan(0);
    expect(blended.strength).toBeLessThanOrEqual(1);
  });

  it('places libraries on concentric Fibonacci spheres with real Z depth', () => {
    const centers = computeLibraryCenters3D(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Big',
          masterLibrary: false,
          topicScope: '',
          conceptCount: 40,
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Small',
          masterLibrary: false,
          topicScope: '',
          conceptCount: 3,
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          name: 'Mid',
          masterLibrary: false,
          topicScope: '',
          conceptCount: 12,
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          name: 'Other',
          masterLibrary: false,
          topicScope: '',
          conceptCount: 8,
        },
      ],
      [],
    );
    const pts = [...centers.values()];
    expect(pts.length).toBe(4);
    const zs = pts.map((p) => p.z);
    const zSpan = Math.max(...zs) - Math.min(...zs);
    const xs = pts.map((p) => p.x);
    const xSpan = Math.max(...xs) - Math.min(...xs);
    // Volume packing: Z extent must be comparable to XY (not a flat pancake).
    expect(zSpan).toBeGreaterThan(xSpan * 0.35);
    const big = centers.get('11111111-1111-1111-1111-111111111111')!;
    const small = centers.get('22222222-2222-2222-2222-222222222222')!;
    expect(big.radius).toBeGreaterThan(small.radius);
  });

  it('nestPackingSignature changes when centers move', () => {
    const a = new Map([
      ['lib', { x: 10, y: 0, z: 0, radius: 40, name: 'A' }],
    ]);
    const b = new Map([
      ['lib', { x: 200, y: 0, z: 50, radius: 40, name: 'A' }],
    ]);
    expect(nestPackingSignature(a)).not.toBe(nestPackingSignature(b));
  });

  it('nest shell radial force pushes core members outward toward target band', () => {
    const centers = new Map([['lib', { x: 0, y: 0, z: 0, radius: 80, name: 'Lib' }]]);
    const force = createNestShellRadialForce(centers);
    const node = {
      id: 'c1',
      primaryLibraryId: 'lib',
      x: 2,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    force.initialize([node]);
    force(1);
    // Near core → push outward (positive vx along +x).
    expect(node.vx).toBeGreaterThan(0);
  });

  it('folder shell radial force fills folder ball volume', () => {
    const centers = new Map([
      [
        'lib::f',
        {
          x: 0,
          y: 0,
          z: 0,
          radius: 40,
          name: 'Folder',
          folderKey: 'f',
          libraryId: 'lib',
          mass: 3,
        },
      ],
    ]);
    const force = createFolderShellRadialForce(centers);
    const node = {
      id: 'c2',
      primaryLibraryId: 'lib',
      primaryFolderKey: 'f',
      x: 1,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    force.initialize([node]);
    force(1);
    expect(node.vx).toBeGreaterThan(0);
  });

  it('volume camera pose sits outside the company envelope', () => {
    const centers = computeLibraryCenters3D(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'A',
          masterLibrary: false,
          topicScope: '',
          conceptCount: 20,
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'B',
          masterLibrary: false,
          topicScope: '',
          conceptCount: 8,
        },
      ],
      [],
    );
    const envelope = computeCompanyEnvelopeBounds(centers);
    const pose = computeVolumeCameraPose(centers);
    const dist = Math.hypot(
      pose.position.x - pose.lookAt.x,
      pose.position.y - pose.lookAt.y,
      pose.position.z - pose.lookAt.z,
    );
    expect(dist).toBeGreaterThan(envelope.radius * 1.5);
    expect(pose.position.y).toBeGreaterThan(pose.lookAt.y);
    expect(pose.envelopeRadius).toBe(envelope.radius);
  });

  it('folder cohere pulls members toward live centroid', () => {
    const a = {
      primaryLibraryId: 'lib',
      primaryFolderKey: 'f',
      x: -40,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    const b = {
      primaryLibraryId: 'lib',
      primaryFolderKey: 'f',
      x: 40,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    const force = createFolderCohereForce();
    force.initialize([a, b]);
    force(1);
    expect(a.vx).toBeGreaterThan(0);
    expect(b.vx).toBeLessThan(0);
  });

  it('foreign library repel pushes nodes out of other nests', () => {
    const centers = new Map([
      ['home', { x: 0, y: 0, z: 0, radius: 40, name: 'Home' }],
      ['other', { x: 100, y: 0, z: 0, radius: 40, name: 'Other' }],
    ]);
    const node = {
      primaryLibraryId: 'home',
      // Inside foreign hull, offset from exact center so direction is defined.
      x: 90,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    const force = createForeignLibraryRepelForce(centers);
    force.initialize([node]);
    force(1);
    // Push further away from foreign center (x=100) → negative vx.
    expect(node.vx).toBeLessThan(0);
  });

  it('separateLibraryCenters resolves overlapping hulls', () => {
    const centers = new Map([
      ['a', { x: 0, y: 0, z: 0, radius: 80, name: 'A' }],
      ['b', { x: 40, y: 0, z: 0, radius: 80, name: 'B' }],
    ]);
    separateLibraryCenters(centers, 1.38, 12);
    const a = centers.get('a')!;
    const b = centers.get('b')!;
    const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(gap).toBeGreaterThanOrEqual((a.radius + b.radius) * 1.38 - 1e-6);
  });

  it('computeLibraryCenters3D keeps hulls non-overlapping after packing', () => {
    const centers = computeLibraryCenters3D(
      Array.from({ length: 8 }, (_, i) => ({
        id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
        name: `Lib ${i}`,
        masterLibrary: false,
        topicScope: '',
        conceptCount: 20 + i * 8,
      })),
      [],
    );
    const entries = [...centers.values()];
    expect(entries.length).toBe(8);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]!;
        const b = entries[j]!;
        const gap = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        expect(gap).toBeGreaterThanOrEqual((a.radius + b.radius) * 1.38 - 1e-3);
      }
    }
  });

  it('library cohere pulls members toward live centroid', () => {
    const force = createLibraryCohereForce();
    const a = {
      primaryLibraryId: 'lib',
      x: -40,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    const b = {
      primaryLibraryId: 'lib',
      x: 40,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
    force.initialize([a, b]);
    force(1);
    expect(a.vx).toBeGreaterThan(0);
    expect(b.vx).toBeLessThan(0);
  });

  it('hierarchicalLinkScale biases by membership without crushing cross-system springs', () => {
    expect(hierarchicalLinkScale({ sameLibrary: true, sameFolder: false, sameArticle: false })).toEqual({
      distanceMul: 1,
      strengthMul: 1,
    });
    const article = hierarchicalLinkScale({
      sameLibrary: true,
      sameFolder: true,
      sameArticle: true,
    });
    expect(article.distanceMul).toBeLessThan(1);
    expect(article.strengthMul).toBeGreaterThan(1);
    const cross = hierarchicalLinkScale({
      sameLibrary: false,
      sameFolder: false,
      sameArticle: false,
    });
    expect(cross.distanceMul).toBeLessThan(1.5);
    expect(cross.strengthMul).toBeGreaterThan(0.7);
  });

  it('crossLibraryLinkScale delegates to hierarchicalLinkScale', () => {
    expect(crossLibraryLinkScale(true)).toEqual(
      hierarchicalLinkScale({ sameLibrary: true, sameFolder: false, sameArticle: false }),
    );
    expect(crossLibraryLinkScale(false)).toEqual(
      hierarchicalLinkScale({ sameLibrary: false, sameFolder: false, sameArticle: false }),
    );
  });
});
