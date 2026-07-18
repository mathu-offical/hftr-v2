/**
 * Galaxy 3D physics helpers (TD-09).
 * Tuned for neural-style force-directed layouts: spring links by qualitative
 * weight band, many-body charge, collision, and soft library-nest attractors.
 */

import type { ResearchGraphLibraryNest, ResearchGraphLink } from '@hftr/contracts';

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
  if (nodeCount > 400) return -45;
  if (nodeCount > 200) return -70;
  if (nodeCount > 80) return -95;
  return -120;
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
    const pull = alpha * 0.04;
    const restore = alpha * 0.45;
    for (const node of nodes) {
      const libId = node.primaryLibraryId;
      if (!libId) continue;
      const center = centers.get(libId);
      if (!center) continue;

      const dx = (node.x ?? 0) - center.x;
      const dy = (node.y ?? 0) - center.y;
      const dz = (node.z ?? 0) - center.z;
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const maxR = center.radius * 0.88;

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
