import type { Edge } from '@xyflow/react';
import {
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
  CANVAS_LAYOUT,
  ENGINE_GROUP_PADDING,
  handleIdForStream,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import type { OptionAnchorFlowNode } from './OptionAnchorNode';
import {
  OPTION_ANCHOR_HANDLE_IN,
  OPTION_ANCHOR_HANDLE_OUT,
} from './OptionAnchorNode';
import type { CanvasEngineGroup, CanvasModule } from './types';

export const OPTION_ANCHOR_NODE_WIDTH = 140;
export const OPTION_ANCHOR_NODE_HEIGHT = 48;
export const OPTION_ANCHOR_GAP = 8;
/** Matches CANVAS_LAYOUT / ENGINE_GROUP_PADDING.right reserve (D-176). */
export const OPTION_ANCHOR_COLUMN_WIDTH = CANVAS_LAYOUT.optionAnchorColumnWidth;
/** Gap between owner module card and its docked option-anchor stack (D-180). */
export const OPTION_ANCHOR_OWNER_GAP = 16;

/** Prefer process-decision roots at the owner card Y; secondary roots stack below. */
const ROOT_KIND_PRIORITY: Record<string, number> = {
  research_subtype: 0,
  librarian_subtype: 0,
  library_class: 0,
  strategy_family: 0,
  trend_posture: 0,
  emit_mode: 0,
  template_input: 2,
  philosophy_axis: 3,
};

function rootKindPriority(kind: string): number {
  return ROOT_KIND_PRIORITY[kind] ?? 1;
}

export function anchorsForEngine(
  engine: Pick<CanvasEngineGroup, 'id' | 'templateId'>,
  modules: readonly CanvasModule[],
): OptionAnchorSpec[] {
  const members = modules
    .filter((module) => module.engineInstanceId === engine.id)
    .map((module) => ({
      id: module.id,
      type: module.type,
      ...(module.config ? { config: module.config as Record<string, unknown> } : {}),
    }));
  return buildOptionAnchorsForEngine({
    engineId: engine.id,
    templateId: engine.templateId,
    members,
  });
}

function positionsMap(
  engine: CanvasEngineGroup,
): Record<string, OptionAnchorPosition> {
  return engine.setupSnapshot?.optionAnchorPositions ?? {};
}

/**
 * Parent-relative member positions inside the engine group.
 * Prefer RF node positions when provided (already relative); otherwise subtract bounds.
 */
export function relativeMemberPositions(
  engine: CanvasEngineGroup,
  modules: readonly CanvasModule[],
  relativeFromNodes?: ReadonlyMap<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const bounds = engine.canvasBounds;
  const map = new Map<string, { x: number; y: number }>();
  for (const module of modules) {
    if (module.engineInstanceId !== engine.id) continue;
    const fromNode = relativeFromNodes?.get(module.id);
    if (fromNode) {
      map.set(module.id, fromNode);
      continue;
    }
    if (!bounds) {
      // Without bounds, treat stored position as already parent-relative (buildInitialGraph path).
      map.set(module.id, module.position);
      continue;
    }
    map.set(module.id, {
      x: module.position.x - bounds.x,
      y: module.position.y - bounds.y,
    });
  }
  return map;
}

/** Right-column X for unowned / overflow anchors, centered in ENGINE_GROUP_PADDING.right. */
export function optionAnchorColumnX(groupWidth: number): number {
  return (
    groupWidth -
    ENGINE_GROUP_PADDING.right +
    Math.floor((ENGINE_GROUP_PADDING.right - OPTION_ANCHOR_COLUMN_WIDTH) / 2)
  );
}

function pushAnchorNode(
  nodes: OptionAnchorFlowNode[],
  engine: CanvasEngineGroup,
  anchor: OptionAnchorSpec,
  x: number,
  y: number,
  position: OptionAnchorPosition,
): void {
  nodes.push({
    id: anchor.id,
    type: 'optionAnchor',
    parentId: engine.id,
    expandParent: false,
    draggable: false,
    selectable: true,
    position: { x, y },
    zIndex: 2,
    data: {
      id: anchor.id,
      kind: anchor.kind,
      catalogRef: anchor.catalogRef,
      label: anchor.label,
      ...(anchor.layer ? { layer: anchor.layer } : {}),
      parentAnchorId: anchor.parentAnchorId ?? null,
      ownerModuleId: anchor.ownerModuleId ?? null,
      ownerEngineId: anchor.ownerEngineId,
      position,
      parentId: engine.id,
    },
  });
}

/**
 * Place canvas-visible anchors by process function:
 * - Owned roots dock right of their owner module (clamped into group)
 * - Children stack indented under parent anchor
 * - Owners sorted by (y,x); trees do not vertically overlap
 * - Unowned roots + orphans stack in the engine right column
 */
export function placeOptionAnchorNodes(
  engine: CanvasEngineGroup,
  groupWidth: number,
  allAnchors: readonly OptionAnchorSpec[],
  modules: readonly CanvasModule[],
  relativeFromNodes?: ReadonlyMap<string, { x: number; y: number }>,
): OptionAnchorFlowNode[] {
  const visible = canvasVisibleOptionAnchors(allAnchors);
  if (visible.length === 0) return [];

  const byParent = new Map<string | null, OptionAnchorSpec[]>();
  for (const anchor of visible) {
    const parentKey = anchor.parentAnchorId ?? null;
    const list = byParent.get(parentKey) ?? [];
    list.push(anchor);
    byParent.set(parentKey, list);
  }

  const positions = positionsMap(engine);
  const memberPos = relativeMemberPositions(engine, modules, relativeFromNodes);
  const nodes: OptionAnchorFlowNode[] = [];
  const placed = new Set<string>();

  const columnX = optionAnchorColumnX(groupWidth);
  const maxDockX =
    groupWidth - ENGINE_GROUP_PADDING.right - OPTION_ANCHOR_NODE_WIDTH;
  let columnY: number = ENGINE_GROUP_PADDING.top;
  let ownerRowCursor: number = ENGINE_GROUP_PADDING.top;

  const placeTree = (
    parentId: string,
    depth: number,
    baseX: number,
    startY: number,
  ): number => {
    let cursorY = startY;
    const children = byParent.get(parentId) ?? [];
    for (const anchor of children) {
      if (placed.has(anchor.id)) continue;
      placed.add(anchor.id);
      const x = baseX + Math.min(depth, 2) * 10;
      const position = positions[anchor.id] ?? anchor.defaultPosition ?? 'typical';
      pushAnchorNode(nodes, engine, anchor, x, cursorY, position);
      cursorY += OPTION_ANCHOR_NODE_HEIGHT + OPTION_ANCHOR_GAP;
      cursorY = placeTree(anchor.id, depth + 1, baseX, cursorY);
    }
    return cursorY;
  };

  const roots = byParent.get(null) ?? [];
  const ownedRoots = roots.filter((anchor) => anchor.ownerModuleId);
  const freeRoots = roots.filter((anchor) => !anchor.ownerModuleId);

  const byOwner = new Map<string, OptionAnchorSpec[]>();
  for (const root of ownedRoots) {
    const ownerId = root.ownerModuleId!;
    const list = byOwner.get(ownerId) ?? [];
    list.push(root);
    byOwner.set(ownerId, list);
  }

  const ownerEntries = [...byOwner.entries()].sort((a, b) => {
    const pa = memberPos.get(a[0]);
    const pb = memberPos.get(b[0]);
    const ya = pa?.y ?? 0;
    const yb = pb?.y ?? 0;
    if (ya !== yb) return ya - yb;
    return (pa?.x ?? 0) - (pb?.x ?? 0);
  });

  for (const [ownerId, ownerRoots] of ownerEntries) {
    const owner = memberPos.get(ownerId);
    let dockX = owner
      ? owner.x + CANVAS_LAYOUT.moduleWidth + OPTION_ANCHOR_OWNER_GAP
      : columnX;
    // Keep owned docks out of the reserved right column / group edge.
    if (dockX > maxDockX) {
      dockX = columnX;
    }
    let dockY = Math.max(owner?.y ?? columnY, ownerRowCursor);
    const orderedRoots = [...ownerRoots].sort(
      (a, b) => rootKindPriority(a.kind) - rootKindPriority(b.kind),
    );
    for (const root of orderedRoots) {
      if (placed.has(root.id)) continue;
      placed.add(root.id);
      const position = positions[root.id] ?? root.defaultPosition ?? 'typical';
      pushAnchorNode(nodes, engine, root, dockX, dockY, position);
      dockY += OPTION_ANCHOR_NODE_HEIGHT + OPTION_ANCHOR_GAP;
      dockY = placeTree(root.id, 1, dockX, dockY);
    }
    ownerRowCursor = Math.max(ownerRowCursor, dockY);
    if (!owner) columnY = Math.max(columnY, dockY);
  }

  columnY = Math.max(columnY, ownerRowCursor);

  for (const root of freeRoots) {
    if (placed.has(root.id)) continue;
    placed.add(root.id);
    const position = positions[root.id] ?? root.defaultPosition ?? 'typical';
    pushAnchorNode(nodes, engine, root, columnX, columnY, position);
    columnY += OPTION_ANCHOR_NODE_HEIGHT + OPTION_ANCHOR_GAP;
    columnY = placeTree(root.id, 1, columnX, columnY);
  }

  for (const anchor of visible) {
    if (placed.has(anchor.id)) continue;
    const position = positions[anchor.id] ?? anchor.defaultPosition ?? 'typical';
    pushAnchorNode(nodes, engine, anchor, columnX, columnY, position);
    columnY += OPTION_ANCHOR_NODE_HEIGHT + OPTION_ANCHOR_GAP;
    placed.add(anchor.id);
  }

  return nodes;
}

/** Bottom extent of placed anchors (parent-relative), for engine chrome height. */
export function measurePlacedAnchorBottom(nodes: readonly OptionAnchorFlowNode[]): number {
  let bottom = 0;
  for (const node of nodes) {
    bottom = Math.max(bottom, node.position.y + OPTION_ANCHOR_NODE_HEIGHT);
  }
  return bottom;
}

/** React Flow-only option_bind edges (not persisted as module_links). */
export function optionBindEdgesForEngine(
  allAnchors: readonly OptionAnchorSpec[],
): Edge[] {
  const visible = canvasVisibleOptionAnchors(allAnchors);
  const visibleIds = new Set(visible.map((anchor) => anchor.id));
  const edges: Edge[] = [];
  const moduleOutHandle = handleIdForStream('data_feed', 'out');

  for (const anchor of visible) {
    if (anchor.ownerModuleId && !anchor.parentAnchorId) {
      edges.push({
        id: `option-bind:${anchor.ownerModuleId}:${anchor.id}`,
        source: anchor.ownerModuleId,
        target: anchor.id,
        sourceHandle: moduleOutHandle,
        targetHandle: OPTION_ANCHOR_HANDLE_IN,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: {
          stroke: 'var(--color-ink-faint)',
          strokeWidth: 1,
          strokeDasharray: '3 4',
        },
        className: 'hftr-edge hftr-edge-option-bind',
        data: { linkKind: 'option_bind', nature: 'system' },
      });
    }
    if (anchor.parentAnchorId && visibleIds.has(anchor.parentAnchorId)) {
      edges.push({
        id: `option-bind:${anchor.parentAnchorId}:${anchor.id}`,
        source: anchor.parentAnchorId,
        target: anchor.id,
        sourceHandle: OPTION_ANCHOR_HANDLE_OUT,
        targetHandle: OPTION_ANCHOR_HANDLE_IN,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: {
          stroke: 'var(--color-ink-faint)',
          strokeWidth: 1,
          strokeDasharray: '2 3',
        },
        className: 'hftr-edge hftr-edge-option-bind',
        data: { linkKind: 'option_bind', nature: 'system' },
      });
    }
  }

  return edges;
}

export function buildOptionAnchorArtifacts(
  engines: readonly CanvasEngineGroup[],
  modules: readonly CanvasModule[],
  relativeFromNodes?: ReadonlyMap<string, { x: number; y: number }>,
): {
  nodes: OptionAnchorFlowNode[];
  edges: Edge[];
  anchorsByEngine: Map<string, OptionAnchorSpec[]>;
} {
  const nodes: OptionAnchorFlowNode[] = [];
  const edges: Edge[] = [];
  const anchorsByEngine = new Map<string, OptionAnchorSpec[]>();

  for (const engine of engines) {
    const allAnchors = anchorsForEngine(engine, modules);
    anchorsByEngine.set(engine.id, allAnchors);
    const bounds = engine.canvasBounds;
    const width = bounds?.width ?? 400;
    const placed = placeOptionAnchorNodes(
      engine,
      width,
      allAnchors,
      modules,
      relativeFromNodes,
    );
    nodes.push(...placed);
    edges.push(...optionBindEdgesForEngine(allAnchors));
  }

  return { nodes, edges, anchorsByEngine };
}
