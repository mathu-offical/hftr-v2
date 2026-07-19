import { z } from 'zod';
import type { LinkKind, ModuleType } from './modules';
import {
  ENGINE_CHIP_ZONE,
  ENGINE_PROCESS_ZONE_COLUMN,
  isEngineProcessZoneMember,
  MODULE_COLUMN,
  MODULE_LANE_ROW,
} from './modules';
import { isMathToolAttachment } from './engines';
import {
  engineCreateSection,
  getEngineTemplateById,
  researchDependenciesForExecutionEngine,
} from './templates';

/**
 * Connection-safe canvas layout constants and pure reflow helpers (D-033 / D-064 / D-159).
 * Engine chip zones (2026-07-18): research → data → trend → execution → verification;
 * funds shelf + clock bus below. Unused process lanes compress.
 * Top-level (D-159): research left → Data Hub gap → execution right; families stack vertically.
 * Ordinary drag stays freeform; Reflow buttons call these deterministically.
 */

export const CANVAS_LAYOUT = {
  moduleWidth: 220,
  /** D-088: denser cards — floor matches compact ModuleNode chrome (~160–180). */
  moduleHeight: 168,
  /** Port/edge clearance between adjacent pipeline columns. */
  horizontalGutter: 152,
  /** Clearance between stacked owner/tool envelopes in the same rank. */
  verticalGutter: 104,
  mathAttachmentGap: 12,
  mathToolWidth: 180,
  mathToolHeight: 40,
  /** Gap above the funds shelf (below process/Math envelopes). */
  engineFundsShelfGap: 48,
  /** Gap above the engine Time hub rail (below member/Math/funds envelopes). */
  engineTimeHubGap: 40,
  topLevelGutter: 120,
  /** Gap between research deps column and execution (hub sits in this band). */
  researchToExecGap: 280,
  /**
   * Compact Data Hub footprint used for gap placement (hubs are free library
   * nodes, not full member cards).
   */
  dataHubWidth: 160,
  dataHubHeight: 96,
  /**
   * Vertical fraction of execution chrome where the `data_in` utility handle sits
   * (matches EngineGroupNode inbound bus stack start).
   */
  engineDataInHandleTopFrac: 0.18,
  /**
   * Horizontal bias in the research→exec gap: 0 = flush to research, 1 = flush
   * to execution. Prefer the execution side so the hub→data_in edge is short.
   */
  dataHubGapBiasTowardExec: 0.72,
  originX: 40,
  originY: 40,
} as const;

/** Owner card + dedicated Math dock under it (D-033 envelope). */
export function layoutOwnerEnvelopeHeight(moduleHeight = CANVAS_LAYOUT.moduleHeight): number {
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
  /** Template id for research vs execution sectioning (D-159). Optional for single-engine reflow. */
  templateId?: string;
  /** Engine Data Hub module id owned by this execution engine (D-140 / D-159). */
  dataHubModuleId?: string | null;
}

export interface LayoutResult {
  modules: Array<{ id: string; canvasPosition: { x: number; y: number } }>;
  engines: Array<{
    id: string;
    canvasBounds: { x: number; y: number; width: number; height: number };
  }>;
}

type RankedMember = { id: string; type: ModuleType; rank: number; order: number };

/** Map used MODULE_COLUMN lanes to consecutive ranks (compress unused lanes). */
function compressModuleLanes(lanes: Iterable<number>): Map<number, number> {
  const sorted = [...new Set(lanes)].sort((a, b) => a - b);
  const compressed = new Map<number, number>();
  sorted.forEach((lane, index) => compressed.set(lane, index));
  return compressed;
}

function templateSyntheticModuleId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

/**
 * Stable topological order from member→member links (Math excluded).
 * Cycles and unreachable nodes sort after the DAG frontier in id order.
 */
function computeMemberTopoOrder(
  members: readonly LayoutModule[],
  links: readonly LayoutLink[],
): Map<string, number> {
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

  const order = new Map<string, number>();
  const queue = members
    .filter((m) => (indegree.get(m.id) ?? 0) === 0)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => m.id);

  let nextOrder = 0;
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++]!;
    order.set(id, nextOrder++);
    for (const next of outbound.get(id) ?? []) {
      const nextDeg = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, nextDeg);
      if (nextDeg === 0) queue.push(next);
    }
  }

  const leftovers = members
    .filter((m) => !order.has(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const m of leftovers) {
    order.set(m.id, nextOrder++);
  }
  return order;
}

