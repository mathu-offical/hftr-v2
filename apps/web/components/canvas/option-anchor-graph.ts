import type { Edge } from '@xyflow/react';
import {
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
  CANVAS_LAYOUT,
  DECISION_HANDLE_DATA_IN,
  DECISION_HANDLE_SYSTEM_IN,
  ENGINE_GROUP_PADDING,
  handleIdForStream,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import type { DecisionFlowNode, OptionAnchorFlowNode } from './DecisionNode';
import type { CanvasEngineGroup, CanvasModule } from './types';

export const OPTION_ANCHOR_NODE_WIDTH = 168;
/** Base height; placement grows with option count. */
export const OPTION_ANCHOR_NODE_HEIGHT = 72;
export const OPTION_ANCHOR_GAP = 10;
/** Matches CANVAS_LAYOUT / ENGINE_GROUP_PADDING.right reserve (D-176). */
export const OPTION_ANCHOR_COLUMN_WIDTH = CANVAS_LAYOUT.optionAnchorColumnWidth;
/** Gap between owner module card and its docked decision stack (D-180 / D-192). */
export const OPTION_ANCHOR_OWNER_GAP = 16;

/** Prefer process-decision roots at the owner card Y; secondary roots stack below. */
const ROOT_KIND_PRIORITY: Record<string, number> = {
  research_subtype: 0,
  librarian_subtype: 0,
  library_class: 0,
  strategy_family: 0,
  trend_posture: 0,
  emit_mode: 0,
  feed_class: 0,
  recovery_phase: 1,
  curiosity_band: 1,
  admission_mode: 1,
  cadence_band: 1,
  query_policy: 1,
  schedule_policy: 1,
  branch_role: 1,
  template_input: 2,
  philosophy_axis: 3,
};

function rootKindPriority(kind: string): number {
  return ROOT_KIND_PRIORITY[kind] ?? 1;
}

function nodeHeightFor(anchor: OptionAnchorSpec): number {
  const optionCount = anchor.options?.length ?? 0;
  return Math.max(OPTION_ANCHOR_NODE_HEIGHT, 36 + optionCount * 14);
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

function pushDecisionNode(
  nodes: DecisionFlowNode[],
  engine: CanvasEngineGroup,
  anchor: OptionAnchorSpec,
  x: number,
  y: number,
  position: OptionAnchorPosition,
  suppressOwnerBind = false,
): void {
  nodes.push({
    id: anchor.id,
    type: 'decisionNode',
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
      parentAnchorId: null,
      ownerModuleId: anchor.ownerModuleId ?? null,
      ownerEngineId: anchor.ownerEngineId,
      options: anchor.options ?? [],
      selectedOptionId: anchor.selectedOptionId ?? null,
      intakes: anchor.intakes ?? { data: true, systemControl: true, clock: false },
      position,
      parentId: engine.id,
      ...(suppressOwnerBind ? { suppressOwnerBind: true } : {}),
    },
  });
}

/**
 * Place canvas-visible decision nodes (D-192):
 * - One card per choice point (options are config, not child cards)
 * - Owned decisions dock right of their owner module
 * - Unowned roots stack in the engine right column
 */
export function placeOptionAnchorNodes(
  engine: CanvasEngineGroup,
  groupWidth: number,
  allAnchors: readonly OptionAnchorSpec[],
  modules: readonly CanvasModule[],
  relativeFromNodes?: ReadonlyMap<string, { x: number; y: number }>,
): DecisionFlowNode[] {
  const visible = canvasVisibleOptionAnchors(allAnchors);
  if (visible.length === 0) return [];

  const positions = positionsMap(engine);
  const memberPos = relativeMemberPositions(engine, modules, relativeFromNodes);
  const nodes: DecisionFlowNode[] = [];
  const placed = new Set<string>();

  const columnX = optionAnchorColumnX(groupWidth);
  const maxDockX =
    groupWidth - ENGINE_GROUP_PADDING.right - OPTION_ANCHOR_NODE_WIDTH;
  let columnY: number = ENGINE_GROUP_PADDING.top;
  let ownerRowCursor: number = ENGINE_GROUP_PADDING.top;

  const roots = visible.filter((anchor) => !anchor.parentAnchorId);
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
    let clampedToColumn = false;
    if (dockX > maxDockX) {
      dockX = columnX;
      clampedToColumn = true;
    }
    let dockY = Math.max(owner?.y ?? columnY, ownerRowCursor);
    const orderedRoots = [...ownerRoots].sort(
      (a, b) => rootKindPriority(a.kind) - rootKindPriority(b.kind),
    );
    for (const root of orderedRoots) {
      if (placed.has(root.id)) continue;
      placed.add(root.id);
      const position = positions[root.id] ?? root.defaultPosition ?? 'typical';
      pushDecisionNode(nodes, engine, root, dockX, dockY, position, clampedToColumn);
      dockY += nodeHeightFor(root) + OPTION_ANCHOR_GAP;
    }
    ownerRowCursor = Math.max(ownerRowCursor, dockY);
    if (!owner) columnY = Math.max(columnY, dockY);
  }

  columnY = Math.max(columnY, ownerRowCursor);

  for (const root of freeRoots) {
    if (placed.has(root.id)) continue;
    placed.add(root.id);
    const position = positions[root.id] ?? root.defaultPosition ?? 'typical';
    pushDecisionNode(nodes, engine, root, columnX, columnY, position);
    columnY += nodeHeightFor(root) + OPTION_ANCHOR_GAP;
  }

  for (const anchor of visible) {
    if (placed.has(anchor.id)) continue;
    const position = positions[anchor.id] ?? anchor.defaultPosition ?? 'typical';
    pushDecisionNode(nodes, engine, anchor, columnX, columnY, position);
    columnY += nodeHeightFor(anchor) + OPTION_ANCHOR_GAP;
    placed.add(anchor.id);
  }

  return nodes;
}

