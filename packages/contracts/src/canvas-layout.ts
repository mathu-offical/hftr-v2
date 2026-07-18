import { z } from 'zod';
import type { LinkKind, ModuleType } from './modules';
import { isMathToolAttachment } from './engines';

/**
 * Connection-safe canvas layout constants and pure reflow helpers (D-033).
 * Ordinary drag stays freeform; Reflow buttons call these deterministically.
 */

export const CANVAS_LAYOUT = {
  moduleWidth: 220,
  moduleHeight: 240,
  horizontalGutter: 120,
  /** Clearance between owner/tool envelopes in the same rank. */
  verticalGutter: 100,
  mathAttachmentGap: 16,
  mathToolWidth: 180,
  mathToolHeight: 40,
  topLevelGutter: 140,
  originX: 40,
  originY: 40,
} as const;

/** Owner card + dedicated Math dock under it (D-033 envelope). */
export function layoutOwnerEnvelopeHeight(
  moduleHeight = CANVAS_LAYOUT.moduleHeight,
): number {
  return moduleHeight + CANVAS_LAYOUT.mathAttachmentGap + CANVAS_LAYOUT.mathToolHeight;
}

/** Horizontal step between pipeline ranks (card body + port gutter). */
export const LAYOUT_COLUMN_STEP = CANVAS_LAYOUT.moduleWidth + CANVAS_LAYOUT.horizontalGutter;

/** Vertical step between stacked owner envelopes in the same rank. */
export const LAYOUT_ROW_STEP = layoutOwnerEnvelopeHeight() + CANVAS_LAYOUT.verticalGutter;

export const BatchCanvasLayoutInput = z.object({
  modules: z
    .array(
      z.object({
        id: z.string().uuid(),
        canvasPosition: z.object({ x: z.number(), y: z.number() }),
      }),
    )
    .max(200),
  engines: z
    .array(
      z.object({
        id: z.string().uuid(),
        canvasBounds: z.object({
          x: z.number(),
          y: z.number(),
          width: z.number().positive(),
          height: z.number().positive(),
        }),
      }),
    )
    .max(50)
    .default([]),
});
export type BatchCanvasLayoutInput = z.infer<typeof BatchCanvasLayoutInput>;

