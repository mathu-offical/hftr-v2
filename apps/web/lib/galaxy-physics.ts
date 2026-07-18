/**
 * Galaxy 3D physics helpers (TD-09).
 * Tuned for neural-style force-directed layouts: spring links by qualitative
 * weight band, many-body charge, collision, and soft library-nest attractors.
 */

import type { ResearchGraphLibraryNest, ResearchGraphLink } from '@hftr/contracts';

import {
  linkDistanceForSimilarity,
  linkStrengthForSimilarity,
  type SimilarityBand,
} from './galaxy-similarity';

export interface LibraryCenter3D {
  x: number;
  y: number;
  z: number;
  radius: number;
  name: string;
}

export type GalaxySimNode = {
  id?: string | number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  val?: number;
  primaryLibraryId?: string | null;
  /** Catalog folder tag, e.g. strategy_families. */
  primaryFolderKey?: string | null;
  /** Topic uuid for article-orbit nesting. */
  primaryArticleId?: string | null;
  __kind?: string;
  /** Parent concept id for tag-satellite orbit forces. */
  __parentConceptId?: string;
};

/** Spring rest length from qualitative weight band (no raw floats in model path). */
export function linkDistanceForWeight(
  weightBand: ResearchGraphLink['weightBand'],
  relation: ResearchGraphLink['relation'],
): number {
  let base = 48;
  switch (weightBand) {
    case 'strong':
      base = 30;
      break;
    case 'typical':
      base = 48;
      break;
    case 'weak':
      base = 78;
      break;
    default: {
      const _exhaustive: never = weightBand;
      return _exhaustive;
    }
  }
  switch (relation) {
    case 'causes':
    case 'supports':
    case 'derived_from':
      return base * 0.88;
    case 'contradicts':
      return base * 1.25;
    case 'correlates':
      return base;
    case 'mentions':
      return base * 1.15;
    default: {
      const _exhaustive: never = relation;
      return _exhaustive;
    }
  }
}

export function linkStrengthForWeight(weightBand: ResearchGraphLink['weightBand']): number {
  switch (weightBand) {
    case 'strong':
      return 0.95;
    case 'typical':
      return 0.55;
    case 'weak':
      return 0.22;
    default: {
      const _exhaustive: never = weightBand;
      return _exhaustive;
    }
  }
}

export function chargeStrengthForGraphSize(nodeCount: number): number {
  // Slightly stronger repulsion so nests read as clouds rather than stacked blobs.
  if (nodeCount > 400) return -52;
  if (nodeCount > 200) return -78;
  if (nodeCount > 80) return -105;
  return -132;
}

/** Place library nests on a 3D ring with slight vertical stagger. */
export function computeLibraryCenters3D(
  nests: ResearchGraphLibraryNest[],
  nodes: Array<{ primaryLibraryId?: string | null }>,
): Map<string, LibraryCenter3D> {
  const libMeta = new Map(nests.map((l) => [l.id, l]));
  const libIds =
    nests.length > 0
      ? nests.map((l) => l.id)
      : [
          ...new Set(
            nodes.map((n) => n.primaryLibraryId).filter((id): id is string => Boolean(id)),
          ),
        ];

  const count = Math.max(libIds.length, 1);
  const ringRadius = Math.min(280, 90 + count * 42);
  const centers = new Map<string, LibraryCenter3D>();

  libIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    const meta = libMeta.get(id);
    const conceptCount = meta?.conceptCount ?? 3;
    const z = ((i % 3) - 1) * (28 + count * 4);
    centers.set(id, {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
      z,
      radius: 55 + Math.min(70, conceptCount * 1.8),
      name: meta?.name ?? 'Library',
    });
  });

  return centers;
}

/** Deterministic 3D jitter so nodes do not start coincident. */
export function hashSpread3D(id: string): { dx: number; dy: number; dz: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h % 360) * Math.PI) / 180;
  const b = ((((h >> 8) % 180) - 90) * Math.PI) / 180;
  const r = 14 + (Math.abs(h) % 36);
  return {
    dx: Math.cos(a) * Math.cos(b) * r,
    dy: Math.sin(a) * Math.cos(b) * r,
    dz: Math.sin(b) * r,
  };
}

