import type { Edge } from '@xyflow/react';
import {
  buildOptionAnchorsForEngine,
  canvasVisibleOptionAnchors,
  ENGINE_GROUP_PADDING,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import type { OptionAnchorFlowNode } from './OptionAnchorNode';
import type { CanvasEngineGroup, CanvasModule } from './types';

export const OPTION_ANCHOR_NODE_WIDTH = 140;
export const OPTION_ANCHOR_NODE_HEIGHT = 48;
export const OPTION_ANCHOR_GAP = 6;
/** Extra group width reserved for the right-side option-anchor column (D-169). */
export const OPTION_ANCHOR_COLUMN_WIDTH = 156;

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
 * Place canvas-visible anchors as a right-side column inside the engine group
 * (relative coordinates). Children sit indented under their parents.
 */
export function placeOptionAnchorNodes(
  engine: CanvasEngineGroup,
  groupWidth: number,
  allAnchors: readonly OptionAnchorSpec[],
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
  const nodes: OptionAnchorFlowNode[] = [];
  const baseX = Math.max(
    ENGINE_GROUP_PADDING.left,
    groupWidth - OPTION_ANCHOR_COLUMN_WIDTH + 8,
  );
  let cursorY = ENGINE_GROUP_PADDING.top;

  const visit = (parentId: string | null, depth: number): void => {
    const children = byParent.get(parentId) ?? [];
    for (const anchor of children) {
      const x = baseX + Math.min(depth, 2) * 10;
      const position = positions[anchor.id] ?? anchor.defaultPosition ?? 'typical';
      nodes.push({
        id: anchor.id,
        type: 'optionAnchor',
        parentId: engine.id,
        expandParent: false,
        draggable: false,
        selectable: true,
        position: { x, y: cursorY },
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
      cursorY += OPTION_ANCHOR_NODE_HEIGHT + OPTION_ANCHOR_GAP;
      visit(anchor.id, depth + 1);
    }
  };

  visit(null, 0);
  return nodes;
}

/** React Flow-only option_bind edges (not persisted as module_links). */
export function optionBindEdgesForEngine(
  allAnchors: readonly OptionAnchorSpec[],
): Edge[] {
  const visible = canvasVisibleOptionAnchors(allAnchors);
  const visibleIds = new Set(visible.map((anchor) => anchor.id));
  const edges: Edge[] = [];

  for (const anchor of visible) {
    if (anchor.ownerModuleId && !anchor.parentAnchorId) {
      edges.push({
        id: `option-bind:${anchor.ownerModuleId}:${anchor.id}`,
        source: anchor.ownerModuleId,
        target: anchor.id,
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
): { nodes: OptionAnchorFlowNode[]; edges: Edge[]; anchorsByEngine: Map<string, OptionAnchorSpec[]> } {
  const nodes: OptionAnchorFlowNode[] = [];
  const edges: Edge[] = [];
  const anchorsByEngine = new Map<string, OptionAnchorSpec[]>();

  for (const engine of engines) {
    const allAnchors = anchorsForEngine(engine, modules);
    anchorsByEngine.set(engine.id, allAnchors);
    const bounds = engine.canvasBounds;
    const width = bounds?.width ?? 400;
    nodes.push(...placeOptionAnchorNodes(engine, width, allAnchors));
    edges.push(...optionBindEdgesForEngine(allAnchors));
  }

  return { nodes, edges, anchorsByEngine };
}