export interface LayoutModule {
  id: string;
  type: ModuleType;
  engineInstanceId: string | null;
  /** Explicit dedicated Math ownership (D-033); set only on Math modules. */
  toolOwnerModuleId: string | null;
  /** Absolute canvas position (engine children use absolute coords for layout). */
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

export interface LayoutLink {
  fromModuleId: string;
  toModuleId: string;
  linkKind: LinkKind;
}

export interface LayoutEngine {
  id: string;
  memberModuleIds: string[];
}

export interface LayoutResult {
  modules: Array<{ id: string; canvasPosition: { x: number; y: number } }>;
  engines: Array<{
    id: string;
    canvasBounds: { x: number; y: number; width: number; height: number };
  }>;
}

type RankedMember = { id: string; type: ModuleType; rank: number; order: number };

/**
 * Stable pipeline ranks from member→member links (Math excluded from ranking).
 * Cycles fall back to insertion order among remaining nodes.
 */
export function rankEngineMembers(
  memberIds: readonly string[],
  modulesById: ReadonlyMap<string, LayoutModule>,
  links: readonly LayoutLink[],
): RankedMember[] {
  const members = memberIds
    .map((id) => modulesById.get(id))
    .filter((m): m is LayoutModule => !!m && m.type !== 'math');

  const memberSet = new Set(members.map((m) => m.id));
  const indegree = new Map<string, number>();
  const outbound = new Map<string, string[]>();
  for (const m of members) {
    indegree.set(m.id, 0);
    outbound.set(m.id, []);
  }

  for (const link of links) {
    if (!memberSet.has(link.fromModuleId) || !memberSet.has(link.toModuleId)) continue;
    if (link.fromModuleId === link.toModuleId) continue;
    outbound.get(link.fromModuleId)!.push(link.toModuleId);
    indegree.set(link.toModuleId, (indegree.get(link.toModuleId) ?? 0) + 1);
  }

  const rank = new Map<string, number>();
  const queue = members
    .filter((m) => (indegree.get(m.id) ?? 0) === 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => m.id);

  for (const id of queue) rank.set(id, 0);

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    const r = rank.get(id) ?? 0;
    for (const next of outbound.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, r + 1));
      const nextDeg = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }

  // Cycle / unreachable leftovers: append after max known rank in id order.
  const maxRank = [...rank.values()].reduce((a, b) => Math.max(a, b), 0);
  const leftovers = members.filter((m) => !rank.has(m.id)).sort((a, b) => a.id.localeCompare(b.id));
  leftovers.forEach((m, index) => {
    rank.set(m.id, maxRank + 1 + Math.floor(index / 2));
  });

  const byRank = new Map<number, LayoutModule[]>();
  for (const m of members) {
    const r = rank.get(m.id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(m);
    byRank.set(r, list);
  }

  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);

  // Undirected neighbor map for connection-aware ordering (both link directions).
  const neighbors = new Map<string, string[]>();
  for (const m of members) neighbors.set(m.id, []);
  for (const link of links) {
    if (!memberSet.has(link.fromModuleId) || !memberSet.has(link.toModuleId)) continue;
    if (link.fromModuleId === link.toModuleId) continue;
    neighbors.get(link.fromModuleId)!.push(link.toModuleId);
    neighbors.get(link.toModuleId)!.push(link.fromModuleId);
  }

  // Seed each rank's order by id for determinism, then refine with median
  // (barycenter) sweeps so connected nodes settle into adjacent rows.
  const orderIndex = new Map<string, number>();
  for (const r of rankKeys) {
    const list = (byRank.get(r) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    list.forEach((m, index) => orderIndex.set(m.id, index));
  }

  const medianOfNeighbors = (id: string, otherRank: number): number | null => {
    const positions = (neighbors.get(id) ?? [])
      .filter((n) => (rank.get(n) ?? -1) === otherRank)
      .map((n) => orderIndex.get(n) ?? 0)
      .sort((a, b) => a - b);
    if (positions.length === 0) return null;
    const mid = Math.floor(positions.length / 2);
    return positions.length % 2 === 1
      ? positions[mid]!
      : (positions[mid - 1]! + positions[mid]!) / 2;
  };

  const reorderRank = (r: number, referenceRank: number) => {
    const list = byRank.get(r) ?? [];
    const keyed = list.map((m) => {
      const median = medianOfNeighbors(m.id, referenceRank);
      return {
        m,
        // Unconnected nodes sort after connected peers so barycenter clustering
        // is not interrupted by id-stable placeholders in the middle of the rank.
        key: median ?? Number.POSITIVE_INFINITY,
        tie: orderIndex.get(m.id) ?? 0,
      };
    });
    keyed.sort((a, b) => {
      if (a.key !== b.key) return a.key - b.key;
      if (a.tie !== b.tie) return a.tie - b.tie;
      return a.m.id.localeCompare(b.m.id);
    });
    keyed.forEach((entry, index) => orderIndex.set(entry.m.id, index));
    byRank.set(
      r,
      keyed.map((entry) => entry.m),
    );
  };

  for (let sweep = 0; sweep < 4; sweep += 1) {
    // Forward: order each rank by the median of its predecessors.
    for (let i = 1; i < rankKeys.length; i += 1) {
      reorderRank(rankKeys[i]!, rankKeys[i - 1]!);
    }
    // Backward: order each rank by the median of its successors.
    for (let i = rankKeys.length - 2; i >= 0; i -= 1) {
      reorderRank(rankKeys[i]!, rankKeys[i + 1]!);
    }
  }

  const ranked: RankedMember[] = [];
  for (const r of rankKeys) {
    (byRank.get(r) ?? []).forEach((m, order) => {
      ranked.push({ id: m.id, type: m.type, rank: r, order });
    });
  }
  return ranked;
}

export function computePaddedBounds(
  positions: readonly { x: number; y: number }[],
  padding: { left: number; right: number; top: number; bottom: number },
  nodeWidth = CANVAS_LAYOUT.moduleWidth,
  nodeHeight = CANVAS_LAYOUT.moduleHeight,
): { x: number; y: number; width: number; height: number } {
  if (positions.length === 0) {
    return {
      x: 0,
      y: 0,
      width: padding.left + padding.right + nodeWidth,
      height: padding.top + padding.bottom + nodeHeight,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pos of positions) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + nodeWidth);
    maxY = Math.max(maxY, pos.y + nodeHeight);
  }
  return {
    x: minX - padding.left,
    y: minY - padding.top,
    width: maxX - minX + padding.left + padding.right,
    height: maxY - minY + padding.top + padding.bottom,
  };
}

/**
 * Place engine members in rank columns with connection-safe gutters.
 * Returns absolute positions and group bounds. Origin is the desired group top-left.
 */