/** Bottom extent of placed decisions (parent-relative), for engine chrome height. */
export function measurePlacedAnchorBottom(
  nodes: readonly DecisionFlowNode[] | readonly OptionAnchorFlowNode[],
): number {
  let bottom = 0;
  for (const node of nodes) {
    const optionCount = node.data.options?.length ?? 0;
    const height = Math.max(OPTION_ANCHOR_NODE_HEIGHT, 36 + optionCount * 14);
    bottom = Math.max(bottom, node.position.y + height);
  }
  return bottom;
}

/**
 * React Flow-only decision binds (not persisted as module_links).
 * Owner module data_feed-out → decision data-in.
 * System-control intake handle is present on the card; decorative system bind uses
 * directive-out when the owner exposes it (control-shaped), else data only.
 */
export function optionBindEdgesForEngine(
  allAnchors: readonly OptionAnchorSpec[],
  options?: { suppressOwnerBindIds?: ReadonlySet<string> },
): Edge[] {
  const visible = canvasVisibleOptionAnchors(allAnchors);
  const suppressOwnerBindIds = options?.suppressOwnerBindIds ?? new Set<string>();
  const edges: Edge[] = [];
  const moduleDataOut = handleIdForStream('data_feed', 'out');
  const moduleDirectiveOut = handleIdForStream('directive', 'out');

  for (const anchor of visible) {
    if (!anchor.ownerModuleId || suppressOwnerBindIds.has(anchor.id)) continue;
    const intakes = anchor.intakes ?? { data: true, systemControl: true, clock: false };

    if (intakes.data) {
      edges.push({
        id: `decision-bind:data:${anchor.ownerModuleId}:${anchor.id}`,
        source: anchor.ownerModuleId,
        target: anchor.id,
        sourceHandle: moduleDataOut,
        targetHandle: DECISION_HANDLE_DATA_IN,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: {
          stroke: 'var(--color-ink-faint)',
          strokeWidth: 1,
          strokeDasharray: '3 4',
        },
        className: 'hftr-edge hftr-edge-option-bind',
        data: { linkKind: 'option_bind', nature: 'data', decisionId: anchor.id },
      });
    }

    if (intakes.systemControl) {
      edges.push({
        id: `decision-bind:system:${anchor.ownerModuleId}:${anchor.id}`,
        source: anchor.ownerModuleId,
        target: anchor.id,
        sourceHandle: moduleDirectiveOut,
        targetHandle: DECISION_HANDLE_SYSTEM_IN,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: {
          stroke: 'var(--color-ink-dim)',
          strokeWidth: 1,
          strokeDasharray: '2 5',
        },
        className: 'hftr-edge hftr-edge-option-bind',
        data: { linkKind: 'option_bind', nature: 'system', decisionId: anchor.id },
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
  nodes: DecisionFlowNode[];
  edges: Edge[];
  anchorsByEngine: Map<string, OptionAnchorSpec[]>;
} {
  const nodes: DecisionFlowNode[] = [];
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
    const suppressOwnerBindIds = new Set(
      placed.filter((node) => node.data.suppressOwnerBind).map((node) => node.id),
    );
    edges.push(...optionBindEdgesForEngine(allAnchors, { suppressOwnerBindIds }));
  }

  return { nodes, edges, anchorsByEngine };
}
