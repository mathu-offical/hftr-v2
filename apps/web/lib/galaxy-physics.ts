/**
 * Galaxy 3D physics helpers (TD-09 / D-116).
 * Tuned for neural-style force-directed layouts: spring links by qualitative
 * weight band, many-body charge, collision, and soft library-nest attractors.
 * Nest centers use Fibonacci-sphere packing so the layout fills volume
 * (not a flat XY pancake / planar spiral).
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

/** Golden-angle step for Fibonacci / phyllotaxis packing. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Even unit-sphere sample via Fibonacci lattice (phyllotaxis).
 * Index `i` in `0..n-1` — standard for filling 3D volume without polar banding.
 * @see González, “Measurement of areas on a sphere…” / spherical Fibonacci point sets.
 */
export function fibonacciSpherePoint(
  i: number,
  n: number,
): { x: number; y: number; z: number } {
  const count = Math.max(n, 1);
  const t = count === 1 ? 0.5 : i / (count - 1);
  const y = 1 - t * 2; // 1 → -1
  const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * GOLDEN_ANGLE;
  return {
    x: Math.cos(theta) * radiusAtY,
    y,
    z: Math.sin(theta) * radiusAtY,
  };
}

/** Scale a unit sphere point onto a shell of radius `shellR`. */
export function scaleSpherePoint(
  unit: { x: number; y: number; z: number },
  shellR: number,
): { x: number; y: number; z: number } {
  return {
    x: unit.x * shellR,
    y: unit.y * shellR,
    z: unit.z * shellR,
  };
}