export function layoutEngineGroup(
  engineId: string,
  memberIds: readonly string[],
  modulesById: ReadonlyMap<string, LayoutModule>,
  links: readonly LayoutLink[],
  origin: { x: number; y: number },
  padding: { left: number; right: number; top: number; bottom: number },
): {
  modules: Array<{ id: string; canvasPosition: { x: number; y: number } }>;
  canvasBounds: { x: number; y: number; width: number; height: number };
} {
  const ranked = rankEngineMembers(memberIds, modulesById, links);
  const positions = new Map<string, { x: number; y: number }>();

  for (const item of ranked) {
    positions.set(item.id, {
      x: origin.x + padding.left + item.rank * LAYOUT_COLUMN_STEP,
      y: origin.y + padding.top + item.order * LAYOUT_ROW_STEP,
    });
  }

  // Dock dedicated Math tools under their explicit owner. Legacy unowned Math
  // may still use link inference until an operator provisions ownership.
  const consumers = new Set(ranked.map((r) => r.id));
  const mathModules = [...modulesById.values()].filter((m) => m.type === 'math');
  for (const math of mathModules) {
    const explicitOwnerId =
      math.toolOwnerModuleId && consumers.has(math.toolOwnerModuleId)
        ? math.toolOwnerModuleId
        : null;
    const attachments = explicitOwnerId
      ? []
      : links.filter(
          (link) =>
            link.fromModuleId === math.id &&
            consumers.has(link.toModuleId) &&
            isMathToolAttachment('math', modulesById.get(link.toModuleId)!.type, link.linkKind),
        );
    const ownerId =
      explicitOwnerId ?? attachments.map((attachment) => attachment.toModuleId).sort()[0];
    if (!ownerId) continue;
    const ownerPos = positions.get(ownerId);
    if (!ownerPos) continue;
    const owner = modulesById.get(ownerId);
    const ownerWidth = Math.max(
      owner?.width ?? CANVAS_LAYOUT.moduleWidth,
      CANVAS_LAYOUT.moduleWidth,
    );
    const ownerHeight = Math.max(
      owner?.height ?? CANVAS_LAYOUT.moduleHeight,
      CANVAS_LAYOUT.moduleHeight,
    );
    positions.set(math.id, {
      x: ownerPos.x + (ownerWidth - CANVAS_LAYOUT.mathToolWidth) / 2,
      y: ownerPos.y + ownerHeight + CANVAS_LAYOUT.mathAttachmentGap,
    });
  }

  // Include dedicated Math docks so group chrome covers the full owner/tool envelope.
  const allLayoutPositions = [...positions.values()];
  const bounds = computePaddedBounds(allLayoutPositions, padding);

  // Keep requested origin as the group chrome origin when possible.
  const dx = origin.x - bounds.x;
  const dy = origin.y - bounds.y;
  if (dx !== 0 || dy !== 0) {
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.x + dx, y: pos.y + dy });
    }
  }

  const shiftedPositions = [...positions.values()];
  const canvasBounds = computePaddedBounds(shiftedPositions, padding);

  return {
    modules: [...positions.entries()].map(([id, canvasPosition]) => ({ id, canvasPosition })),
    canvasBounds: { ...canvasBounds, x: origin.x, y: origin.y },
  };
}

