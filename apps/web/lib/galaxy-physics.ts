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
  // Softer global charge so nest attractors dominate (avoids uniform cloud).
  if (nodeCount > 400) return -28;
  if (nodeCount > 200) return -42;
  if (nodeCount > 80) return -58;
  return -72;
}

/**
 * Place library nests on a size-ranked golden spiral (not an equal ring).
 * Large libraries sit farther out with larger hull radii so clusters read as
 * distinct masses instead of a uniform necklace.
 */
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

  const ranked = [...libIds].sort((a, b) => {
    const ca = libMeta.get(a)?.conceptCount ?? 0;
    const cb = libMeta.get(b)?.conceptCount ?? 0;
    if (cb !== ca) return cb - ca;
    return a.localeCompare(b);
  });

  const centers = new Map<string, LibraryCenter3D>();
  const golden = Math.PI * (3 - Math.sqrt(5));

  ranked.forEach((id, i) => {
    const meta = libMeta.get(id);
    const conceptCount = meta?.conceptCount ?? 3;
    const sizeBoost = Math.min(140, conceptCount * 3.2);
    // Strong radius steps so nests don't read as an equal necklace.
    const spiralR = 55 + i * 38 + Math.sqrt(i + 1) * 28 + sizeBoost * 0.55;
    const angle = i * golden - Math.PI / 2;
    const z = ((i % 5) - 2) * (22 + Math.min(18, conceptCount * 0.45));
    centers.set(id, {
      x: Math.cos(angle) * spiralR,
      y: Math.sin(angle) * spiralR,
      z,
      radius: 36 + Math.min(120, conceptCount * 3.1 + sizeBoost * 0.35),
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
 * When a folder key is present, library pull weakens so folder spheres own local structure.
 */
export function createLibraryNestForce(centers: Map<string, LibraryCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const libId = node.primaryLibraryId;
      if (!libId) continue;
      const center = centers.get(libId);
      if (!center) continue;

      const hasFolder = Boolean(node.primaryFolderKey);
      const pull = alpha * (hasFolder ? 0.018 : 0.05);
      const restore = alpha * (hasFolder ? 0.28 : 0.62);

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const maxR = center.radius * (hasFolder ? 0.92 : 0.82);

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
    // Mass-weighted ring — denser folders sit closer to library core.
    const sorted = [...libFolders].sort((a, b) => b.mass - a.mass || b.memberCount - a.memberCount);

    sorted.forEach((folder, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2 + i * 0.17;
      const ringRadius = parent.radius * (0.28 + (i / Math.max(count, 1)) * 0.38);
      const key = `${libraryId}::${folder.folderKey}`;
      centers.set(key, {
        x: parent.x + Math.cos(angle) * ringRadius,
        y: parent.y + Math.sin(angle) * ringRadius,
        z: parent.z + ((i % 4) - 1.5) * (10 + folder.mass * 0.4),
        radius: 18 + Math.min(48, folder.mass * 2.1 + folder.memberCount * 1.1),
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
    const golden = Math.PI * (3 - Math.sqrt(5));

    // Size-ranked spiral inside parent — avoids equal-ring “necklace” of articles.
    const ranked = [...group].sort((a, b) => b.memberCount - a.memberCount || a.topicId.localeCompare(b.topicId));

    ranked.forEach((article, i) => {
      const angle = i * golden - Math.PI / 2;
      const spiralR = parentRadius * (0.18 + Math.sqrt(i + 1) / Math.sqrt(count + 1) * 0.42);
      centers.set(article.topicId, {
        x: parentX + Math.cos(angle) * spiralR,
        y: parentY + Math.sin(angle) * spiralR,
        z: parentZ + ((i % 4) - 1.5) * (4 + article.memberCount * 0.35),
        radius: 12 + Math.min(32, article.memberCount * 2.4),
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
    const pull = alpha * 0.11;
    const restore = alpha * 0.78;
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
      const maxR = center.radius * 0.78;

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

/**
 * Cohesion inside each folder: pull members toward the live centroid of the folder
 * so sparse graphs (few concept_links) still form readable local blobs.
 */
export function createFolderCohereForce() {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const groups = new Map<string, GalaxySimNode[]>();
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      if (!node.primaryLibraryId || !node.primaryFolderKey) continue;
      const key = `${node.primaryLibraryId}::${node.primaryFolderKey}`;
      const list = groups.get(key) ?? [];
      list.push(node);
      groups.set(key, list);
    }

    const strength = alpha * 0.085;
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const m of members) {
        cx += m.x ?? 0;
        cy += m.y ?? 0;
        cz += m.z ?? 0;
      }
      cx /= members.length;
      cy /= members.length;
      cz /= members.length;
      for (const m of members) {
        m.vx = (m.vx ?? 0) + (cx - (m.x ?? 0)) * strength;
        m.vy = (m.vy ?? 0) + (cy - (m.y ?? 0)) * strength;
        m.vz = (m.vz ?? 0) + (cz - (m.z ?? 0)) * strength;
      }
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/**
 * Push concepts out of foreign library hulls so nests stay spatially separate.
 */
export function createForeignLibraryRepelForce(centers: Map<string, LibraryCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const strength = alpha * 0.55;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const home = node.primaryLibraryId;
      if (!home) continue;
      for (const [libId, center] of centers) {
        if (libId === home) continue;
        const dx = (node.x ?? 0) - center.x;
        const dy = (node.y ?? 0) - center.y;
        const dz = (node.z ?? 0) - center.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const keepOut = center.radius * 1.05;
        if (dist >= keepOut) continue;
        const k = ((keepOut - dist) / dist) * strength;
        node.vx = (node.vx ?? 0) + dx * k;
        node.vy = (node.vy ?? 0) + dy * k;
        node.vz = (node.vz ?? 0) + dz * k;
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
