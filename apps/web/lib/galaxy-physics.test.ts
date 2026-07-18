import { describe, expect, it } from 'vitest';
import {
  chargeStrengthForGraphSize,
  combineLinkLayout,
  computeArticleOrbitCenters3D,
  computeFolderCenters3D,
  createArticleOrbitForce,
  createFolderNestForce,
  createLibraryNestForce,
  createTagSatelliteForce,
  linkDistanceForWeight,
  linkStrengthForWeight,
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
});