/**
 * Chip-zone pipeline ranks from ENGINE_PROCESS_ZONE_COLUMN (compressed).
 * Within a lane: MODULE_LANE_ROW, then topo order, then id; barycenter sweeps refine rows.
 * Funds + clock + math are excluded (vertical bands / docks).
 */
export function rankEngineMembers(
  memberIds: readonly string[],
  modulesById: ReadonlyMap<string, LayoutModule>,
  links: readonly LayoutLink[],
): RankedMember[] {
  const members = memberIds
    .map((id) => modulesById.get(id))
    .filter((m): m is LayoutModule => !!m && isEngineProcessZoneMember(m.type));

  if (members.length === 0) return [];

  const processColumn = (type: ModuleType): number => {
    const zone = ENGINE_CHIP_ZONE[type];
    if (zone === 'funds' || zone === 'clock') return 0;
    return ENGINE_PROCESS_ZONE_COLUMN[zone];
  };

  const laneById = new Map(members.map((m) => [m.id, processColumn(m.type)]));
  const laneCompress = compressModuleLanes(laneById.values());
  const rank = new Map(
    members.map((m) => [m.id, laneCompress.get(processColumn(m.type)) ?? 0]),
  );

  const topoOrder = computeMemberTopoOrder(members, links);
  const memberSet = new Set(members.map((m) => m.id));

  const byRank = new Map<number, LayoutModule[]>();
  for (const m of members) {
    const r = rank.get(m.id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(m);
    byRank.set(r, list);
  }

  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);

  const compareWithinLane = (a: LayoutModule, b: LayoutModule): number => {
    const rowDiff = MODULE_LANE_ROW[a.type] - MODULE_LANE_ROW[b.type];
    if (rowDiff !== 0) return rowDiff;
    const topoDiff = (topoOrder.get(a.id) ?? 0) - (topoOrder.get(b.id) ?? 0);
    if (topoDiff !== 0) return topoDiff;
    return a.id.localeCompare(b.id);
  };

  // Undirected neighbor map for connection-aware ordering (both link directions).
  const neighbors = new Map<string, string[]>();
  for (const m of members) neighbors.set(m.id, []);
  for (const link of links) {
    if (!memberSet.has(link.fromModuleId) || !memberSet.has(link.toModuleId)) continue;
    if (link.fromModuleId === link.toModuleId) continue;
    neighbors.get(link.fromModuleId)!.push(link.toModuleId);
    neighbors.get(link.toModuleId)!.push(link.fromModuleId);
  }

  const orderIndex = new Map<string, number>();
  for (const r of rankKeys) {
    const list = (byRank.get(r) ?? []).sort(compareWithinLane);
    list.forEach((m, index) => orderIndex.set(m.id, index));
    byRank.set(r, list);
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
        key: median ?? Number.POSITIVE_INFINITY,
        tie: orderIndex.get(m.id) ?? 0,
      };
    });
    keyed.sort((a, b) => {
      if (a.key !== b.key) return a.key - b.key;
      if (a.tie !== b.tie) return a.tie - b.tie;
      return compareWithinLane(a.m, b.m);
    });
    keyed.forEach((entry, index) => orderIndex.set(entry.m.id, index));
    byRank.set(
      r,
      keyed.map((entry) => entry.m),
    );
  };

  for (let sweep = 0; sweep < 4; sweep += 1) {
    for (let i = 1; i < rankKeys.length; i += 1) {
      reorderRank(rankKeys[i]!, rankKeys[i - 1]!);
    }
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
 * Bottom-left dock for an engine Time hub under the laid-out member envelope.
 * Absolute canvas coordinates (same space as member positions).
 */
export function placeEngineTimeHubPosition(
  memberPositions: readonly {
    x: number;
    y: number;
    width?: number;
    height?: number;
  }[],
): { x: number; y: number } {
  if (memberPositions.length === 0) {
    return { x: 0, y: 0 };
  }
  let minX = Infinity;
  let maxBottom = -Infinity;
  for (const pos of memberPositions) {
    const height = pos.height ?? CANVAS_LAYOUT.moduleHeight;
    minX = Math.min(minX, pos.x);
    maxBottom = Math.max(maxBottom, pos.y + height);
  }
  return {
    x: minX,
    y: maxBottom + CANVAS_LAYOUT.engineTimeHubGap,
  };
}

/** Y for the funds shelf under the process/Math envelope (absolute). */
export function placeEngineFundsShelfY(
  processPositions: readonly {
    x: number;
    y: number;
    width?: number;
    height?: number;
  }[],
): number {
  if (processPositions.length === 0) return 0;
  let maxBottom = -Infinity;
  for (const pos of processPositions) {
    const height = pos.height ?? CANVAS_LAYOUT.moduleHeight;
    maxBottom = Math.max(maxBottom, pos.y + height);
  }
  return maxBottom + CANVAS_LAYOUT.engineFundsShelfGap;
}

/**
 * Place engine members in chip zones with connection-safe gutters.
 * Returns absolute positions and group bounds. Origin is the desired group top-left.
 * Process: research → data → trend → execution → verification.
 * Funds shelf under process; Time hubs pin bottom-left under the full envelope.
 */
export function layoutEngineGroup(
  _engineId: string,
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

  // Funds shelf: holding → router under the process/Math envelope (not mid-lane).
  const processBoxes = [...positions.entries()].map(([id, pos]) => {
    const mod = modulesById.get(id);
    const isMath = mod?.type === 'math';
    return {
      id,
      x: pos.x,
      y: pos.y,
      width: isMath
        ? CANVAS_LAYOUT.mathToolWidth
        : Math.max(mod?.width ?? CANVAS_LAYOUT.moduleWidth, CANVAS_LAYOUT.moduleWidth),
      height: isMath
        ? CANVAS_LAYOUT.mathToolHeight
        : Math.max(mod?.height ?? CANVAS_LAYOUT.moduleHeight, CANVAS_LAYOUT.moduleHeight),
    };
  });
  const fundsMembers = memberIds
    .map((id) => modulesById.get(id))
    .filter((m): m is LayoutModule => !!m && ENGINE_CHIP_ZONE[m.type] === 'funds')
    .sort((a, b) => {
      const rowDiff = MODULE_LANE_ROW[a.type] - MODULE_LANE_ROW[b.type];
      if (rowDiff !== 0) return rowDiff;
      return a.id.localeCompare(b.id);
    });
  if (fundsMembers.length > 0) {
    const shelfY =
      processBoxes.length > 0
        ? placeEngineFundsShelfY(processBoxes)
        : origin.y + padding.top;
    const minProcessX =
      processBoxes.length > 0
        ? Math.min(...processBoxes.map((b) => b.x))
        : origin.x + padding.left;
    const execMember = ranked.find((r) => ENGINE_CHIP_ZONE[r.type] === 'execution');
    const execX = execMember ? positions.get(execMember.id)?.x : undefined;
    const holdings = fundsMembers.filter((m) => m.type === 'holding_fund');
    const routers = fundsMembers.filter((m) => m.type === 'fund_router');
    const otherFunds = fundsMembers.filter(
      (m) => m.type !== 'holding_fund' && m.type !== 'fund_router',
    );
    holdings.forEach((m, index) => {
      positions.set(m.id, {
        x: minProcessX + index * LAYOUT_COLUMN_STEP,
        y: shelfY,
      });
    });
    const routerBaseX =
      execX ??
      (holdings.length > 0
        ? minProcessX + holdings.length * LAYOUT_COLUMN_STEP
        : minProcessX + LAYOUT_COLUMN_STEP);
    routers.forEach((m, index) => {
      positions.set(m.id, {
        x: routerBaseX + index * LAYOUT_COLUMN_STEP,
        y: shelfY,
      });
    });
    otherFunds.forEach((m, index) => {
      positions.set(m.id, {
        x: minProcessX + (holdings.length + routers.length + index) * LAYOUT_COLUMN_STEP,
        y: shelfY,
      });
    });
  }

  // D-091: pin engine Time hub(s) to bottom-left under the full member envelope.
  const envelopeBoxes = [...positions.entries()].map(([id, pos]) => {
    const mod = modulesById.get(id);
    const isMath = mod?.type === 'math';
    return {
      x: pos.x,
      y: pos.y,
      width: isMath
        ? CANVAS_LAYOUT.mathToolWidth
        : Math.max(mod?.width ?? CANVAS_LAYOUT.moduleWidth, CANVAS_LAYOUT.moduleWidth),
      height: isMath
        ? CANVAS_LAYOUT.mathToolHeight
        : Math.max(mod?.height ?? CANVAS_LAYOUT.moduleHeight, CANVAS_LAYOUT.moduleHeight),
    };
  });
  const timeHubPos =
    envelopeBoxes.length > 0
      ? placeEngineTimeHubPosition(envelopeBoxes)
      : {
          x: origin.x + padding.left,
          y: origin.y + padding.top,
        };
  const timeMembers = memberIds
    .map((id) => modulesById.get(id))
    .filter((m): m is LayoutModule => !!m && m.type === 'time')
    .sort((a, b) => a.id.localeCompare(b.id));
  timeMembers.forEach((timeMod, index) => {
    positions.set(timeMod.id, {
      x: timeHubPos.x,
      y: timeHubPos.y + index * (CANVAS_LAYOUT.moduleHeight + CANVAS_LAYOUT.mathAttachmentGap),
    });
  });

  // Include dedicated Math docks + funds + Time rail so group chrome covers the full envelope.
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

type EngineFamily = {
  execution: LayoutEngine;
  researchDeps: LayoutEngine[];
};

/**
 * Group execution engines with their research dependency packs (D-159).
 * Orphan research engines are returned separately for the left column.
 */
export function buildCanvasEngineFamilies(
  engines: readonly LayoutEngine[],
): { families: EngineFamily[]; orphans: LayoutEngine[] } {
  const byTemplate = new Map<string, LayoutEngine[]>();
  for (const engine of engines) {
    const tid = engine.templateId ?? '';
    if (!tid) continue;
    const list = byTemplate.get(tid) ?? [];
    list.push(engine);
    byTemplate.set(tid, list);
  }

  const claimed = new Set<string>();
  const families: EngineFamily[] = [];

  for (const engine of engines) {
    const tid = engine.templateId ?? '';
    const template = tid ? getEngineTemplateById(tid) : undefined;
    if (!template || engineCreateSection(template) !== 'execution') continue;
    if (claimed.has(engine.id)) continue;

    const depIds = researchDependenciesForExecutionEngine(tid);
    const researchDeps: LayoutEngine[] = [];
    for (const depId of depIds) {
      const candidates = byTemplate.get(depId) ?? [];
      for (const dep of candidates) {
        if (claimed.has(dep.id)) continue;
        researchDeps.push(dep);
        claimed.add(dep.id);
        break;
      }
    }
    claimed.add(engine.id);
    families.push({ execution: engine, researchDeps });
  }

  const orphans = engines.filter((engine) => !claimed.has(engine.id));
  return { families, orphans };
}

/**
 * Place a Data Hub in the research→exec corridor (D-159 / D-168).
 * - X: biased toward the execution left edge (short motherboard edge to data_in)
 * - Y: centered on the execution `data_in` handle (~18% from chrome top),
 *   clamped into the family vertical corridor when research deps exist
 */
export function placeDataHubOrigin(
  researchBounds: readonly LayoutRect[],
  executionBounds: LayoutRect,
  hubSize: { width: number; height: number } = {
    width: CANVAS_LAYOUT.dataHubWidth,
    height: CANVAS_LAYOUT.dataHubHeight,
  },
): { x: number; y: number } {
  const researchRight =
    researchBounds.length > 0
      ? Math.max(...researchBounds.map((r) => r.x + r.width))
      : CANVAS_LAYOUT.originX;
  const gapLeft = researchRight + CANVAS_LAYOUT.topLevelGutter / 2;
  const gapRight = executionBounds.x - CANVAS_LAYOUT.topLevelGutter / 2;
  const gapWidth = gapRight - gapLeft;
  const bias = CANVAS_LAYOUT.dataHubGapBiasTowardExec;

  let x: number;
  if (gapWidth > hubSize.width) {
    x = gapLeft + (gapWidth - hubSize.width) * bias;
  } else {
    // Tight gap: park immediately left of execution with a small clearance.
    x = Math.max(researchRight + 16, executionBounds.x - hubSize.width - 24);
  }

  const handleY =
    executionBounds.y + executionBounds.height * CANVAS_LAYOUT.engineDataInHandleTopFrac;
  let y = handleY - hubSize.height / 2;

  if (researchBounds.length > 0) {
    const familyTop = Math.min(executionBounds.y, ...researchBounds.map((r) => r.y));
    const familyBottom = Math.max(
      executionBounds.y + executionBounds.height,
      ...researchBounds.map((r) => r.y + r.height),
    );
    const maxY = Math.max(familyTop, familyBottom - hubSize.height);
    y = Math.min(Math.max(y, familyTop), maxY);
  } else {
    y = Math.max(executionBounds.y, y);
  }

  return { x, y };
}

/** Reflow every engine into vertical families (research left, hub gap, exec right). */
export function layoutCanvas(
  engines: readonly LayoutEngine[],
  modules: readonly LayoutModule[],
  links: readonly LayoutLink[],
  padding: { left: number; right: number; top: number; bottom: number },
): LayoutResult {
  const modulesById = new Map(modules.map((m) => [m.id, m]));
  const resultModules = new Map<string, { x: number; y: number }>();
  const resultEngines: LayoutResult['engines'] = [];
  const hubModuleIds = new Set(
    engines.map((e) => e.dataHubModuleId).filter((id): id is string => typeof id === 'string'),
  );

  const { families, orphans } = buildCanvasEngineFamilies(engines);
  let cursorY = CANVAS_LAYOUT.originY as number;
  let maxFamilyRight = CANVAS_LAYOUT.originX as number;
  /** Shared execution column so stacked exec engines align even when some lack research deps. */
  let sharedExecColumnX: number | null = null;

  const placeEngineAt = (engine: LayoutEngine, origin: { x: number; y: number }) => {
    const laid = layoutEngineGroup(
      engine.id,
      engine.memberModuleIds,
      modulesById,
      links,
      origin,
      padding,
    );
    for (const m of laid.modules) {
      resultModules.set(m.id, m.canvasPosition);
    }
    resultEngines.push({ id: engine.id, canvasBounds: laid.canvasBounds });
    return laid.canvasBounds;
  };

  // Orphan research engines: left column, stacked above/alongside families.
  let orphanCursorY = cursorY;
  const orphanBounds: LayoutRect[] = [];
  for (const orphan of orphans) {
    const bounds = placeEngineAt(orphan, { x: CANVAS_LAYOUT.originX, y: orphanCursorY });
    orphanBounds.push(bounds);
    orphanCursorY = bounds.y + bounds.height + CANVAS_LAYOUT.topLevelGutter;
    maxFamilyRight = Math.max(maxFamilyRight, bounds.x + bounds.width);
  }
  if (orphanBounds.length > 0) {
    cursorY = Math.max(cursorY, orphanCursorY);
  }

  for (const family of families) {
    const familyTop = cursorY;
    let depCursorY: number = familyTop;
    let depsRight: number = CANVAS_LAYOUT.originX;
    const depBounds: LayoutRect[] = [];

    for (const dep of family.researchDeps) {
      const bounds = placeEngineAt(dep, { x: CANVAS_LAYOUT.originX, y: depCursorY });
      depBounds.push(bounds);
      depsRight = Math.max(depsRight, bounds.x + bounds.width);
      depCursorY = bounds.y + bounds.height + CANVAS_LAYOUT.topLevelGutter;
    }

    const defaultExecX = CANVAS_LAYOUT.originX + CANVAS_LAYOUT.researchToExecGap;
    let execOriginX: number;
    if (family.researchDeps.length > 0) {
      execOriginX = depsRight + CANVAS_LAYOUT.researchToExecGap;
      sharedExecColumnX = execOriginX;
    } else {
      execOriginX = sharedExecColumnX ?? defaultExecX;
      if (sharedExecColumnX == null) sharedExecColumnX = execOriginX;
    }
    const execBounds = placeEngineAt(family.execution, { x: execOriginX, y: familyTop });

    const hubId = family.execution.dataHubModuleId;
    if (hubId && modulesById.has(hubId)) {
      const hubOrigin = placeDataHubOrigin(depBounds, execBounds);
      resultModules.set(hubId, hubOrigin);
    }

    const familyBottom = Math.max(
      depCursorY - CANVAS_LAYOUT.topLevelGutter,
      execBounds.y + execBounds.height,
      ...depBounds.map((b) => b.y + b.height),
    );
    cursorY = familyBottom + CANVAS_LAYOUT.topLevelGutter;
    maxFamilyRight = Math.max(maxFamilyRight, execBounds.x + execBounds.width);
  }

  const memberIds = new Set(engines.flatMap((e) => e.memberModuleIds));
  const freeOriginX = maxFamilyRight + CANVAS_LAYOUT.topLevelGutter;
  const freeOriginY = CANVAS_LAYOUT.originY;

  // Time processors (non-engine) also reserved for cadence rail — exclude from free lanes.
  // Data hubs are placed in the family gap above — exclude from free lanes.
  const free = modules
    .filter(
      (m) =>
        m.type !== 'math' &&
        m.type !== 'clock' &&
        m.type !== 'time' &&
        !memberIds.has(m.id) &&
        !hubModuleIds.has(m.id) &&
        !resultModules.has(m.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  const freeByLane = new Map<number, LayoutModule[]>();
  for (const m of free) {
    const lane = MODULE_COLUMN[m.type];
    const list = freeByLane.get(lane) ?? [];
    list.push(m);
    freeByLane.set(lane, list);
  }

  const compareFreeWithinLane = (a: LayoutModule, b: LayoutModule): number => {
    const rowDiff = MODULE_LANE_ROW[a.type] - MODULE_LANE_ROW[b.type];
    if (rowDiff !== 0) return rowDiff;
    return a.id.localeCompare(b.id);
  };

  const freeLaneCompress = compressModuleLanes(freeByLane.keys());
  const freeLaneKeys = [...freeByLane.keys()].sort((a, b) => a - b);
  for (const lane of freeLaneKeys) {
    const compressedRank = freeLaneCompress.get(lane) ?? 0;
    const list = (freeByLane.get(lane) ?? []).sort(compareFreeWithinLane);
    list.forEach((m, rowIndex) => {
      resultModules.set(m.id, {
        x: freeOriginX + compressedRank * LAYOUT_COLUMN_STEP,
        y: freeOriginY + rowIndex * LAYOUT_ROW_STEP,
      });
    });
  }

  // Unattached Math left after free column.
  const placedIds = new Set(resultModules.keys());
  const leftoverMath = modules
    .filter((m) => m.type === 'math' && !placedIds.has(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  let mathY = freeOriginY;
  for (const m of leftoverMath) {
    resultModules.set(m.id, {
      x: freeOriginX + LAYOUT_COLUMN_STEP,
      y: mathY,
    });
    mathY += CANVAS_LAYOUT.mathToolHeight + CANVAS_LAYOUT.verticalGutter;
  }

  // D-091: Master Clock pins to a bottom company cadence rail under all engines.
  let cadenceY: number = CANVAS_LAYOUT.originY;
  for (const pos of resultModules.values()) {
    cadenceY = Math.max(cadenceY, pos.y + CANVAS_LAYOUT.moduleHeight);
  }
  for (const eng of resultEngines) {
    cadenceY = Math.max(cadenceY, eng.canvasBounds.y + eng.canvasBounds.height);
  }
  cadenceY += CANVAS_LAYOUT.topLevelGutter;
  const clocks = modules
    .filter((m) => m.type === 'clock')
    .sort((a, b) => a.id.localeCompare(b.id));
  clocks.forEach((m, index) => {
    resultModules.set(m.id, {
      x: CANVAS_LAYOUT.originX + index * (CANVAS_LAYOUT.moduleWidth + CANVAS_LAYOUT.horizontalGutter),
      y: cadenceY,
    });
  });
  // Time processors dock on the cadence rail to the right of Clock (hub pattern).
  const times = modules
    .filter((m) => m.type === 'time' && !memberIds.has(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  times.forEach((m, index) => {
    resultModules.set(m.id, {
      x:
        CANVAS_LAYOUT.originX +
        (clocks.length + index) * (CANVAS_LAYOUT.moduleWidth + CANVAS_LAYOUT.horizontalGutter),
      y: cadenceY,
    });
  });

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
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Next top-left origin for an engine envelope that does not overlap occupied
 * rects (D-159). Prefer preferred when clear; research sits left of familyAnchor;
 * execution stacks below prior envelopes before packing right.
 */
export function placeNextEngineOrigin(
  occupied: readonly LayoutRect[],
  size: { width: number; height: number },
  options?: {
    gutter?: number;
    originX?: number;
    originY?: number;
    preferred?: { x: number; y: number };
    /** D-159: research packs left; execution stacks vertically. */
    section?: 'research' | 'execution';
    /** Anchor envelope for family placement (exec for research, or research stack for exec). */
    familyAnchor?: LayoutRect;
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

  const candidates: Array<{ x: number; y: number }> = [];

  if (options?.section === 'research' && options.familyAnchor) {
    candidates.push({
      x: originX,
      y: options.familyAnchor.y,
    });
    candidates.push({
      x: originX,
      y: options.familyAnchor.y + options.familyAnchor.height + gutter,
    });
  }

  if (options?.section === 'execution') {
    if (options.familyAnchor) {
      candidates.push({
        x: options.familyAnchor.x + options.familyAnchor.width + CANVAS_LAYOUT.researchToExecGap,
        y: options.familyAnchor.y,
      });
    }
    const maxBottom = Math.max(...occupied.map((rect) => rect.y + rect.height));
    candidates.push({ x: originX + CANVAS_LAYOUT.researchToExecGap, y: maxBottom + gutter });
    for (const rect of occupied) {
      candidates.push({ x: rect.x, y: rect.y + rect.height + gutter });
    }
  }

  candidates.push({ x: originX, y: originY });
  const ordered = [...occupied].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const rect of ordered) {
    candidates.push({ x: rect.x, y: rect.y + rect.height + gutter });
  }
  for (const rect of ordered) {
    candidates.push({ x: rect.x + rect.width + gutter, y: rect.y });
  }

  for (const candidate of candidates) {
    if (fits(candidate)) return candidate;
  }

  const maxBottom = Math.max(...occupied.map((rect) => rect.y + rect.height));
  return { x: originX, y: maxBottom + gutter };
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

export interface TemplateLayoutModule {
  type: ModuleType;
}

export interface TemplateLayoutLink {
  fromIndex: number | 'math';
  toIndex: number | 'math';
  linkKind: LinkKind;
}

/**
 * Lay out an engine template graph at `origin` using synthetic module ids.
 * Skips `math` link endpoints (company Math is provisioned separately).
 */
export function layoutEngineTemplateAtOrigin(
  modules: readonly TemplateLayoutModule[],
  links: readonly TemplateLayoutLink[],
  origin: { x: number; y: number },
  padding: { left: number; right: number; top: number; bottom: number },
): {
  modulePositions: Array<{ x: number; y: number }>;
  canvasBounds: { x: number; y: number; width: number; height: number };
} {
  const layoutModules: LayoutModule[] = modules.map((module, index) => ({
    id: templateSyntheticModuleId(index),
    type: module.type,
    engineInstanceId: '00000000-0000-4000-8000-00000000e000',
    toolOwnerModuleId: null,
    position: { x: 0, y: 0 },
  }));

  const modulesById = new Map(layoutModules.map((m) => [m.id, m]));
  const layoutLinks: LayoutLink[] = [];
  for (const link of links) {
    if (link.fromIndex === 'math' || link.toIndex === 'math') continue;
    layoutLinks.push({
      fromModuleId: templateSyntheticModuleId(link.fromIndex),
      toModuleId: templateSyntheticModuleId(link.toIndex),
      linkKind: link.linkKind,
    });
  }

  const laid = layoutEngineGroup(
    '00000000-0000-4000-8000-00000000e000',
    layoutModules.map((m) => m.id),
    modulesById,
    layoutLinks,
    origin,
    padding,
  );

  const positionById = new Map(laid.modules.map((m) => [m.id, m.canvasPosition]));
  return {
    modulePositions: modules.map((_, index) => {
      const pos = positionById.get(templateSyntheticModuleId(index));
      return pos ?? { x: origin.x + padding.left, y: origin.y + padding.top };
    }),
    canvasBounds: laid.canvasBounds,
  };
}
