/**
 * Visible organizational spheres for the research galaxy (library nests + company envelope).
 * Hull markers are pinned graph nodes rendered as wireframe shells — not concept nodes.
 */

import type { LibraryCenter3D } from './galaxy-physics';
import { shortLibraryLabel } from './research-library-shelves';

export const NEST_HULL_PREFIX = '__nest_hull:';
export const COMPANY_HULL_ID = '__company_hull';

export type NestHullKind = 'library' | 'company' | 'topic';

export type NestHullNode = {
  id: string;
  __kind: 'nest-hull';
  __hullKind: NestHullKind;
  __libraryId?: string;
  __radius: number;
  __label: string;
  __color: string;
  title: string;
  tags: string[];
  body: string;
  val: number;
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  primaryLibraryId?: null;
};

const HULL_PALETTE = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#c0caf5'];

export function nestHullId(libraryId: string): string {
  return `${NEST_HULL_PREFIX}${libraryId}`;
}

export function isNestHullNode(node: { id?: string | number; __kind?: string }): boolean {
  return node.__kind === 'nest-hull' || String(node.id ?? '').startsWith(NEST_HULL_PREFIX);
}

export function hullColorForIndex(index: number): string {
  return HULL_PALETTE[index % HULL_PALETTE.length] ?? '#7aa2f7';
}

export function buildLibraryHullNodes(
  centers: Map<string, LibraryCenter3D>,
  libraryFilter: Set<string> | null,
): NestHullNode[] {
  const nodes: NestHullNode[] = [];
  let i = 0;
  for (const [id, center] of centers) {
    if (libraryFilter && !libraryFilter.has(id)) {
      i += 1;
      continue;
    }
    const color = hullColorForIndex(i);
    i += 1;
    const label = shortLibraryLabel(center.name, 22);
    nodes.push({
      id: nestHullId(id),
      __kind: 'nest-hull',
      __hullKind: 'library',
      __libraryId: id,
      __radius: center.radius,
      __label: label,
      __color: color,
      title: center.name,
      tags: [],
      body: '',
      val: 0.01,
      x: center.x,
      y: center.y,
      z: center.z,
      fx: center.x,
      fy: center.y,
      fz: center.z,
      primaryLibraryId: null,
    });
  }
  return nodes;
}

/** Outer company envelope that loosely bounds all visible library nests. */
export function buildCompanyHullNode(
  centers: Map<string, LibraryCenter3D>,
  libraryFilter: Set<string> | null,
): NestHullNode | null {
  const visible: LibraryCenter3D[] = [];
  for (const [id, center] of centers) {
    if (libraryFilter && !libraryFilter.has(id)) continue;
    visible.push(center);
  }
  if (visible.length === 0) return null;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const c of visible) {
    cx += c.x;
    cy += c.y;
    cz += c.z;
  }
  cx /= visible.length;
  cy /= visible.length;
  cz /= visible.length;

  let radius = 80;
  for (const c of visible) {
    const reach = Math.hypot(c.x - cx, c.y - cy, c.z - cz) + c.radius;
    if (reach > radius) radius = reach;
  }
  radius *= 1.12;

  return {
    id: COMPANY_HULL_ID,
    __kind: 'nest-hull',
    __hullKind: 'company',
    __radius: radius,
    __label: 'Company',
    __color: '#4a5568',
    title: 'Company galaxy',
    tags: [],
    body: '',
    val: 0.01,
    x: cx,
    y: cy,
    z: cz,
    fx: cx,
    fy: cy,
    fz: cz,
    primaryLibraryId: null,
  };
}

/** Soft hull around a topic focus set (centroid + extent of member positions). */
export function buildTopicHullNode(
  members: Array<{ x?: number; y?: number; z?: number }>,
): NestHullNode | null {
  if (members.length < 2) return null;
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

  let radius = 36;
  for (const m of members) {
    const d = Math.hypot((m.x ?? 0) - cx, (m.y ?? 0) - cy, (m.z ?? 0) - cz);
    if (d > radius) radius = d;
  }
  radius = radius * 1.18 + 12;

  return {
    id: '__topic_hull',
    __kind: 'nest-hull',
    __hullKind: 'topic',
    __radius: radius,
    __label: 'Topic focus',
    __color: '#7aa2f7',
    title: 'Topic focus',
    tags: [],
    body: '',
    val: 0.01,
    x: cx,
    y: cy,
    z: cz,
    fx: cx,
    fy: cy,
    fz: cz,
    primaryLibraryId: null,
  };
}
