/**
 * Visible organizational spheres for the research galaxy (library / folder / article /
 * company envelopes). Hull markers are pinned graph nodes rendered as wireframe shells —
 * not concept nodes.
 *
 * D-199: library, folder, and article are peer first-class membership objects. Concepts
 * place via tag/semantic springs; each hull is fitted around its members afterward.
 * No nested orbit packing (article-inside-folder-inside-library).
 */

import { computeCompanyEnvelopeBounds, type LibraryCenter3D } from './galaxy-physics';
import { shortLibraryLabel } from './research-library-shelves';

export const NEST_HULL_PREFIX = '__nest_hull:';
export const FOLDER_HULL_PREFIX = '__folder_hull:';
export const ARTICLE_HULL_PREFIX = '__article_hull:';
export const COMPANY_HULL_ID = '__company_hull';
export const TAG_SAT_PREFIX = '__tag_sat:';

export type NestHullKind = 'library' | 'company' | 'topic' | 'folder' | 'article';

export type NestHullNode = {
  id: string;
  __kind: 'nest-hull';
  __hullKind: NestHullKind;
  __libraryId?: string;
  /** Topic uuid when __hullKind === 'article'. */
  __topicId?: string;
  /**
   * Catalog path metadata only (libraryId::folderKey). Not used for nested orbit packing
   * after D-199 — articles are peer envelopes.
   */
  __parentFolderKey?: string | null;
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
  /** Pinned coords — omit/undefined so article stars can orbit folder systems. */
  fx?: number;
  fy?: number;
  fz?: number;
  primaryLibraryId?: null;
};

const HULL_PALETTE = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#c0caf5'];

export function nestHullId(libraryId: string): string {
  return `${NEST_HULL_PREFIX}${libraryId}`;
}

export function isNestHullNode(node: { id?: string | number; __kind?: string }): boolean {
  const id = String(node.id ?? '');
  return (
    node.__kind === 'nest-hull' ||
    id.startsWith(NEST_HULL_PREFIX) ||
    id.startsWith(FOLDER_HULL_PREFIX) ||
    id.startsWith(ARTICLE_HULL_PREFIX) ||
    id === COMPANY_HULL_ID
  );
}

export function isTagSatelliteNode(node: { id?: string | number; __kind?: string }): boolean {
  return node.__kind === 'tag-sat' || String(node.id ?? '').startsWith(TAG_SAT_PREFIX);
}

export function folderHullId(libraryId: string, folderKey: string): string {
  return `${FOLDER_HULL_PREFIX}${libraryId}::${folderKey}`;
}

export function articleHullId(topicId: string): string {
  return `${ARTICLE_HULL_PREFIX}${topicId}`;
}

export function tagSatelliteId(conceptId: string, tag: string): string {
  return `${TAG_SAT_PREFIX}${conceptId}:${tag}`;
}

export function hullColorForIndex(index: number): string {
  return HULL_PALETTE[index % HULL_PALETTE.length] ?? '#7aa2f7';
}

/** Axis-aligned point used when fitting a sphere around live concept positions (D-195). */
export type HullMemberPoint = {
  x?: number;
  y?: number;
  z?: number;
  /** Extra padding for node visual size (collide radius proxy). */
  pad?: number;
};

/**
 * Minimal sphere covering member points (centroid + max reach + pad).
 * Returns null when there are no members — caller keeps prior hull pose.
 */
export function fitSphereAroundPoints(
  points: readonly HullMemberPoint[],
  opts?: { minRadius?: number; pad?: number },
): { x: number; y: number; z: number; radius: number } | null {
  if (points.length === 0) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of points) {
    cx += p.x ?? 0;
    cy += p.y ?? 0;
    cz += p.z ?? 0;
  }
  const n = points.length;
  cx /= n;
  cy /= n;
  cz /= n;

  const basePad = opts?.pad ?? 14;
  const minRadius = opts?.minRadius ?? 28;
  let radius = minRadius;
  for (const p of points) {
    const memberPad = p.pad ?? 0;
    const d =
      Math.hypot((p.x ?? 0) - cx, (p.y ?? 0) - cy, (p.z ?? 0) - cz) + memberPad + basePad;
    if (d > radius) radius = d;
  }
  // Slight outer breath so the wireframe sits outside glyphs.
  radius *= 1.08;
  return { x: cx, y: cy, z: cz, radius };
}