/**
 * Soft spherical nest force: mild attract to library center + restore when outside hull.
 * Compatible with d3-force-3d custom force interface.
 */
export function createLibraryNestForce(centers: Map<string, LibraryCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const pull = alpha * 0.055;
    const restore = alpha * 0.52;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const libId = node.primaryLibraryId;
      if (!libId) continue;
      const center = centers.get(libId);
      if (!center) continue;

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const maxR = center.radius * 0.86;

      if (dist > maxR) {
        const k = ((dist - maxR) / dist) * restore;
        node.vx = (node.vx ?? 0) - dx * k;
        node.vy = (node.vy ?? 0) - dy * k;
        node.vz = (node.vz ?? 0) - dz * k;
      } else {
        node.vx = (node.vx ?? 0) - dx * pull;
        node.vy = (node.vy ?? 0) - dy * pull;
        node.vz = (node.vz ?? 0) - dz * pull;
      }
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

export type FolderCenter3D = LibraryCenter3D & {
  folderKey: string;
  libraryId: string;
  mass: number;
};

/** Place folder nests on a ring inside each parent library hull. */
export function computeFolderCenters3D(opts: {
  libraryCenters: Map<string, LibraryCenter3D>;
  folders: Array<{
    folderKey: string;
    libraryId: string;
    label: string;
    mass: number;
    memberCount: number;
  }>;
}): Map<string, FolderCenter3D> {
  const { libraryCenters, folders } = opts;
  const byLibrary = new Map<string, typeof folders>();

  for (const folder of folders) {
    const list = byLibrary.get(folder.libraryId) ?? [];
    list.push(folder);
    byLibrary.set(folder.libraryId, list);
  }

  const centers = new Map<string, FolderCenter3D>();

  for (const [libraryId, libFolders] of byLibrary) {
    const parent = libraryCenters.get(libraryId);
    if (!parent) continue;

    const count = Math.max(libFolders.length, 1);
    const ringRadius = parent.radius * 0.42;

    libFolders.forEach((folder, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const key = `${libraryId}::${folder.folderKey}`;
      centers.set(key, {
        x: parent.x + Math.cos(angle) * ringRadius,
        y: parent.y + Math.sin(angle) * ringRadius,
        z: parent.z + ((i % 3) - 1) * 8,
        radius: 22 + Math.min(40, folder.mass * 1.6 + folder.memberCount * 0.8),
        name: folder.label,
        folderKey: folder.folderKey,
        libraryId: folder.libraryId,
        mass: folder.mass,
      });
    });
  }

  return centers;
}

export type ArticleOrbitCenter3D = {
  x: number;
  y: number;
  z: number;
  radius: number;
  topicId: string;
  title: string;
  libraryId: string | null;
  folderKey: string | null;
};

/** Place article orbit centers inside folder (or library) parent hulls. */
export function computeArticleOrbitCenters3D(opts: {
  articles: Array<{
    topicId: string;
    title: string;
    libraryId: string | null;
    folderKey: string | null;
    memberCount: number;
  }>;
  libraryCenters: Map<string, LibraryCenter3D>;
  folderCenters: Map<string, FolderCenter3D>;
}): Map<string, ArticleOrbitCenter3D> {
  const { articles, libraryCenters, folderCenters } = opts;
  const byParent = new Map<string, typeof articles>();

  for (const article of articles) {
    const parentKey =
      article.folderKey && article.libraryId
        ? `${article.libraryId}::${article.folderKey}`
        : (article.libraryId ?? 'orphan');
    const list = byParent.get(parentKey) ?? [];
    list.push(article);
    byParent.set(parentKey, list);
  }

  const centers = new Map<string, ArticleOrbitCenter3D>();

  for (const [parentKey, group] of byParent) {
    const folderParent = folderCenters.get(parentKey);
    const libraryParent = folderParent ? null : libraryCenters.get(parentKey);
    const parent = folderParent ?? libraryParent;

    const parentX = parent?.x ?? 0;
    const parentY = parent?.y ?? 0;
    const parentZ = parent?.z ?? 0;
    const parentRadius = parent?.radius ?? 55;

    const count = Math.max(group.length, 1);
    const ringRadius = parentRadius * 0.35;

    group.forEach((article, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      centers.set(article.topicId, {
        x: parentX + Math.cos(angle) * ringRadius,
        y: parentY + Math.sin(angle) * ringRadius,
        z: parentZ + ((i % 3) - 1) * 5,
        radius: 14 + Math.min(28, article.memberCount * 2.2),
        topicId: article.topicId,
        title: article.title,
        libraryId: article.libraryId,
        folderKey: article.folderKey,
      });
    });
  }

  return centers;
}

/** Soft folder nest: attract nodes with matching library + folder key. */
export function createFolderNestForce(centers: Map<string, FolderCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    // Folders win over library soft-pull so catalog spheres stay coherent.
    const pull = alpha * 0.07;
    const restore = alpha * 0.58;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const libId = node.primaryLibraryId;
      const folderKey = node.primaryFolderKey;
      if (!libId || !folderKey) continue;
      const center = centers.get(`${libId}::${folderKey}`);
      if (!center) continue;

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const maxR = center.radius * 0.84;

      if (dist > maxR) {
        const k = ((dist - maxR) / dist) * restore;
        node.vx = (node.vx ?? 0) - dx * k;
        node.vy = (node.vy ?? 0) - dy * k;
        node.vz = (node.vz ?? 0) - dz * k;
      } else {
        node.vx = (node.vx ?? 0) - dx * pull;
        node.vy = (node.vy ?? 0) - dy * pull;
        node.vz = (node.vz ?? 0) - dz * pull;
      }
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/** Weaker article-orbit attractor keyed by primaryArticleId. */
export function createArticleOrbitForce(centers: Map<string, ArticleOrbitCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const pull = alpha * 0.08;
    const restore = alpha * 0.42;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const articleId = node.primaryArticleId;
      if (!articleId) continue;
      const center = centers.get(articleId);
      if (!center) continue;

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const maxR = center.radius * 0.84;

      if (dist > maxR) {
        const k = ((dist - maxR) / dist) * restore;
        node.vx = (node.vx ?? 0) - dx * k;
        node.vy = (node.vy ?? 0) - dy * k;
        node.vz = (node.vz ?? 0) - dz * k;
      } else {
        node.vx = (node.vx ?? 0) - dx * pull;
        node.vy = (node.vy ?? 0) - dy * pull;
        node.vz = (node.vz ?? 0) - dz * pull;
      }
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/** Attract tag satellites toward their parent concept at short rest distance. */
export function createTagSatelliteForce() {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const byId = new Map<string, GalaxySimNode>();
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.id === undefined) continue;
      byId.set(String(node.id), node);
    }

    const restDistance = 14;
    const strength = 0.28;

    for (const node of nodes) {
      if (node.__kind !== 'tag-sat') continue;
      const parentId = node.__parentConceptId;
      if (!parentId) continue;
      const parent = byId.get(parentId);
      if (!parent || parent.__kind === 'nest-hull') continue;

      const dx = (parent.x ?? 0) - (node.x ?? 0);
      const dy = (parent.y ?? 0) - (node.y ?? 0);
      const dz = (parent.z ?? 0) - (node.z ?? 0);
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const delta = dist - restDistance;
      const k = (alpha * strength * delta) / dist;

      node.vx = (node.vx ?? 0) + dx * k;
      node.vy = (node.vy ?? 0) + dy * k;
      node.vz = (node.vz ?? 0) + dz * k;
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/** Blend qualitative weight-band springs with semantic similarity layout. */
export function combineLinkLayout(
  weightBand: ResearchGraphLink['weightBand'],
  relation: ResearchGraphLink['relation'],
  similarityBand: SimilarityBand,
): { distance: number; strength: number } {
  const weightDistance = linkDistanceForWeight(weightBand, relation);
  const weightStrength = linkStrengthForWeight(weightBand);
  const similarityDistance = linkDistanceForSimilarity(similarityBand);
  const similarityStrength = linkStrengthForSimilarity(similarityBand);

  return {
    distance: 0.55 * weightDistance + 0.45 * similarityDistance,
    strength: Math.max(weightStrength, similarityStrength * 0.85),
  };
}
