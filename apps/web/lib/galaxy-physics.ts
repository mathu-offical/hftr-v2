/**
 * Galaxy 3D physics helpers (TD-09 / D-116 / D-136 / D-139 / D-142 / D-145 / D-151 / D-164).
 * Library/folder spheres grow independently from content; packing separates hulls
 * instead of crushing them. Seeded catalog folders are placed by system similarity
 * scores (D-164). Semantic springs still bridge related nests.
 */

import type { ResearchGraphLibraryNest, ResearchGraphLink } from '@hftr/contracts';

import {
  linkDistanceForSimilarity,
  linkStrengthForSimilarity,
  type SimilarityBand,
} from './galaxy-similarity';
import {
  folderSimilarityRestMul,
  folderSimilaritySpringStrength,
  seedFolderSimilarityBand,
} from './galaxy-folder-similarity';

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
  __hullKind?: string;
  __topicId?: string;
  __parentFolderKey?: string | null;
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
 * Push library centers apart until hulls no longer overlap (D-132).
 * Fibonacci shells alone can leave large nests intersecting when radii grow with conceptCount.
 */
export function separateLibraryCenters(
  centers: Map<string, LibraryCenter3D>,
  gapFactor = 1.38,
  passes = 10,
): void {
  const entries = [...centers.entries()];
  if (entries.length < 2) return;

  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]![1];
        const b = entries[j]![1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const minDist = (a.radius + b.radius) * gapFactor;
        if (dist >= minDist) continue;
        const push = (minDist - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        const uz = dz / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        a.z -= uz * push;
        b.x += ux * push;
        b.y += uy * push;
        b.z += uz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/**
 * Place library nests on concentric Fibonacci spheres (not an XY ring / flat spiral).
 * Each library sphere grows independently from its concept count (D-164); separation
 * pushes neighbors apart so growth does not crush siblings into a dense cloud.
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
  // Wide shells — leave room for independent sphere growth (D-164).
  const baseShell = 200 + Math.min(280, n * 52);

  ranked.forEach((id, i) => {
    const meta = libMeta.get(id);
    const conceptCount = meta?.conceptCount ?? 3;
    // Independent radius from content — not capped into a shared dense band.
    const radius = libraryRadiusForConceptCount(conceptCount);
    const tier = Math.min(2, Math.floor((i / n) * 3));
    const shellR = baseShell + tier * 110 + radius * 0.45;
    const unit = fibonacciSpherePoint(i, n);
    const pos = scaleSpherePoint(unit, shellR);
    centers.set(id, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      radius,
      name: meta?.name ?? 'Library',
    });
  });

  // Gap > 1 so growing spheres push neighbors away rather than overlapping.
  separateLibraryCenters(centers, 1.28, 14);
  return centers;
}

/** Content-driven library hull radius (independent of other libraries). */
export function libraryRadiusForConceptCount(conceptCount: number): number {
  const n = Math.max(1, conceptCount);
  return 42 + Math.min(160, Math.sqrt(n) * 14 + n * 1.1);
}

/** Content-driven folder hull radius (independent of sibling folders). */
export function folderRadiusForMembers(mass: number, memberCount: number): number {
  const m = Math.max(1, memberCount);
  const massPart = Math.max(0, mass) * 1.35;
  return 22 + Math.min(90, massPart + Math.sqrt(m) * 8 + m * 1.5);
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
 * Faint library framing only (D-136). Concepts free-float; folders/articles own
 * local structure. Restore is soft and only kicks in far outside the hull so
 * semantic springs can pull nodes across library boundaries.
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

      const hasLocal = Boolean(node.primaryFolderKey || node.primaryArticleId);
      const pull = alpha * (hasLocal ? 0.006 : 0.018);
      const restore = alpha * (hasLocal ? 0.05 : 0.12);

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      // Loose envelope — allow intersection / escape for semantic links.
      const maxR = center.radius * (hasLocal ? 1.55 : 1.35);

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

/** Place folder nests by system similarity scores; each folder grows independently (D-164). */
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

    const sorted = [...libFolders].sort(
      (a, b) => b.mass - a.mass || b.memberCount - a.memberCount || a.folderKey.localeCompare(b.folderKey),
    );
    const count = Math.max(sorted.length, 1);

    type Local = {
      folderKey: string;
      label: string;
      mass: number;
      memberCount: number;
      x: number;
      y: number;
      z: number;
      radius: number;
    };
    const locals: Local[] = sorted.map((folder, i) => {
      const radius = folderRadiusForMembers(folder.mass, folder.memberCount);
      const unit = fibonacciSpherePoint(i, count);
      // Seed on a shell sized from this folder's own radius + siblings — not a tiny parent fraction.
      const shellR = radius * 1.4 + Math.min(80, count * 12);
      const offset = scaleSpherePoint(unit, shellR);
      return {
        folderKey: folder.folderKey,
        label: folder.label,
        mass: folder.mass,
        memberCount: folder.memberCount,
        x: offset.x,
        y: offset.y,
        z: offset.z,
        radius,
      };
    });

    // Similarity springs: high → closer; low → farther (system-seeded catalog scores).
    for (let pass = 0; pass < 16; pass++) {
      for (let i = 0; i < locals.length; i++) {
        for (let j = i + 1; j < locals.length; j++) {
          const a = locals[i]!;
          const b = locals[j]!;
          const band = seedFolderSimilarityBand(a.folderKey, b.folderKey);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dy, dz) || 1e-6;
          const rest = (a.radius + b.radius) * folderSimilarityRestMul(band);
          const strength = folderSimilaritySpringStrength(band);
          const delta = (dist - rest) / dist;
          const k = strength * 0.35 * delta;
          a.x += dx * k;
          a.y += dy * k;
          a.z += dz * k;
          b.x -= dx * k;
          b.y -= dy * k;
          b.z -= dz * k;
        }
      }
      // Hard separation so independent growth never collapses siblings.
      for (let i = 0; i < locals.length; i++) {
        for (let j = i + 1; j < locals.length; j++) {
          const a = locals[i]!;
          const b = locals[j]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dy, dz) || 1e-6;
          const minDist = (a.radius + b.radius) * 1.2;
          if (dist >= minDist) continue;
          const push = (minDist - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          const uz = dz / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          a.z -= uz * push;
          b.x += ux * push;
          b.y += uy * push;
          b.z += uz * push;
        }
      }
    }

    for (const local of locals) {
      const key = `${libraryId}::${local.folderKey}`;
      centers.set(key, {
        x: parent.x + local.x,
        y: parent.y + local.y,
        z: parent.z + local.z,
        radius: local.radius,
        name: local.label,
        folderKey: local.folderKey,
        libraryId,
        mass: local.mass,
      });
    }
  }

  return centers;
}