/** Spring rest length from qualitative weight band (no raw floats in model path). */
export function linkDistanceForWeight(
  weightBand: ResearchGraphLink['weightBand'],
  relation: ResearchGraphLink['relation'],
): number {
  // Slightly longer springs so connected orbits breathe into volume (D-116).
  let base = 62;
  switch (weightBand) {
    case 'strong':
      base = 38;
      break;
    case 'typical':
      base = 62;
      break;
    case 'weak':
      base = 96;
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
  if (nodeCount > 400) return -32;
  if (nodeCount > 200) return -48;
  if (nodeCount > 80) return -64;
  return -80;
}

/**
 * Place library nests on concentric Fibonacci spheres (not an XY ring / flat spiral).
 * Larger libraries sit on a slightly outer shell with larger hull radii so the company
 * cloud uses full 3D volume (D-116).
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
  const n = Math.max(ranked.length, 1);
  // Base shell large enough that nest hulls occupy distinct 3D volume (D-116 refine).
  const baseShell = 220 + Math.min(280, n * 36);

  ranked.forEach((id, i) => {
    const meta = libMeta.get(id);
    const conceptCount = meta?.conceptCount ?? 3;
    const sizeBoost = Math.min(160, conceptCount * 3.6);
    // Size tiers → concentric shells (inner = denser/larger libs, outer = sparse).
    const tier = Math.min(2, Math.floor((i / n) * 3));
    const shellR = baseShell + tier * 130 + sizeBoost * 0.55;
    const unit = fibonacciSpherePoint(i, n);
    const pos = scaleSpherePoint(unit, shellR);
    centers.set(id, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      radius: 48 + Math.min(150, conceptCount * 3.6 + sizeBoost * 0.45),
      name: meta?.name ?? 'Library',
    });
  });

  return centers;
}

/**
 * Stable signature of nest packing so UI can clear stale d3 seed positions when
 * Fibonacci shells move (D-116 P1b).
 */
export function nestPackingSignature(centers: Map<string, LibraryCenter3D>): string {
  const parts: string[] = [];
  for (const [id, c] of [...centers.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    parts.push(
      `${id}:${Math.round(c.x)}:${Math.round(c.y)}:${Math.round(c.z)}:${Math.round(c.radius)}`,
    );
  }
  return parts.join('|');
}

/** Company envelope centroid + radius (matches `buildCompanyHullNode` sizing). */
export function computeCompanyEnvelopeBounds(centers: Map<string, LibraryCenter3D>): {
  x: number;
  y: number;
  z: number;
  radius: number;
} {
  const all = [...centers.values()];
  if (all.length === 0) {
    return { x: 0, y: 0, z: 0, radius: 120 };
  }
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const c of all) {
    cx += c.x;
    cy += c.y;
    cz += c.z;
  }
  cx /= all.length;
  cy /= all.length;
  cz /= all.length;

  let radius = 80;
  for (const c of all) {
    const reach = Math.hypot(c.x - cx, c.y - cy, c.z - cz) + c.radius;
    if (reach > radius) radius = reach;
  }
  return { x: cx, y: cy, z: cz, radius: radius * 1.22 };
}

/**
 * Deterministic orbit pose so the Fibonacci shell + company envelope fill the
 * viewport without landing the camera inside a nest (D-116 camera refine).
 * Elevation ~22°, azimuth ~38° from +Z — volume reads immediately on first paint.
 */
export function computeVolumeCameraPose(centers: Map<string, LibraryCenter3D>): {
  position: { x: number; y: number; z: number };
  lookAt: { x: number; y: number; z: number };
  envelopeRadius: number;
} {
  const envelope = computeCompanyEnvelopeBounds(centers);
  const dist = Math.max(280, envelope.radius * 2.55);
  const elev = (22 * Math.PI) / 180;
  const azim = (38 * Math.PI) / 180;
  const cosE = Math.cos(elev);
  return {
    lookAt: { x: envelope.x, y: envelope.y, z: envelope.z },
    position: {
      x: envelope.x + dist * cosE * Math.sin(azim),
      y: envelope.y + dist * Math.sin(elev),
      z: envelope.z + dist * cosE * Math.cos(azim),
    },
    envelopeRadius: envelope.radius,
  };
}

/** Deterministic 3D jitter so nodes do not start coincident — isotropic volume seed. */
export function hashSpread3D(id: string): { dx: number; dy: number; dz: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const a = ((h % 360) * Math.PI) / 180;
  const b = ((((h >> 8) % 180) - 90) * Math.PI) / 180;
  const r = 28 + (Math.abs(h) % 56);
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

/** Place folder nests on a Fibonacci sphere inside each parent library hull. */
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

    const sorted = [...libFolders].sort((a, b) => b.mass - a.mass || b.memberCount - a.memberCount);
    const count = Math.max(sorted.length, 1);
    // Inner sphere (~55% of parent) so folders fill volume under the library shell.
    const shellR = parent.radius * 0.55;

    sorted.forEach((folder, i) => {
      const unit = fibonacciSpherePoint(i, count);
      const offset = scaleSpherePoint(unit, shellR * (0.55 + (i / count) * 0.45));
      const key = `${libraryId}::${folder.folderKey}`;
      centers.set(key, {
        x: parent.x + offset.x,
        y: parent.y + offset.y,
        z: parent.z + offset.z,
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

/** Place article orbit centers on a Fibonacci sphere inside folder (or library) parents. */
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

    const ranked = [...group].sort(
      (a, b) => b.memberCount - a.memberCount || a.topicId.localeCompare(b.topicId),
    );
    const count = Math.max(ranked.length, 1);
    const shellR = parentRadius * 0.42;

    ranked.forEach((article, i) => {
      const unit = fibonacciSpherePoint(i, count);
      const offset = scaleSpherePoint(unit, shellR);
      centers.set(article.topicId, {
        x: parentX + offset.x,
        y: parentY + offset.y,
        z: parentZ + offset.z,
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
 * Soft radial shell force inside each library nest (forceRadial analogue per nest).
 * Pushes concepts toward a hashed target radius so members fill the ball volume
 * instead of collapsing to the nest core / midplane (D-116 P2).
 */
function hashedRadialBand(id: string, minBand: number, maxBand: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const t = (Math.abs(h) % 100) / 100;
  return minBand + t * (maxBand - minBand);
}

export function createNestShellRadialForce(centers: Map<string, LibraryCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const strength = alpha * 0.12;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      // Folder/article attractors own local structure when present.
      if (node.primaryFolderKey || node.primaryArticleId) continue;
      const libId = node.primaryLibraryId;
      if (!libId) continue;
      const center = centers.get(libId);
      if (!center) continue;

      const targetR = center.radius * hashedRadialBand(String(node.id ?? ''), 0.22, 0.72);

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const delta = (dist - targetR) / dist;
      node.vx = (node.vx ?? 0) - dx * delta * strength;
      node.vy = (node.vy ?? 0) - dy * delta * strength;
      node.vz = (node.vz ?? 0) - dz * delta * strength;
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/**
 * Soft radial shell inside each folder nest so folder members fill the folder ball
 * instead of collapsing to the folder core (D-116 folder volume refine).
 */
export function createFolderShellRadialForce(centers: Map<string, FolderCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const strength = alpha * 0.14;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      // Article orbits own local structure when present.
      if (node.primaryArticleId) continue;
      const libId = node.primaryLibraryId;
      const folderKey = node.primaryFolderKey;
      if (!libId || !folderKey) continue;
      const center = centers.get(`${libId}::${folderKey}`);
      if (!center) continue;

      const targetR = center.radius * hashedRadialBand(String(node.id ?? ''), 0.28, 0.78);

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const delta = (dist - targetR) / dist;
      node.vx = (node.vx ?? 0) - dx * delta * strength;
      node.vy = (node.vy ?? 0) - dy * delta * strength;
      node.vz = (node.vz ?? 0) - dz * delta * strength;
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