/** Reflow every engine, then line up top-level engines and free modules. */
export function layoutCanvas(
  engines: readonly LayoutEngine[],
  modules: readonly LayoutModule[],
  links: readonly LayoutLink[],
  padding: { left: number; right: number; top: number; bottom: number },
): LayoutResult {
  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const resultModules = new Map<string, { x: number; y: number }>();
  const resultEngines: LayoutResult['engines'] = [];

  let cursorX = CANVAS_LAYOUT.originX;
  const originY = CANVAS_LAYOUT.originY;

  for (const engine of engines) {
    const laid = layoutEngineGroup(
      engine.id,
      engine.memberModuleIds,
      modulesById,
      links,
      { x: cursorX, y: originY },
      padding,
    );
    for (const m of laid.modules) {
      resultModules.set(m.id, m.canvasPosition);
    }
    resultEngines.push({ id: engine.id, canvasBounds: laid.canvasBounds });
    cursorX += laid.canvasBounds.width + CANVAS_LAYOUT.topLevelGutter;
  }

  const memberIds = new Set(engines.flatMap((e) => e.memberModuleIds));
  const free = modules
    .filter((m) => m.type !== 'math' && !memberIds.has(m.id) && !resultModules.has(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  let freeY = originY;
  for (const m of free) {
    resultModules.set(m.id, { x: cursorX, y: freeY });
    freeY += LAYOUT_ROW_STEP;
  }

  // Unattached Math left after free column.
  const placedIds = new Set(resultModules.keys());
  const leftoverMath = modules
    .filter((m) => m.type === 'math' && !placedIds.has(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  let mathY = originY;
  for (const m of leftoverMath) {
    resultModules.set(m.id, {
      x: cursorX + LAYOUT_COLUMN_STEP,
      y: mathY,
    });
    mathY += CANVAS_LAYOUT.mathToolHeight + CANVAS_LAYOUT.verticalGutter;
  }

  return {
    modules: [...resultModules.entries()].map(([id, canvasPosition]) => ({
      id,
      canvasPosition,
    })),
    engines: resultEngines,
  };
}

/** Single-engine reflow preserving the group's current top-left origin. */
export function reflowEngineAtOrigin(
  engine: LayoutEngine,
  modules: readonly LayoutModule[],
  links: readonly LayoutLink[],
  origin: { x: number; y: number },
  padding: { left: number; right: number; top: number; bottom: number },
): LayoutResult {
  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const laid = layoutEngineGroup(
    engine.id,
    engine.memberModuleIds,
    modulesById,
    links,
    origin,
    padding,
  );
  return {
    modules: laid.modules,
    engines: [{ id: engine.id, canvasBounds: laid.canvasBounds }],
  };
}

/** Axis-aligned canvas rectangle (engine chrome or free module envelope). */
export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function inflateRect(rect: LayoutRect, gutter: number): LayoutRect {
  if (gutter === 0) return rect;
  return {
    x: rect.x - gutter,
    y: rect.y - gutter,
    width: rect.width + gutter * 2,
    height: rect.height + gutter * 2,
  };
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Next top-left origin for an engine envelope that does not overlap occupied
 * rects. Prefers the caller's preferred origin, then left-to-right packing
 * (canvas default), then below existing engines.
 */
export function placeNextEngineOrigin(
  occupied: readonly LayoutRect[],
  size: { width: number; height: number },
  options?: {
    gutter?: number;
    originX?: number;
    originY?: number;
    preferred?: { x: number; y: number };
  },
): { x: number; y: number } {
  const gutter = options?.gutter ?? CANVAS_LAYOUT.topLevelGutter;
  const originX = options?.originX ?? CANVAS_LAYOUT.originX;
  const originY = options?.originY ?? CANVAS_LAYOUT.originY;
  const pad = gutter / 2;

  const fits = (origin: { x: number; y: number }): boolean => {
    const candidate = inflateRect(
      { x: origin.x, y: origin.y, width: size.width, height: size.height },
      pad,
    );
    return !occupied.some((rect) => rectsOverlap(candidate, inflateRect(rect, pad)));
  };

  if (options?.preferred && fits(options.preferred)) {
    return options.preferred;
  }
  if (occupied.length === 0) {
    return { x: originX, y: originY };
  }

  const ordered = [...occupied].sort((a, b) => a.x - b.x || a.y - b.y);
  const candidates: Array<{ x: number; y: number }> = [
    { x: originX, y: originY },
    ...ordered.map((rect) => ({ x: rect.x + rect.width + gutter, y: originY })),
    ...ordered.map((rect) => ({ x: rect.x, y: rect.y + rect.height + gutter })),
  ];
  for (const candidate of candidates) {
    if (fits(candidate)) return candidate;
  }

  const maxRight = Math.max(...occupied.map((rect) => rect.x + rect.width));
  return { x: maxRight + gutter, y: originY };
}

/**
 * Canvas offset for template module positions so the padded group envelope
 * lands at `origin` (top-left of engine chrome).
 */
export function engineCanvasOffsetForOrigin(
  templatePositions: readonly { x: number; y: number }[],
  origin: { x: number; y: number },
  padding: { left: number; right: number; top: number; bottom: number },
  nodeWidth = CANVAS_LAYOUT.moduleWidth,
  nodeHeight = CANVAS_LAYOUT.moduleHeight,
): { offset: { x: number; y: number }; bounds: LayoutRect } {
  const relative = computePaddedBounds(templatePositions, padding, nodeWidth, nodeHeight);
  return {
    offset: {
      x: origin.x - relative.x,
      y: origin.y - relative.y,
    },
    bounds: {
      x: origin.x,
      y: origin.y,
      width: relative.width,
      height: relative.height,
    },
  };
}

/** Translate a layout result so the named engine's chrome moves to `origin`. */
export function translateLayoutResultToOrigin(
  layout: LayoutResult,
  engineId: string,
  origin: { x: number; y: number },
): LayoutResult {
  const engine = layout.engines.find((item) => item.id === engineId);
  if (!engine) return layout;
  const dx = origin.x - engine.canvasBounds.x;
  const dy = origin.y - engine.canvasBounds.y;
  if (dx === 0 && dy === 0) return layout;
  return {
    modules: layout.modules.map((module) => ({
      id: module.id,
      canvasPosition: {
        x: module.canvasPosition.x + dx,
        y: module.canvasPosition.y + dy,
      },
    })),
    engines: layout.engines.map((item) =>
      item.id === engineId
        ? {
            id: item.id,
            canvasBounds: {
              ...item.canvasBounds,
              x: origin.x,
              y: origin.y,
            },
          }
        : item,
    ),
  };
}