/**
 * Grow each library sphere to enclose its folders, then re-separate libraries so
 * independent growth does not leave hulls overlapping (D-164). Translates folders
 * with their parent when centers move.
 */
export function refitLibraryPackingAfterFolders(
  libraryCenters: Map<string, LibraryCenter3D>,
  folderCenters: Map<string, FolderCenter3D>,
): void {
  const oldPos = new Map(
    [...libraryCenters.entries()].map(([id, c]) => [id, { x: c.x, y: c.y, z: c.z }] as const),
  );

  for (const [libId, lib] of libraryCenters) {
    let extent = lib.radius;
    for (const folder of folderCenters.values()) {
      if (folder.libraryId !== libId) continue;
      const d =
        Math.hypot(folder.x - lib.x, folder.y - lib.y, folder.z - lib.z) + folder.radius;
      if (d > extent) extent = d;
    }
    // Parent grows from children — not a fixed shared density band.
    lib.radius = Math.max(lib.radius, extent + 24);
  }

  separateLibraryCenters(libraryCenters, 1.28, 14);

  for (const [libId, lib] of libraryCenters) {
    const prev = oldPos.get(libId);
    if (!prev) continue;
    const dx = lib.x - prev.x;
    const dy = lib.y - prev.y;
    const dz = lib.z - prev.z;
    if (dx === 0 && dy === 0 && dz === 0) continue;
    for (const folder of folderCenters.values()) {
      if (folder.libraryId !== libId) continue;
      folder.x += dx;
      folder.y += dy;
      folder.z += dz;
    }
  }
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

/** Mild tangential kick so orbital members ring a hub instead of stacking (D-142). */
function applyOrbitTangential(
  node: GalaxySimNode,
  dx: number,
  dy: number,
  dz: number,
  dist: number,
  strength: number,
): void {
  if (strength <= 0 || dist < 1e-4) return;
  // Prefer XY-plane tangent; fall back when radial is near vertical.
  let tx = -dy;
  let ty = dx;
  let tz = 0;
  let tLen = Math.hypot(tx, ty, tz);
  if (tLen < 1e-4) {
    tx = -dz;
    ty = 0;
    tz = dx;
    tLen = Math.hypot(tx, ty, tz) || 1e-6;
  }
  const phase = hashedRadialBand(String(node.id ?? ''), 0, 1) >= 0.5 ? 1 : -1;
  const k = (strength * phase) / tLen;
  node.vx = (node.vx ?? 0) + tx * k;
  node.vy = (node.vy ?? 0) + ty * k;
  node.vz = (node.vz ?? 0) + tz * k;
}

/**
 * Soft folder *system* orbit (D-136 / D-142): prefer a radial band around the
 * folder center instead of collapsing to the core. When an article hub owns the
 * node, this force stays weak so article orbits dominate. Sparse-link catalogs
 * rely on this band for readable shelf clusters.
 */
export function createFolderNestForce(centers: Map<string, FolderCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const libId = node.primaryLibraryId;
      const folderKey = node.primaryFolderKey;
      if (!libId || !folderKey) continue;
      const center = centers.get(`${libId}::${folderKey}`);
      if (!center) continue;

      const hasArticle = Boolean(node.primaryArticleId);
      const orbitStrength = alpha * (hasArticle ? 0.028 : 0.13);
      const restore = alpha * (hasArticle ? 0.1 : 0.3);
      const spread = alpha * (hasArticle ? 0.008 : 0.035);

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const targetR = center.radius * hashedRadialBand(String(node.id ?? ''), 0.38, 0.9);
      const maxR = center.radius * (hasArticle ? 1.35 : 1.18);

      if (dist > maxR) {
        const k = ((dist - maxR) / dist) * restore;
        node.vx = (node.vx ?? 0) - dx * k;
        node.vy = (node.vy ?? 0) - dy * k;
        node.vz = (node.vz ?? 0) - dz * k;
      } else {
        const delta = (dist - targetR) / dist;
        node.vx = (node.vx ?? 0) - dx * delta * orbitStrength;
        node.vy = (node.vy ?? 0) - dy * delta * orbitStrength;
        node.vz = (node.vz ?? 0) - dz * delta * orbitStrength;
      }

      applyOrbitTangential(node, dx, dy, dz, dist, spread);
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/**
 * Soft library shell fill for concepts without folder/article membership (D-116 P2).
 */
export function createNestShellRadialForce(centers: Map<string, LibraryCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    // Very soft — free-float prefers semantic layout over filling library balls (D-136).
    const strength = alpha * 0.035;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      if (node.primaryFolderKey || node.primaryArticleId) continue;
      const libId = node.primaryLibraryId;
      if (!libId) continue;
      const center = centers.get(libId);
      if (!center) continue;

      const targetR = center.radius * hashedRadialBand(String(node.id ?? ''), 0.3, 0.9);

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
 * Soft system volume fill — radial preference inside a folder (D-136 / D-142).
 * Stronger than library shell because sparse-link catalogs organize by shelf.
 */
export function createFolderShellRadialForce(centers: Map<string, FolderCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const strength = alpha * 0.11;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      if (node.primaryArticleId) continue;
      const libId = node.primaryLibraryId;
      const folderKey = node.primaryFolderKey;
      if (!libId || !folderKey) continue;
      const center = centers.get(`${libId}::${folderKey}`);
      if (!center) continue;

      const targetR = center.radius * hashedRadialBand(String(node.id ?? ''), 0.35, 0.95);

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

    const strength = alpha * 0.045;
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
 * Mild library cohesion — kept weak so free-float / semantic springs win (D-136).
 */
export function createLibraryCohereForce() {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const groups = new Map<string, GalaxySimNode[]>();
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      if (!node.primaryLibraryId) continue;
      const list = groups.get(node.primaryLibraryId) ?? [];
      list.push(node);
      groups.set(node.primaryLibraryId, list);
    }

    const strength = alpha * 0.03;
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
 * Near-off foreign keep-out so semantically related systems can overlap (D-145 / D-151).
 */
export function createForeignLibraryRepelForce(centers: Map<string, LibraryCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const strength = alpha * 0.008;
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
        const keepOut = center.radius * 0.22;
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

/**
 * Gentle drift of library centers toward semantic neighbors (D-151 / D-164).
 * Ideal rest respects independent radii (gap ≥ 1.15) so bridges do not crush packing.
 */
export function createCrossLibraryBridgeForce(
  centers: Map<string, LibraryCenter3D>,
  bridges: ReadonlyArray<{ fromLib: string; toLib: string; weight: number }>,
) {
  const pairStrength = new Map<string, number>();
  for (const bridge of bridges) {
    if (!bridge.fromLib || !bridge.toLib || bridge.fromLib === bridge.toLib) continue;
    const key =
      bridge.fromLib < bridge.toLib
        ? `${bridge.fromLib}::${bridge.toLib}`
        : `${bridge.toLib}::${bridge.fromLib}`;
    pairStrength.set(key, (pairStrength.get(key) ?? 0) + bridge.weight);
  }

  function force(alpha: number) {
    for (const [key, weight] of pairStrength) {
      const [aId, bId] = key.split('::') as [string, string];
      const a = centers.get(aId);
      const b = centers.get(bId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      // Do not pull inside the independent packing gap.
      const ideal = (a.radius + b.radius) * 1.18;
      if (dist <= ideal) continue;
      const pull = Math.min(1.1, 0.12 + weight * 0.06);
      const k = alpha * pull * ((dist - ideal) / dist) * 0.22;
      a.x += dx * k;
      a.y += dy * k;
      a.z += dz * k;
      b.x -= dx * k;
      b.y -= dy * k;
      b.z -= dz * k;
    }
  }

  force.initialize = (_initNodes: GalaxySimNode[]) => {
    /* centers are shared by reference with nest forces */
  };

  return force;
}

/**
 * Hierarchy gently biases springs; semantic similarity can bridge systems (D-145 / D-151).
 * High cross-nest similarity pulls harder than same-library low similarity.
 */
export function hierarchicalLinkScale(opts: {
  sameLibrary: boolean;
  sameFolder: boolean;
  sameArticle: boolean;
  similarityBand?: SimilarityBand;
}): { distanceMul: number; strengthMul: number } {
  const band = opts.similarityBand;
  if (opts.sameArticle) return { distanceMul: 0.78, strengthMul: 1.2 };
  if (opts.sameFolder) return { distanceMul: 0.88, strengthMul: 1.1 };
  if (opts.sameLibrary) {
    if (band === 'high') return { distanceMul: 0.82, strengthMul: 1.18 };
    if (band === 'medium') return { distanceMul: 0.95, strengthMul: 1.05 };
    return { distanceMul: 1, strengthMul: 1 };
  }
  // Cross-library: high/medium similarity physically bridges nests (D-151).
  if (band === 'high') return { distanceMul: 0.55, strengthMul: 1.55 };
  if (band === 'medium') return { distanceMul: 0.78, strengthMul: 1.28 };
  return { distanceMul: 1.05, strengthMul: 0.95 };
}

/** @deprecated Prefer hierarchicalLinkScale — kept for call-site migration. */
export function crossLibraryLinkScale(sameLibrary: boolean): {
  distanceMul: number;
  strengthMul: number;
} {
  return hierarchicalLinkScale({
    sameLibrary,
    sameFolder: false,
    sameArticle: false,
  });
}

/**
 * Soft article orbit (D-136 / D-139): prefer a radial band around the article
 * center; mild outer restore only. Prefers live `nest-hull` article star
 * positions when present so concepts follow hubs that orbit folder systems.
 */
export function createArticleOrbitForce(centers: Map<string, ArticleOrbitCenter3D>) {
  let nodes: GalaxySimNode[] = [];
  let hullByTopic = new Map<string, GalaxySimNode>();

  function force(alpha: number) {
    const orbitStrength = alpha * 0.12;
    const restore = alpha * 0.24;
    const spread = alpha * 0.03;
    for (const node of nodes) {
      if (node.__kind === 'nest-hull' || node.__kind === 'tag-sat') continue;
      const articleId = node.primaryArticleId;
      if (!articleId) continue;
      const seed = centers.get(articleId);
      if (!seed) continue;
      const live = hullByTopic.get(articleId);
      const cx = live?.x ?? seed.x;
      const cy = live?.y ?? seed.y;
      const cz = live?.z ?? seed.z;
      const radius = seed.radius;

      const dx = (node.x ?? 0) - cx;
      const dy = (node.y ?? 0) - cy;
      const dz = (node.z ?? 0) - cz;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const targetR = radius * hashedRadialBand(String(node.id ?? ''), 0.4, 0.95);
      const maxR = radius * 1.45;

      if (dist > maxR) {
        const k = ((dist - maxR) / dist) * restore;
        node.vx = (node.vx ?? 0) - dx * k;
        node.vy = (node.vy ?? 0) - dy * k;
        node.vz = (node.vz ?? 0) - dz * k;
      } else {
        const delta = (dist - targetR) / dist;
        node.vx = (node.vx ?? 0) - dx * delta * orbitStrength;
        node.vy = (node.vy ?? 0) - dy * delta * orbitStrength;
        node.vz = (node.vz ?? 0) - dz * delta * orbitStrength;
      }
      applyOrbitTangential(node, dx, dy, dz, dist, spread);
    }
  }

  force.initialize = (initNodes: GalaxySimNode[]) => {
    nodes = initNodes;
    hullByTopic = new Map();
    for (const n of initNodes) {
      if (n?.__kind === 'nest-hull' && n.__hullKind === 'article' && n.__topicId) {
        hullByTopic.set(n.__topicId, n);
      }
    }
  };

  return force;
}

/**
 * Article stars soft-orbit their parent folder/shelf system (D-139).
 * Folder centers stay soft attractors; articles remain free hubs that concepts follow.
 */
export function createArticleHullOrbitForce(folderCenters: Map<string, FolderCenter3D>) {
  let nodes: GalaxySimNode[] = [];

  function force(alpha: number) {
    const orbitStrength = alpha * 0.14;
    const restore = alpha * 0.26;
    const spread = alpha * 0.04;
    for (const node of nodes) {
      if (node.__kind !== 'nest-hull' || node.__hullKind !== 'article') continue;
      const systemKey = node.__parentFolderKey;
      if (!systemKey) continue;
      const center = folderCenters.get(systemKey);
      if (!center) continue;

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const targetR = center.radius * hashedRadialBand(String(node.id ?? ''), 0.35, 0.78);
      const maxR = center.radius * 1.12;

      if (dist > maxR) {
        const k = ((dist - maxR) / dist) * restore;
        node.vx = (node.vx ?? 0) - dx * k;
        node.vy = (node.vy ?? 0) - dy * k;
        node.vz = (node.vz ?? 0) - dz * k;
      } else {
        const delta = (dist - targetR) / dist;
        node.vx = (node.vx ?? 0) - dx * delta * orbitStrength;
        node.vy = (node.vy ?? 0) - dy * delta * orbitStrength;
        node.vz = (node.vz ?? 0) - dz * delta * orbitStrength;
      }
      applyOrbitTangential(node, dx, dy, dz, dist, spread);
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

    const restDistance = 22;
    const strength = 0.14;

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
    // Prefer qualitative similarity so related concepts pull across nests (D-145).
    distance: 0.4 * weightDistance + 0.6 * similarityDistance,
    strength: Math.max(weightStrength * 0.9, similarityStrength),
  };
}
