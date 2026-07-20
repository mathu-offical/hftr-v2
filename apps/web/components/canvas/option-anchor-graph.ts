import type { Edge } from '@xyflow/react';
import {
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
  CANVAS_LAYOUT,
  connectionModeForDecisionKind,
  DECISION_HANDLE_DATA_IN,
  DECISION_HANDLE_SYSTEM_IN,
  ENGINE_GROUP_PADDING,
  handleIdForLink,
  handleIdForStream,
  resolveDecisionOutboundTargets,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import type { DecisionFlowNode, OptionAnchorFlowNode } from './DecisionNode';
import type { CanvasEngineGroup, CanvasModule } from './types';

export const OPTION_ANCHOR_NODE_WIDTH = CANVAS_LAYOUT.decisionNodeWidth;
/** Base height; placement grows with max(intake, option) port rows. */
export const OPTION_ANCHOR_NODE_HEIGHT = 64;
export const OPTION_ANCHOR_GAP = CANVAS_LAYOUT.decisionStackGap;
/** Matches CANVAS_LAYOUT / ENGINE_GROUP_PADDING.right reserve (D-176). */
export const OPTION_ANCHOR_COLUMN_WIDTH = CANVAS_LAYOUT.optionAnchorColumnWidth;
/** Gap between owner module card and its docked decision stack (D-180 / D-192). */
export const OPTION_ANCHOR_OWNER_GAP = CANVAS_LAYOUT.decisionOwnerGap;

/** Prefer process-decision roots at the owner card Y; secondary roots stack below. */
const ROOT_KIND_PRIORITY: Record<string, number> = {
  strategy_family: 0,
  branch_role: 0,
  feed_class: 0,
  emit_mode: 0,
  recovery_phase: 1,
  research_subtype: 2,
  librarian_subtype: 2,
  library_class: 2,
  trend_posture: 2,
  curiosity_band: 3,
  admission_mode: 3,
  cadence_band: 3,
  query_policy: 3,
  schedule_policy: 3,
  template_input: 4,
  philosophy_axis: 5,
};

function rootKindPriority(kind: string): number {
  return ROOT_KIND_PRIORITY[kind] ?? 1;
}

function nodeHeightFor(anchor: OptionAnchorSpec): number {
  const intakes = anchor.intakes ?? { data: true, systemControl: false, clock: false };
  const intakeCount =
    (intakes.data ? 1 : 0) + (intakes.systemControl ? 1 : 0) + (intakes.clock ? 1 : 0);
  const optionCount = Math.max(anchor.options?.length ?? 0, 1);
  const rows = Math.max(intakeCount, optionCount, 1);
  return Math.max(OPTION_ANCHOR_NODE_HEIGHT, 28 + rows * 18);
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
    /** Grow engine chrome when the operator drags a decision past the edge. */
    expandParent: true,
    /** D-220: not pinned — operator may rearrange; defaults still dock after parent. */
    draggable: true,
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
      intakes: anchor.intakes ?? { data: true, systemControl: false, clock: false },
      connectionMode:
        anchor.connectionMode ?? connectionModeForDecisionKind(anchor.kind),
      position,
      parentId: engine.id,
      ...(suppressOwnerBind ? { suppressOwnerBind: true } : {}),
    },
  });
}

/**
 * Place canvas-visible decision nodes (D-192 / D-219 / D-220):
 * - One card per choice point (options are config, not child cards)
 * - Default: dock **immediately after** the parent module, stack by kind priority
 * - Operator canvas XY in `setupSnapshot.decisionNodeCanvasPositions` wins (unpinned)
 * - Overflow clamps into the reserved right column, still aligned to parent Y
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

  const bandPositions = positionsMap(engine);
  const savedCanvas =
    engine.setupSnapshot?.decisionNodeCanvasPositions ??
    ({} as Record<string, { x: number; y: number }>);
  const memberPos = relativeMemberPositions(engine, modules, relativeFromNodes);
  const nodes: DecisionFlowNode[] = [];
  const placed = new Set<string>();

  const columnX = optionAnchorColumnX(groupWidth);
  const maxDockX =
    groupWidth - ENGINE_GROUP_PADDING.right - OPTION_ANCHOR_NODE_WIDTH;
  let columnY: number = ENGINE_GROUP_PADDING.top;
  /** Per dock X — owners in different columns do not push each other's stacks. */
  const dockXCursor = new Map<number, number>();

  const roots = visible.filter((anchor) => !anchor.parentAnchorId);
  const ownedRoots = roots.filter((anchor) => anchor.ownerModuleId);
  const freeRoots = roots.filter((anchor) => !anchor.ownerModuleId);

  // Operator-saved canvas positions first (unpinned rearrangements).
  for (const root of roots) {
    const saved = savedCanvas[root.id];
    if (!saved) continue;
    if (placed.has(root.id)) continue;
    placed.add(root.id);
    const band = bandPositions[root.id] ?? root.defaultPosition ?? 'typical';
    pushDecisionNode(nodes, engine, root, saved.x, saved.y, band, false);
    columnY = Math.max(columnY, saved.y + nodeHeightFor(root) + OPTION_ANCHOR_GAP);
  }

  const byOwner = new Map<string, OptionAnchorSpec[]>();
  for (const root of ownedRoots) {
    if (placed.has(root.id)) continue;
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
    if (!owner || dockX > maxDockX) {
      dockX = columnX;
      clampedToColumn = true;
    }
    const stackTop = dockXCursor.get(dockX) ?? ENGINE_GROUP_PADDING.top;
    let dockY = stackTop;
    const orderedRoots = [...ownerRoots].sort(
      (a, b) => rootKindPriority(a.kind) - rootKindPriority(b.kind),
    );
    for (const root of orderedRoots) {
      if (placed.has(root.id)) continue;
      placed.add(root.id);
      // Align stack to parent Y (screenshot: Decision branch / recovery after desk).
      if (owner) {
        dockY = Math.max(owner.y, dockY === stackTop ? owner.y : dockY, stackTop);
      }
      const band = bandPositions[root.id] ?? root.defaultPosition ?? 'typical';
      pushDecisionNode(nodes, engine, root, dockX, dockY, band, clampedToColumn);
      dockY += nodeHeightFor(root) + OPTION_ANCHOR_GAP;
    }
    dockXCursor.set(dockX, dockY);
    if (clampedToColumn || !owner) columnY = Math.max(columnY, dockY);
  }

  for (const root of freeRoots) {
    if (placed.has(root.id)) continue;
    placed.add(root.id);
    const band = bandPositions[root.id] ?? root.defaultPosition ?? 'typical';
    pushDecisionNode(nodes, engine, root, columnX, columnY, band);
    columnY += nodeHeightFor(root) + OPTION_ANCHOR_GAP;
  }

  for (const anchor of visible) {
    if (placed.has(anchor.id)) continue;
    const band = bandPositions[anchor.id] ?? anchor.defaultPosition ?? 'typical';
    pushDecisionNode(nodes, engine, anchor, columnX, columnY, band);
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
    const intakes = node.data.intakes ?? { data: true, systemControl: false, clock: false };
    const intakeCount =
      (intakes.data ? 1 : 0) + (intakes.systemControl ? 1 : 0) + (intakes.clock ? 1 : 0);
    const optionCount = Math.max(node.data.options?.length ?? 0, 1);
    const rows = Math.max(intakeCount, optionCount, 1);
    const height = Math.max(OPTION_ANCHOR_NODE_HEIGHT, 28 + rows * 18);
    bottom = Math.max(bottom, node.position.y + height);
  }
  return bottom;
}

