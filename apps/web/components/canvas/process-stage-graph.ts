import type { Edge } from '@xyflow/react';
import {
  ENGINE_GROUP_PADDING,
  inflateEngineBoundsForProcessRail,
  measureProcessRailBottom,
  placeProcessStageRail,
  PROCESS_STAGE_GAP,
  PROCESS_STAGE_NODE_HEIGHT,
  PROCESS_STAGE_NODE_WIDTH,
  PROCESS_STAGE_SPINE,
  seedEngineProcessStageSnapshot,
  type ProcessStageSpec,
} from '@hftr/contracts';
import type { ProcessStageFlowNode } from './ProcessStageNode';
import type { CanvasEngineGroup, CanvasModule } from './types';
import { relativeMemberPositions } from './option-anchor-graph';

export {
  PROCESS_STAGE_NODE_WIDTH,
  PROCESS_STAGE_NODE_HEIGHT,
  PROCESS_STAGE_GAP,
};

function stagesForEngine(
  engine: Pick<CanvasEngineGroup, 'id' | 'templateId' | 'setupSnapshot'>,
  modules: readonly CanvasModule[],
): ProcessStageSpec[] {
  const persisted = engine.setupSnapshot?.processStages;
  if (persisted && persisted.length > 0) return persisted;

  const members = modules
    .filter((module) => module.engineInstanceId === engine.id)
    .map((module) => ({
      id: module.id,
      type: module.type,
      position: module.position,
    }));
  return seedEngineProcessStageSnapshot({ templateId: engine.templateId, members }) ?? [];
}

function pushProcessStageNode(
  nodes: ProcessStageFlowNode[],
  engine: CanvasEngineGroup,
  stage: ProcessStageSpec,
  x: number,
  y: number,
): void {
  // RF node ids must be unique across engines (snapshot stage.id is spine-local).
  const nodeId = `${engine.id}:${stage.id}`;
  nodes.push({
    id: nodeId,
    type: 'processStageNode',
    parentId: engine.id,
    expandParent: true,
    draggable: true,
    selectable: true,
    position: { x, y },
    zIndex: 1,
    data: {
      id: stage.id,
      kind: stage.kind,
      label: stage.label,
      status: stage.status,
      ownerModuleId: stage.ownerModuleId ?? null,
    },
  });
}

/**
 * Hydrate process-stage RF nodes under the trend→trading desk rail.
 * Operator canvas XY in `setupSnapshot.processStageCanvasPositions` wins.
 */
export function placeProcessStageNodes(
  engine: CanvasEngineGroup,
  stages: readonly ProcessStageSpec[],
  modules: readonly CanvasModule[],
  relativeFromNodes?: ReadonlyMap<string, { x: number; y: number }>,
): ProcessStageFlowNode[] {
  if (stages.length === 0) return [];

  const memberPos = relativeMemberPositions(engine, modules, relativeFromNodes);
  const members = modules
    .filter((module) => module.engineInstanceId === engine.id)
    .map((module) => {
      const rel = memberPos.get(module.id);
      return {
        id: module.id,
        type: module.type,
        ...(rel ? { position: rel } : {}),
      };
    });
  const placedStages =
    stages.every((stage) => stage.position) && stages.length > 0
      ? stages
      : placeProcessStageRail([...stages], members);
  const savedCanvas = engine.setupSnapshot?.processStageCanvasPositions ?? {};
  const nodes: ProcessStageFlowNode[] = [];

  for (const stage of placedStages) {
    const saved =
      savedCanvas[stage.id] ?? savedCanvas[`${engine.id}:${stage.id}`];
    const x = saved?.x ?? stage.position?.x ?? 0;
    const y = saved?.y ?? stage.position?.y ?? 0;
    pushProcessStageNode(nodes, engine, stage, x, y);
  }

  return nodes;
}

export function measurePlacedProcessStageBottom(
  nodes: readonly ProcessStageFlowNode[],
): number {
  let bottom = 0;
  for (const node of nodes) {
    bottom = Math.max(bottom, node.position.y + PROCESS_STAGE_NODE_HEIGHT);
  }
  return bottom;
}

/** Decorative spine edges between adjacent process stages (view-only). */
export function processSpineEdgesForEngine(
  engineId: string,
  stages: readonly ProcessStageSpec[],
): Edge[] {
  const byKind = new Map(
    stages.map((stage) => [stage.kind, `${engineId}:${stage.id}`] as const),
  );
  const edges: Edge[] = [];
  for (let i = 0; i < PROCESS_STAGE_SPINE.length - 1; i += 1) {
    const fromId = byKind.get(PROCESS_STAGE_SPINE[i]!);
    const toId = byKind.get(PROCESS_STAGE_SPINE[i + 1]!);
    if (!fromId || !toId) continue;
    edges.push({
      id: `process-spine:${engineId}:${fromId}->${toId}`,
      source: fromId,
      target: toId,
      type: 'smoothstep',
      selectable: false,
      focusable: false,
      style: {
        stroke: 'var(--color-ink-faint)',
        strokeWidth: 1,
        strokeDasharray: '2 3',
        opacity: 0.65,
      },
      className: 'hftr-edge hftr-edge-process-spine',
      data: { linkKind: 'process_spine', engineId },
    });
  }
  return edges;
}

export function buildProcessStageArtifacts(
  engines: readonly CanvasEngineGroup[],
  modules: readonly CanvasModule[],
  relativeFromNodes?: ReadonlyMap<string, { x: number; y: number }>,
): { nodes: ProcessStageFlowNode[]; edges: Edge[] } {
  const nodes: ProcessStageFlowNode[] = [];
  const edges: Edge[] = [];

  for (const engine of engines) {
    const stages = stagesForEngine(engine, modules);
    if (stages.length === 0) continue;
    const placed = placeProcessStageNodes(engine, stages, modules, relativeFromNodes);
    nodes.push(...placed);
    edges.push(...processSpineEdgesForEngine(engine.id, stages));
  }

  return { nodes, edges };
}

export function expandEngineBoundsForProcessRailBottom(
  bounds: { x: number; y: number; width: number; height: number },
  processBottom: number,
): { x: number; y: number; width: number; height: number } {
  return inflateEngineBoundsForProcessRail(bounds, processBottom, ENGINE_GROUP_PADDING.bottom);
}

export function expandEngineBoundsForProcessRail(
  bounds: { x: number; y: number; width: number; height: number },
  stages: readonly ProcessStageSpec[],
): { x: number; y: number; width: number; height: number } {
  return expandEngineBoundsForProcessRailBottom(bounds, measureProcessRailBottom(stages));
}
