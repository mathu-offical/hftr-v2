/**
 * Visible organizational spheres for the research galaxy (library nests + company envelope).
 * Hull markers are pinned graph nodes rendered as wireframe shells — not concept nodes.
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
   * Parent system key for article stars (`libraryId::folderKey`), matching
   * `folderCenters` map keys — so articles soft-orbit shelf/folder space (D-139).
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
 * Article stars — seeded inside folder/shelf space, not pinned, so they can
 * soft-orbit the parent system (D-139). Concepts orbit these live hubs.
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
      // No fx/fy/fz — free to orbit folder system centers.
      primaryLibraryId: null,
    };
    if (a.libraryId) node.__libraryId = a.libraryId;
    return node;
  });
}