/**
 * React Flow-only decision binds (not persisted as module_links) — D-208 / D-217 / D-222.
 * 1. Owner → decision intakes by info type.
 * 2. Decision outs:
 *    - emit_decision → single data connection to owner (carries the choice)
 *    - route_data → one edge per option to resolved destinations (split points)
 */
export function optionBindEdgesForEngine(
  allAnchors: readonly OptionAnchorSpec[],
  options?: {
    suppressOwnerBindIds?: ReadonlySet<string>;
    /** Engine members used to resolve route destinations (emit_mode → library/trading). */
    members?: ReadonlyArray<{ id: string; type: string }>;
  },
): Edge[] {
  const visible = canvasVisibleOptionAnchors(allAnchors);
  const suppressOwnerBindIds = options?.suppressOwnerBindIds ?? new Set<string>();
  const members = options?.members ?? [];
  const edges: Edge[] = [];
  const moduleDataOut = handleIdForStream('data_feed', 'out');
  const moduleSystemOut = handleIdForStream('directive', 'out');

  for (const anchor of visible) {
    if (!anchor.ownerModuleId || suppressOwnerBindIds.has(anchor.id)) continue;
    const intakes = anchor.intakes ?? { data: true, systemControl: false, clock: false };

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
    } else if (intakes.systemControl) {
      edges.push({
        id: `decision-bind:system:${anchor.ownerModuleId}:${anchor.id}`,
        source: anchor.ownerModuleId,
        target: anchor.id,
        sourceHandle: moduleSystemOut,
        targetHandle: DECISION_HANDLE_SYSTEM_IN,
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: {
          stroke: 'var(--color-ink-faint)',
          strokeWidth: 1,
          strokeDasharray: '3 4',
        },
        className: 'hftr-edge hftr-edge-option-bind',
        data: { linkKind: 'option_bind', nature: 'system', decisionId: anchor.id },
      });
    }

    const mode = anchor.connectionMode ?? connectionModeForDecisionKind(anchor.kind);
    const outbound = resolveDecisionOutboundTargets(anchor, members);
    for (const target of outbound) {
      const isEmit = mode === 'emit_decision';
      const selected =
        target.optionId != null && target.optionId === anchor.selectedOptionId;
      edges.push({
        id: isEmit
          ? `decision-emit:${anchor.id}`
          : `decision-route:${anchor.id}:${target.optionId}`,
        source: anchor.id,
        target: target.targetModuleId,
        sourceHandle: target.sourceHandle,
        targetHandle: handleIdForLink(target.targetLinkKind, 'in'),
        type: 'smoothstep',
        selectable: false,
        focusable: false,
        style: {
          stroke: selected || isEmit ? 'var(--color-accent)' : 'var(--color-ink-faint)',
          strokeWidth: selected || isEmit ? 1.5 : 1,
          strokeDasharray: isEmit ? '4 3' : selected ? undefined : '2 4',
          opacity: isEmit || selected ? 1 : 0.55,
        },
        className: isEmit
          ? 'hftr-edge hftr-edge-decision-emit'
          : 'hftr-edge hftr-edge-decision-route',
        data: {
          linkKind: isEmit ? 'decision_emit' : 'decision_route',
          decisionId: anchor.id,
          optionId: target.optionId,
          connectionMode: mode,
        },
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
    const members = modules
      .filter((module) => module.engineInstanceId === engine.id)
      .map((module) => ({ id: module.id, type: module.type }));
    edges.push(
      ...optionBindEdgesForEngine(allAnchors, { suppressOwnerBindIds, members }),
    );
  }

  return { nodes, edges, anchorsByEngine };
}