/**
 * Parse `libraryId::folderKey` from a folder hull node id.
 * Returns null when the id is not a folder hull.
 */
export function folderKeyFromHullId(hullId: string): string | null {
  if (!hullId.startsWith(FOLDER_HULL_PREFIX)) return null;
  return hullId.slice(FOLDER_HULL_PREFIX.length);
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

/** Outer company envelope — always present (default sphere when no nests yet). */
export function buildCompanyHullNode(
  centers: Map<string, LibraryCenter3D>,
  _libraryFilter: Set<string> | null,
): NestHullNode {
  // Company envelope uses all library centers so filtering never removes it.
  const envelope = computeCompanyEnvelopeBounds(centers);

  return {
    id: COMPANY_HULL_ID,
    __kind: 'nest-hull',
    __hullKind: 'company',
    __radius: envelope.radius,
    __label: 'Company',
    __color: '#4a5568',
    title: 'Company galaxy',
    tags: [],
    body: '',
    val: 0.01,
    x: envelope.x,
    y: envelope.y,
    z: envelope.z,
    fx: envelope.x,
    fy: envelope.y,
    fz: envelope.z,
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

export type FolderHullInput = {
  libraryId: string;
  folderKey: string;
  label: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Amalgamation mass drives visual emphasis. */
  mass: number;
};

/** Catalog / runtime folder spheres nested inside a library nest (D-077). */
export function buildFolderHullNodes(folders: readonly FolderHullInput[]): NestHullNode[] {
  return folders.map((f, i) => {
    const color = hullColorForIndex(i + 3);
    const label = shortLibraryLabel(f.label, 20);
    return {
      id: folderHullId(f.libraryId, f.folderKey),
      __kind: 'nest-hull' as const,
      __hullKind: 'folder' as const,
      __libraryId: f.libraryId,
      __radius: f.radius,
      __label: label,
      __color: color,
      title: f.label,
      tags: [f.folderKey],
      body: '',
      val: Math.max(0.5, Math.min(8, f.mass * 0.35)),
      x: f.x,
      y: f.y,
      z: f.z,
      fx: f.x,
      fy: f.y,
      fz: f.z,
      primaryLibraryId: null,
    };
  });
}

export type ArticleHullInput = {
  topicId: string;
  title: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  libraryId?: string | null;
  folderKey?: string | null;
  memberCount?: number;
};

/**
 * Article membership envelopes — peer to folder/library hulls (D-199).
 * Pinned; live pose comes from createDerivedMembershipHullForce.
 */
export function buildArticleHullNodes(articles: readonly ArticleHullInput[]): NestHullNode[] {
  return articles.map((a, i) => {
    const color = hullColorForIndex(i + 5);
    const label = shortLibraryLabel(a.title, 18);
    const mass = a.memberCount ?? 1;
    const node: NestHullNode = {
      id: articleHullId(a.topicId),
      __kind: 'nest-hull' as const,
      __hullKind: 'article' as const,
      __topicId: a.topicId,
      __parentFolderKey:
        a.libraryId && a.folderKey ? `${a.libraryId}::${a.folderKey}` : null,
      __radius: a.radius,
      __label: label,
      __color: color,
      title: a.title,
      tags: [],
      body: '',
      val: Math.max(0.8, Math.min(6, mass * 0.45)),
      x: a.x,
      y: a.y,
      z: a.z,
      fx: a.x,
      fy: a.y,
      fz: a.z,
      primaryLibraryId: null,
    };
    if (a.libraryId) node.__libraryId = a.libraryId;
    return node;
  });
}

type DerivedHullSimNode = {
  id?: string | number;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  val?: number;
  __kind?: string;
  __hullKind?: string;
  __radius?: number;
  __libraryId?: string;
  __topicId?: string;
  primaryLibraryId?: string | null;
  primaryFolderKey?: string | null;
  primaryArticleId?: string | null;
};

function pinHull(
  hull: DerivedHullSimNode,
  fit: { x: number; y: number; z: number; radius: number },
): void {
  hull.x = fit.x;
  hull.y = fit.y;
  hull.z = fit.z;
  hull.fx = fit.x;
  hull.fy = fit.y;
  hull.fz = fit.z;
  hull.__radius = fit.radius;
}

/**
 * After tag/semantic forces settle concepts, pin library / folder / article / company
 * hulls to the sphere wrapping their outermost members (D-199). Does not move concepts.
 * Peer envelopes — no nested orbit packing.
 */
export function createDerivedMembershipHullForce() {
  let nodes: DerivedHullSimNode[] = [];

  function force(_alpha: number) {
    const folderMembers = new Map<string, HullMemberPoint[]>();
    const libraryMembers = new Map<string, HullMemberPoint[]>();
    const articleMembers = new Map<string, HullMemberPoint[]>();
    const allConcepts: HullMemberPoint[] = [];
    const folderHulls: DerivedHullSimNode[] = [];
    const libraryHulls: DerivedHullSimNode[] = [];
    const articleHulls: DerivedHullSimNode[] = [];
    let companyHull: DerivedHullSimNode | null = null;

    for (const node of nodes) {
      if (node.__kind === 'nest-hull') {
        if (node.__hullKind === 'folder') folderHulls.push(node);
        else if (node.__hullKind === 'library') libraryHulls.push(node);
        else if (node.__hullKind === 'article') articleHulls.push(node);
        else if (node.__hullKind === 'company') companyHull = node;
        continue;
      }
      if (node.__kind === 'tag-sat') continue;

      const pad = Math.cbrt(node.val ?? 1) * 5.4;
      const point: HullMemberPoint = {
        x: node.x ?? 0,
        y: node.y ?? 0,
        z: node.z ?? 0,
        pad,
      };
      allConcepts.push(point);

      const libId = node.primaryLibraryId;
      if (libId) {
        const list = libraryMembers.get(libId) ?? [];
        list.push(point);
        libraryMembers.set(libId, list);
      }

      const folderKey = node.primaryFolderKey;
      if (libId && folderKey) {
        const key = `${libId}::${folderKey}`;
        const list = folderMembers.get(key) ?? [];
        list.push(point);
        folderMembers.set(key, list);
      }

      const articleId = node.primaryArticleId;
      if (articleId) {
        const list = articleMembers.get(articleId) ?? [];
        list.push(point);
        articleMembers.set(articleId, list);
      }
    }

    for (const hull of articleHulls) {
      const topicId = hull.__topicId;
      if (!topicId) continue;
      const members = articleMembers.get(topicId);
      if (!members || members.length === 0) continue;
      const fit = fitSphereAroundPoints(members, { minRadius: 18, pad: 8 });
      if (!fit) continue;
      pinHull(hull, fit);
    }

    for (const hull of folderHulls) {
      const key = folderKeyFromHullId(String(hull.id ?? ''));
      if (!key) continue;
      const members = folderMembers.get(key);
      if (!members || members.length === 0) continue;
      const fit = fitSphereAroundPoints(members, { minRadius: 24, pad: 10 });
      if (!fit) continue;
      pinHull(hull, fit);
    }

    for (const hull of libraryHulls) {
      const libId = hull.__libraryId;
      if (!libId) continue;
      const members = libraryMembers.get(libId);
      if (!members || members.length === 0) continue;
      const fit = fitSphereAroundPoints(members, { minRadius: 40, pad: 18 });
      if (!fit) continue;
      pinHull(hull, fit);
    }

    if (companyHull && allConcepts.length > 0) {
      const fit = fitSphereAroundPoints(allConcepts, { minRadius: 80, pad: 28 });
      if (fit) pinHull(companyHull, fit);
    }
  }

  force.initialize = (initNodes: DerivedHullSimNode[]) => {
    nodes = initNodes;
  };

  return force;
}

/** @deprecated Prefer createDerivedMembershipHullForce (D-199). */
export function createDerivedFolderHullForce() {
  return createDerivedMembershipHullForce();
}
