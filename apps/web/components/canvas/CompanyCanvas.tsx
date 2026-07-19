'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionLineType,
  Controls,
  Panel,
  ReactFlow,
  PanOnScrollMode,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  allowedLinkKinds,
  CANVAS_LAYOUT,
  computeEngineBoundsFromPositions,
  engineCanvasOffsetForOrigin,
  ENGINE_GROUP_PADDING,
  ENGINE_TEMPLATES,
  engineCreateSection,
  engineUtilitySourceHandleId,
  engineUtilityTargetHandleId,
  getEngineTemplateById,
  handleIdForStream,
  handleIdForTrendCandidate,
  isEngineDataHubConfig,
  isLegalStreamPortPair,
  isMathToolAttachment,
  layoutCanvas,
  LAYOUT_COLUMN_STEP,
  LAYOUT_ROW_STEP,
  missingModuleSetupFields,
  MODULE_COLUMN,
  natureForLinkKind,
  parseEngineUtilityHandle,
  parseTrendCandidateHandle,
  placeNextEngineOrigin,
  reflowEngineAtOrigin,
  researchDependenciesForExecutionEngine,
  simDependenciesForExecutionEngine,
  DEFAULT_EXECUTION_SIM_COUNT,
  simulationRoleForPlacement,
  translateLayoutResultToOrigin,
  type DeleteEngineMode,
  type EngineTemplate,
  type EngineUtilityBus,
  type LayoutLink,
  type LayoutModule,
  type LayoutRect,
  type LayoutResult,
  type LinkKind,
  type ModuleStatus,
  type ModuleSetupInput,
  type ModuleType,
  type OptionAnchorPosition,
  type OptionAnchorSpec,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import type { ModuleNameUpdate } from '@/lib/module-generated-name';
import { EngineGroupNode, type EngineGroupFlowNode } from './EngineGroupNode';
import { EngineInspectorPanel } from './EngineInspectorPanel';
import { InspectorPanel } from './InspectorPanel';
import { ModuleProcessDetailModal } from './ModuleProcessDetailModal';
import { MathToolNode, type MathToolFlowNode } from './MathToolNode';
import { ModuleNode, type ModuleFlowNode } from './ModuleNode';
import {
  OptionAnchorNode,
  type OptionAnchorFlowNode,
} from './OptionAnchorNode';
import { OptionAnchorInspectorPanel } from './OptionAnchorInspectorPanel';
import {
  anchorsForEngine,
  buildOptionAnchorArtifacts,
  measurePlacedAnchorBottom,
} from './option-anchor-graph';
import { CanvasSettingsMenu } from './CanvasSettingsMenu';
import { Palette } from './Palette';
import {
  edgeKindForHandles,
  LINK_COLORS,
  LINK_EDGE_DASH,
  NATURE_COLORS,
  NATURE_EDGE_DASH,
  moduleSubtypeChip,
  type CanvasEngineGroup,
  type CanvasLink,
  type CanvasModule,
  type ModuleTypeContextProjection,
} from './types';

const nodeTypes = {
  module: ModuleNode,
  mathTool: MathToolNode,
  engineGroup: EngineGroupNode,
  optionAnchor: OptionAnchorNode,
};

export type CanvasFlowNode =
  | ModuleFlowNode
  | MathToolFlowNode
  | EngineGroupFlowNode
  | OptionAnchorFlowNode;

function isModuleNode(node: CanvasFlowNode): node is ModuleFlowNode {
  return node.type === 'module';
}

function isEngineGroupNode(node: CanvasFlowNode): node is EngineGroupFlowNode {
  return node.type === 'engineGroup';
}

function isMathToolNode(node: CanvasFlowNode): node is MathToolFlowNode {
  return node.type === 'mathTool';
}

function isOptionAnchorNode(node: CanvasFlowNode): node is OptionAnchorFlowNode {
  return node.type === 'optionAnchor';
}

function isGraphModuleNode(node: CanvasFlowNode): node is ModuleFlowNode | MathToolFlowNode {
  return isModuleNode(node) || isMathToolNode(node);
}

/** Operator config blob — Math tools have none (D-159 hub checks). */
function moduleConfigRecord(node: ModuleFlowNode | MathToolFlowNode): Record<string, unknown> {
  if (!isModuleNode(node)) return {};
  return (node.data.config ?? {}) as Record<string, unknown>;
}

/** Resolve Data Hub module id for an execution engine (config owner or utility bind). */
function resolveDataHubModuleId(
  engineId: string,
  nodes: readonly CanvasFlowNode[],
): string | null {
  const byConfig = nodes.find((node) => {
    if (!isModuleNode(node) || node.data.moduleType !== 'library') return false;
    const cfg = moduleConfigRecord(node);
    return (
      isEngineDataHubConfig(cfg) &&
      (cfg.ownerEngineInstanceId as string | undefined) === engineId
    );
  });
  if (byConfig) return byConfig.id;

  const engineNode = nodes.find(
    (n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id === engineId,
  );
  const utilHub = engineNode?.data.utilityLinks?.find(
    (link) =>
      link.bus === 'data_in' &&
      typeof link.fromModuleId === 'string' &&
      link.streamDescriptor === 'Data Hub',
  );
  return utilHub?.fromModuleId ?? null;
}

/** D-077: visual edges from trend-candidate → trading bindings (not module_links). */
function trendBindingEdgesFromNodes(nodes: readonly CanvasFlowNode[]): Edge[] {
  const edges: Edge[] = [];
  for (const node of nodes) {
    if (!isModuleNode(node) || node.data.moduleType !== 'trend') continue;
    const ctx = node.data.typeContext;
    if (ctx?.kind !== 'trend') continue;
    for (const trend of ctx.trends) {
      if (!trend.tradingModuleId) continue;
      edges.push({
        id: `trend-bind:${trend.id}`,
        source: node.id,
        target: trend.tradingModuleId,
        sourceHandle: handleIdForTrendCandidate(trend.id),
        targetHandle: handleIdForStream('directive', 'in', node.id),
        type: 'smoothstep',
        label: trend.symbol,
        style: {
          stroke: LINK_COLORS.directive,
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
        },
        labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 9 },
        labelBgStyle: { fill: 'var(--color-surface-0)' },
        data: { linkKind: 'directive' as LinkKind, trendCandidateId: trend.id, binding: true },
        className: 'hftr-edge hftr-edge-directive hftr-edge-trend-bind',
      });
    }
  }
  return edges;
}

function mergeTrendBindingEdges(current: Edge[], nodes: readonly CanvasFlowNode[]): Edge[] {
  const without = current.filter(
    (edge) => !(edge.data as { binding?: boolean } | undefined)?.binding,
  );
  return [...without, ...trendBindingEdgesFromNodes(nodes)];
}

function ClearCanvasDialog(props: {
  busy: boolean;
  engineCount: number;
  moduleCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !props.busy) props.onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [props.busy, props.onCancel]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={() => {
        if (!props.busy) props.onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-canvas-title"
        className="w-80 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="clear-canvas-title" className="text-sm font-medium text-[var(--color-ink)]">
          Clear canvas?
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-dim)]">
          This permanently deletes every module, dedicated Math tool, engine group, and link on this
          company canvas ({props.moduleCount} node
          {props.moduleCount === 1 ? '' : 's'}
          {props.engineCount > 0
            ? `, ${props.engineCount} engine group${props.engineCount === 1 ? '' : 's'}`
            : ''}
          ). This cannot be undone from the UI.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onConfirm}
            className="rounded-md border border-[var(--color-block)] px-3 py-2 text-xs text-[var(--color-block)] disabled:opacity-50"
          >
            {props.busy ? 'Clearing…' : 'Delete all nodes'}
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onCancel}
            className="rounded-md border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-dim)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function engineBounds(node: EngineGroupFlowNode): LayoutRect {
  return {
    x: node.position.x,
    y: node.position.y,
    width:
      (node.style?.width as number) ??
      node.measured?.width ??
      ENGINE_GROUP_PADDING.left + ENGINE_GROUP_PADDING.right + CANVAS_LAYOUT.moduleWidth,
    height:
      (node.style?.height as number) ??
      node.measured?.height ??
      ENGINE_GROUP_PADDING.top + ENGINE_GROUP_PADDING.bottom + CANVAS_LAYOUT.moduleHeight,
  };
}

function absoluteModulePosition(
  node: ModuleFlowNode | MathToolFlowNode,
  nodes: readonly CanvasFlowNode[],
): { x: number; y: number } {
  if (!node.parentId) return node.position;
  const parent = nodes.find((n) => n.id === node.parentId);
  if (!parent || !isEngineGroupNode(parent)) return node.position;
  return {
    x: parent.position.x + node.position.x,
    y: parent.position.y + node.position.y,
  };
}

function findEngineAtPoint(
  abs: { x: number; y: number },
  engineNodes: EngineGroupFlowNode[],
): string | null {
  for (const eng of engineNodes) {
    const b = engineBounds(eng);
    if (abs.x >= b.x && abs.y >= b.y && abs.x <= b.x + b.width && abs.y <= b.y + b.height) {
      return eng.id;
    }
  }
  return null;
}

function resolveEngineBounds(
  engine: CanvasEngineGroup,
  members: readonly CanvasModule[],
): { x: number; y: number; width: number; height: number } {
  if (engine.canvasBounds) return engine.canvasBounds;
  const memberPositions = members
    .filter((m) => m.engineInstanceId === engine.id && m.type !== 'math')
    .map((m) => m.position);
  return computeEngineBoundsFromPositions(memberPositions);
}

function canvasModuleFromNode(
  node: ModuleFlowNode,
  nodes: readonly CanvasFlowNode[],
): CanvasModule {
  return {
    id: node.id,
    type: node.data.moduleType,
    name: node.data.name,
    generatedNameBase: node.data.generatedNameBase,
    nameCustomized: node.data.nameCustomized,
    status: node.data.status,
    position: absoluteModulePosition(node, nodes),
    topicSectors: node.data.topicSectors,
    capitalAllocationRef: node.data.capitalAllocationRef,
    targetExitRef: node.data.targetExitRef,
    missingSetupFields: node.data.missingSetupFields,
    engineInstanceId: node.data.engineInstanceId,
    toolOwnerModuleId: node.data.toolOwnerModuleId ?? null,
    topicSectorsOverridden: node.data.topicSectorsOverridden,
    subtypeChip: node.data.subtypeChip ?? null,
    ...(node.data.config !== undefined ? { config: node.data.config } : {}),
    ...(node.data.typeContext !== undefined ? { typeContext: node.data.typeContext } : {}),
  };
}

function canvasModulesFromNodes(nodes: readonly CanvasFlowNode[]): CanvasModule[] {
  return nodes.filter(isModuleNode).map((node) => canvasModuleFromNode(node, nodes));
}

function canvasEnginesFromNodes(nodes: readonly CanvasFlowNode[]): CanvasEngineGroup[] {
  return nodes.filter(isEngineGroupNode).map((node) => {
    const width = Number(node.style?.width) || 400;
    const height = Number(node.style?.height) || 300;
    return {
      id: node.id,
      templateId: node.data.templateId,
      label: node.data.label,
      masterTopicSectors: node.data.masterTopicSectors,
      setupSnapshot: node.data.setupSnapshot ?? null,
      templateInputs: node.data.templateInputs ?? {},
      canvasBounds: {
        x: node.position.x,
        y: node.position.y,
        width,
        height,
      },
      memberModuleIds: node.data.memberModuleIds,
      ...(node.data.utilityLinks ? { utilityLinks: node.data.utilityLinks } : {}),
    };
  });
}

function engineBoundsWithOptionColumn(
  memberBounds: { x: number; y: number; width: number; height: number },
  placedAnchorBottom: number,
): { x: number; y: number; width: number; height: number } {
  // D-176/D-180: padding.right reserves the column; grow height to fit docked trees.
  const anchorsHeight =
    placedAnchorBottom > 0
      ? placedAnchorBottom + ENGINE_GROUP_PADDING.bottom
      : memberBounds.height;
  return {
    x: memberBounds.x,
    y: memberBounds.y,
    width: memberBounds.width,
    height: Math.max(memberBounds.height, anchorsHeight),
  };
}

/** Strip + rebuild option-anchor nodes; expand engine chrome for the right column. */
function withSyncedOptionAnchors(nodes: readonly CanvasFlowNode[]): {
  nodes: CanvasFlowNode[];
  optionEdges: Edge[];
  anchorsByEngine: Map<string, OptionAnchorSpec[]>;
} {
  const withoutAnchors = nodes.filter((node) => !isOptionAnchorNode(node));
  const modules = canvasModulesFromNodes(withoutAnchors);
  const relativeFromNodes = new Map<string, { x: number; y: number }>();
  for (const node of withoutAnchors) {
    if (!isModuleNode(node) || !node.parentId) continue;
    relativeFromNodes.set(node.id, { x: node.position.x, y: node.position.y });
  }

  const engines = withoutAnchors.filter(isEngineGroupNode).map((node) => {
    const memberBounds = resolveEngineBounds(
      {
        id: node.id,
        templateId: node.data.templateId,
        label: node.data.label,
        masterTopicSectors: node.data.masterTopicSectors,
        canvasBounds: null,
        memberModuleIds: node.data.memberModuleIds,
        setupSnapshot: node.data.setupSnapshot ?? null,
        templateInputs: node.data.templateInputs ?? {},
      },
      modules,
    );
    const allAnchors = anchorsForEngine(
      { id: node.id, templateId: node.data.templateId },
      modules,
    );
    const provisional: CanvasEngineGroup = {
      id: node.id,
      templateId: node.data.templateId,
      label: node.data.label,
      masterTopicSectors: node.data.masterTopicSectors,
      setupSnapshot: node.data.setupSnapshot ?? null,
      templateInputs: node.data.templateInputs ?? {},
      canvasBounds: {
        x: node.position.x,
        y: node.position.y,
        width: memberBounds.width,
        height: memberBounds.height,
      },
      memberModuleIds: node.data.memberModuleIds,
      ...(node.data.utilityLinks ? { utilityLinks: node.data.utilityLinks } : {}),
    };
    const placed = buildOptionAnchorArtifacts(
      [provisional],
      modules,
      relativeFromNodes,
    ).nodes.filter((anchor) => anchor.parentId === node.id);
    const expanded = engineBoundsWithOptionColumn(
      {
        x: node.position.x,
        y: node.position.y,
        width: memberBounds.width,
        height: memberBounds.height,
      },
      measurePlacedAnchorBottom(placed),
    );
    return {
      id: node.id,
      templateId: node.data.templateId,
      label: node.data.label,
      masterTopicSectors: node.data.masterTopicSectors,
      setupSnapshot: node.data.setupSnapshot ?? null,
      templateInputs: node.data.templateInputs ?? {},
      canvasBounds: expanded,
      memberModuleIds: node.data.memberModuleIds,
      ...(node.data.utilityLinks ? { utilityLinks: node.data.utilityLinks } : {}),
    } satisfies CanvasEngineGroup;
  });

  const artifacts = buildOptionAnchorArtifacts(engines, modules, relativeFromNodes);
  const engineById = new Map(engines.map((engine) => [engine.id, engine]));

  const syncedBase: CanvasFlowNode[] = withoutAnchors.map((node) => {
    if (!isEngineGroupNode(node)) return node;
    const engine = engineById.get(node.id);
    if (!engine?.canvasBounds) return node;
    return {
      ...node,
      position: { x: engine.canvasBounds.x, y: engine.canvasBounds.y },
      style: {
        ...node.style,
        width: engine.canvasBounds.width,
        height: engine.canvasBounds.height,
      },
    };
  });

  return {
    nodes: [...syncedBase, ...artifacts.nodes],
    optionEdges: artifacts.edges,
    anchorsByEngine: artifacts.anchorsByEngine,
  };
}

function mergeDecorativeEdges(current: Edge[], nodes: CanvasFlowNode[]): Edge[] {
  const core = current.filter(
    (edge) =>
      !String(edge.id).startsWith('util-') && !String(edge.id).startsWith('option-bind:'),
  );
  const engines = canvasEnginesFromNodes(nodes);
  const modules = canvasModulesFromNodes(nodes);
  const relativeFromNodes = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (!isModuleNode(node) || !node.parentId) continue;
    relativeFromNodes.set(node.id, { x: node.position.x, y: node.position.y });
  }
  const { edges: optionEdges } = buildOptionAnchorArtifacts(
    engines,
    modules,
    relativeFromNodes,
  );
  return [...core, ...utilityEdgesFromEngines(engines), ...optionEdges];
}

/** True when the click landed on an editable control inside the node body. */
function isInteractiveNodeTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('input, select, textarea, button, label') !== null
  );
}

/** Default placement under an owner (reflow / first provision only). */
function defaultMathOffset(owner: Pick<ModuleFlowNode, 'measured'>): { x: number; y: number } {
  const ownerWidth = Math.max(
    owner.measured?.width ?? CANVAS_LAYOUT.moduleWidth,
    CANVAS_LAYOUT.moduleWidth,
  );
  const ownerHeight = Math.max(
    owner.measured?.height ?? CANVAS_LAYOUT.moduleHeight,
    CANVAS_LAYOUT.moduleHeight,
  );
  return {
    x: (ownerWidth - CANVAS_LAYOUT.mathToolWidth) / 2,
    y: ownerHeight + CANVAS_LAYOUT.mathAttachmentGap,
  };
}

/**
 * Keep dedicated Math tools in the same engine parent as their owner without
 * forcing position — operators may drag tools independently.
 */
function syncDedicatedMathParents(nodes: CanvasFlowNode[]): CanvasFlowNode[] {
  const owners = new Map(nodes.filter(isModuleNode).map((node) => [node.id, node] as const));
  let changed = false;
  const next = nodes.map((node) => {
    if (!isMathToolNode(node)) return node;
    const owner = owners.get(node.data.ownerModuleId);
    if (!owner) return node;
    const parentId = owner.parentId;
    if (
      node.parentId === parentId &&
      node.data.ownerEngineInstanceId === owner.data.engineInstanceId &&
      node.data.ownerName === owner.data.name
    ) {
      return node;
    }
    changed = true;
    const base = {
      ...node,
      data: {
        ...node.data,
        ownerName: owner.data.name,
        ownerEngineInstanceId: owner.data.engineInstanceId,
      },
    };
    if (parentId) return { ...base, parentId };
    const { parentId: _parentId, ...withoutParent } = base;
    return withoutParent;
  });
  return changed ? next : nodes;
}

type ProvisionedMathClient = {
  id: string;
  ownerModuleId: string;
  position: { x: number; y: number };
  links: CanvasLink[];
};

function appendProvisionedMath(
  nodes: CanvasFlowNode[],
  edges: Edge[],
  tools: readonly ProvisionedMathClient[],
  companyId: string,
): { nodes: CanvasFlowNode[]; edges: Edge[] } {
  if (tools.length === 0) return { nodes, edges };
  const additions: MathToolFlowNode[] = [];
  for (const tool of tools) {
    const owner = nodes.find(
      (node): node is ModuleFlowNode => isModuleNode(node) && node.id === tool.ownerModuleId,
    );
    if (!owner) continue;
    const offset = defaultMathOffset(owner);
    additions.push({
      id: tool.id,
      type: 'mathTool',
      position: {
        x: owner.position.x + offset.x,
        y: owner.position.y + offset.y,
      },
      ...(owner.parentId ? { parentId: owner.parentId } : {}),
      expandParent: false,
      draggable: true,
      data: {
        name: `Math · ${owner.data.name}`,
        companyId,
        moduleType: 'math',
        engineInstanceId: null,
        toolOwnerModuleId: owner.id,
        ownerEngineInstanceId: owner.data.engineInstanceId,
        ownerModuleId: owner.id,
        ownerName: owner.data.name,
      },
    });
  }
  return {
    nodes: syncDedicatedMathParents([...nodes, ...additions]),
    edges: [...edges, ...tools.flatMap((tool) => tool.links.map((l) => toEdge(l)))],
  };
}

function applyRenamedModules(
  nodes: CanvasFlowNode[],
  updates: readonly ModuleNameUpdate[],
): CanvasFlowNode[] {
  if (updates.length === 0) return nodes;
  const byId = new Map(updates.map((update) => [update.moduleId, update]));
  return nodes.map((node) => {
    if (!isModuleNode(node)) return node;
    const renamed = byId.get(node.id);
    if (!renamed) return node;
    return {
      ...node,
      data: {
        ...node.data,
        name: renamed.name,
        generatedNameBase: renamed.generatedNameBase,
        nameCustomized: renamed.nameCustomized,
      },
    };
  });
}

function applyMathAttachments(nodes: CanvasFlowNode[], edges: Edge[]): CanvasFlowNode[] {
  const typeById = new Map<string, ModuleType>();
  const nameById = new Map<string, string>();
  // Dedicated Math tools already render as compact nodes — do not also badge them.
  const dedicatedMathIds = new Set(nodes.filter(isMathToolNode).map((node) => node.id));
  for (const node of nodes) {
    if (!isModuleNode(node)) continue;
    typeById.set(node.id, node.data.moduleType);
    nameById.set(node.id, node.data.name);
  }

  const attachments = new Map<string, { id: string; name: string }[]>();
  for (const edge of edges) {
    if (dedicatedMathIds.has(edge.source)) continue;
    const linkKind = (edge.data as { linkKind?: LinkKind } | undefined)?.linkKind;
    if (!linkKind) continue;
    const fromType = typeById.get(edge.source);
    const toType = typeById.get(edge.target);
    if (!fromType || !toType) continue;
    if (!isMathToolAttachment(fromType, toType, linkKind)) continue;
    const list = attachments.get(edge.target) ?? [];
    if (!list.some((tool) => tool.id === edge.source)) {
      list.push({ id: edge.source, name: nameById.get(edge.source) ?? 'Math' });
      attachments.set(edge.target, list);
    }
  }

  return nodes.map((node) => {
    if (!isModuleNode(node)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        attachedMathTools: attachments.get(node.id) ?? [],
      },
    };
  });
}

function toModuleNode(
  m: CanvasModule,
  companyId: string,
  attachedMathTools: { id: string; name: string }[] = [],
): ModuleFlowNode {
  const subtypeChip = m.subtypeChip ?? moduleSubtypeChip(m.type, m.config, m.generatedNameBase);
  return {
    id: m.id,
    type: 'module',
    position: m.position,
    deletable: false,
    data: {
      name: m.name,
      generatedNameBase: m.generatedNameBase,
      nameCustomized: m.nameCustomized,
      moduleType: m.type,
      status: m.status,
      subtypeChip,
      companyId,
      topicSectors: m.topicSectors,
      capitalAllocationRef: m.capitalAllocationRef,
      targetExitRef: m.targetExitRef,
      missingSetupFields: m.missingSetupFields,
      engineInstanceId: m.engineInstanceId,
      toolOwnerModuleId: m.toolOwnerModuleId,
      topicSectorsOverridden: m.topicSectorsOverridden,
      attachedMathTools,
      ...(m.config != null ? { config: m.config } : {}),
      ...(m.typeContext != null ? { typeContext: m.typeContext } : {}),
    },
  };
}

function gatherLayoutModules(nodes: readonly CanvasFlowNode[]): LayoutModule[] {
  return nodes.filter(isGraphModuleNode).map((node) => {
    const width = node.measured?.width;
    const height = node.measured?.height;
    return {
      id: node.id,
      type: node.data.moduleType,
      engineInstanceId: node.data.engineInstanceId,
      toolOwnerModuleId: isMathToolNode(node)
        ? node.data.toolOwnerModuleId
        : (node.data.toolOwnerModuleId ?? null),
      position: absoluteModulePosition(node, nodes),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  });
}

function gatherLayoutLinks(edges: readonly Edge[]): LayoutLink[] {
  const links: LayoutLink[] = [];
  for (const edge of edges) {
    const linkKind = (edge.data as { linkKind?: LinkKind } | undefined)?.linkKind;
    if (!linkKind) continue;
    links.push({
      fromModuleId: edge.source,
      toModuleId: edge.target,
      linkKind,
    });
  }
  return links;
}

/** Apply absolute layout positions onto RF nodes (engine-relative for members). */
function applyLayoutToNodes(
  current: readonly CanvasFlowNode[],
  layout: LayoutResult,
): CanvasFlowNode[] {
  const modulePosById = new Map(layout.modules.map((m) => [m.id, m.canvasPosition]));
  const engineBoundsById = new Map(layout.engines.map((e) => [e.id, e.canvasBounds]));

  const laidOut = current
    .filter((node) => !isOptionAnchorNode(node))
    .map((node) => {
    if (isEngineGroupNode(node)) {
      const bounds = engineBoundsById.get(node.id);
      if (!bounds) return node;
      return {
        ...node,
        position: { x: bounds.x, y: bounds.y },
        style: { ...node.style, width: bounds.width, height: bounds.height },
      };
    }
    if (!isGraphModuleNode(node)) return node;

    const abs = modulePosById.get(node.id);
    if (!abs) return node;

    const engineId = isMathToolNode(node)
      ? node.data.ownerEngineInstanceId
      : node.data.engineInstanceId;
    if (engineId) {
      const bounds = engineBoundsById.get(engineId);
      if (bounds) {
        return {
          ...node,
          parentId: engineId,
          position: {
            x: abs.x - bounds.x,
            y: abs.y - bounds.y,
          },
          expandParent: false,
        };
      }
    }

    const { parentId: _parent, ...rest } = node;
    return {
      ...rest,
      position: abs,
      expandParent: false,
    };
  });

  return withSyncedOptionAnchors(laidOut).nodes;
}

function buildInitialGraph(
  modules: CanvasModule[],
  engines: CanvasEngineGroup[],
  links: CanvasLink[],
  companyId: string,
  engineCallbacks: Pick<
    EngineGroupFlowNode['data'],
    'onRequestDelete' | 'onRequestReflow' | 'onEngineSetupSaved'
  >,
): CanvasFlowNode[] {
  const attachmentMap = new Map<string, { id: string; name: string }[]>();
  const typeById = new Map(modules.map((m) => [m.id, m.type]));
  const nameById = new Map(modules.map((m) => [m.id, m.name]));
  // Explicit dedicated Math renders as MathToolNode — badge only shared/unowned Math.
  const dedicatedMathIds = new Set(
    modules
      .filter((module) => module.type === 'math' && module.toolOwnerModuleId)
      .map((module) => module.id),
  );
  for (const link of links) {
    if (dedicatedMathIds.has(link.fromModuleId)) continue;
    const fromType = typeById.get(link.fromModuleId);
    const toType = typeById.get(link.toModuleId);
    if (!fromType || !toType) continue;
    if (!isMathToolAttachment(fromType, toType, link.linkKind)) continue;
    const list = attachmentMap.get(link.toModuleId) ?? [];
    if (!list.some((tool) => tool.id === link.fromModuleId)) {
      list.push({
        id: link.fromModuleId,
        name: nameById.get(link.fromModuleId) ?? 'Math',
      });
      attachmentMap.set(link.toModuleId, list);
    }
  }

  const nodes: CanvasFlowNode[] = [];

  for (const engine of engines) {
    const bounds = resolveEngineBounds(engine, modules);
    nodes.push({
      id: engine.id,
      type: 'engineGroup',
      position: { x: bounds.x, y: bounds.y },
      style: { width: bounds.width, height: bounds.height },
      draggable: true,
      selectable: true,
      zIndex: -1,
      data: {
        companyId,
        label: engine.label,
        templateId: engine.templateId,
        masterTopicSectors: engine.masterTopicSectors,
        setupSnapshot: engine.setupSnapshot ?? null,
        templateInputs: engine.templateInputs ?? {},
        memberModuleIds: engine.memberModuleIds,
        utilityLinks: engine.utilityLinks ?? [],
        ...engineCallbacks,
      },
    });
  }

  for (const m of modules) {
    if (m.type === 'math' && m.toolOwnerModuleId) {
      const owner = modules.find((candidate) => candidate.id === m.toolOwnerModuleId);
      if (owner) {
        const ownerEngine = owner.engineInstanceId
          ? engines.find((engine) => engine.id === owner.engineInstanceId)
          : null;
        const bounds = ownerEngine ? resolveEngineBounds(ownerEngine, modules) : null;
        nodes.push({
          id: m.id,
          type: 'mathTool',
          position: bounds
            ? { x: m.position.x - bounds.x, y: m.position.y - bounds.y }
            : m.position,
          ...(ownerEngine ? { parentId: ownerEngine.id } : {}),
          expandParent: false,
          draggable: true,
          data: {
            name: m.name,
            companyId,
            moduleType: 'math',
            engineInstanceId: null,
            toolOwnerModuleId: owner.id,
            ownerEngineInstanceId: owner.engineInstanceId,
            ownerModuleId: owner.id,
            ownerName: owner.name,
          },
        });
        continue;
      }
    }

    const engineId = m.type === 'math' ? null : m.engineInstanceId;
    const parentEngine = engineId ? engines.find((e) => e.id === engineId) : null;
    let position = m.position;
    let parentId: string | undefined;

    if (parentEngine) {
      const bounds = resolveEngineBounds(parentEngine, modules);
      parentId = parentEngine.id;
      position = {
        x: m.position.x - bounds.x,
        y: m.position.y - bounds.y,
      };
    }

    const base = toModuleNode(m, companyId, attachmentMap.get(m.id) ?? []);
    const moduleNode: ModuleFlowNode = parentId
      ? {
          ...base,
          parentId,
          position,
          expandParent: false,
        }
      : {
          ...base,
          position,
          expandParent: false,
        };
    nodes.push(moduleNode);
  }

  return withSyncedOptionAnchors(nodes).nodes;
}

function edgeNatureForLink(
  linkKind: LinkKind,
  fromType?: ModuleType | null,
  toType?: ModuleType | null,
): 'data' | 'system' | 'fund' | 'time' {
  if ((fromType === 'time' || fromType === 'clock') && linkKind === 'data_feed') return 'time';
  if (fromType === 'librarian' && toType === 'library' && linkKind === 'data_feed') return 'system';
  return natureForLinkKind(linkKind);
}

function toEdge(
  l: CanvasLink,
  typeById?: ReadonlyMap<string, ModuleType>,
): Edge {
  const fromType = typeById?.get(l.fromModuleId) ?? null;
  const toType = typeById?.get(l.toModuleId) ?? null;
  const nature = edgeNatureForLink(l.linkKind, fromType, toType);
  const dash = NATURE_EDGE_DASH[nature] ?? LINK_EDGE_DASH[l.linkKind];
  return {
    id: l.id,
    source: l.fromModuleId,
    target: l.toModuleId,
    type: 'smoothstep',
    // Per-peer stream handles so each dependency lands on its own pin (D-057).
    sourceHandle: handleIdForStream(l.linkKind, 'out', l.toModuleId),
    targetHandle: handleIdForStream(l.linkKind, 'in', l.fromModuleId),
    label: l.linkKind.replace('_', ' '),
    style: {
      stroke: NATURE_COLORS[nature] ?? LINK_COLORS[l.linkKind],
      strokeWidth: l.linkKind === 'fund_route' ? 2 : 1.5,
      ...(dash ? { strokeDasharray: dash } : {}),
    },
    labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 9 },
    labelBgStyle: { fill: 'var(--color-surface-0)' },
    animated: false,
    className: `hftr-edge hftr-edge-${l.linkKind} hftr-edge-nature-${nature}`,
    data: { linkKind: l.linkKind, nature },
  };
}

type UtilityLinkEdgeInput = {
  id: string;
  bus: EngineUtilityBus;
  toEngineId: string;
  fromEngineId?: string | null;
  fromModuleId?: string | null;
  streamDescriptor?: string | null;
};

function utilityBusNature(bus: EngineUtilityBus): 'data' | 'system' | 'fund' | 'time' {
  switch (bus) {
    case 'clock':
      return 'time';
    case 'funds':
      return 'fund';
    case 'system_control':
      return 'system';
    case 'data_in':
    case 'data_out':
      return 'data';
    default: {
      const _exhaustive: never = bus;
      return _exhaustive;
    }
  }
}

/** D-091 / D-108: React Flow edges for motherboard utility binds (not module_links). */
function toUtilityEdge(link: UtilityLinkEdgeInput): Edge | null {
  const label =
    link.streamDescriptor?.trim() ||
    link.bus.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  const nature = utilityBusNature(link.bus);
  const dash = NATURE_EDGE_DASH[nature];
  const style = {
    stroke: NATURE_COLORS[nature],
    strokeWidth: 1.5,
    ...(dash ? { strokeDasharray: dash } : {}),
  } as const;
  const labelStyle = { fill: 'var(--color-ink-faint)', fontSize: 9 };
  const labelBgStyle = { fill: 'var(--color-surface-0)' };

  if (link.fromEngineId) {
    return {
      id: `util-${link.id}`,
      source: link.fromEngineId,
      target: link.toEngineId,
      type: 'smoothstep',
      sourceHandle: engineUtilitySourceHandleId('data_out'),
      targetHandle: engineUtilityTargetHandleId(link.bus),
      label,
      style,
      labelStyle,
      labelBgStyle,
      animated: false,
      className: `hftr-edge hftr-edge-utility hftr-edge-utility-${link.bus} hftr-edge-nature-${nature}`,
      data: { utilityLinkId: link.id, bus: link.bus, nature },
    };
  }

  if (
    link.fromModuleId &&
    (link.bus === 'clock' ||
      link.bus === 'funds' ||
      link.bus === 'system_control' ||
      link.bus === 'data_in')
  ) {
    return {
      id: `util-${link.id}`,
      source: link.fromModuleId,
      target: link.toEngineId,
      type: 'smoothstep',
      // Bus handle (no peer suffix) — utility binds are not module_links peers.
      sourceHandle: handleIdForStream('data_feed', 'out'),
      targetHandle: engineUtilityTargetHandleId(link.bus),
      label,
      style,
      labelStyle,
      labelBgStyle,
      animated: false,
      className: `hftr-edge hftr-edge-utility hftr-edge-utility-${link.bus} hftr-edge-nature-${nature}`,
      data: { utilityLinkId: link.id, bus: link.bus, nature },
    };
  }

  // Internal data_out stubs (analyzer → chrome) stay chip-only, not edges.
  return null;
}

type UtilityLinkView = {
  id: string;
  bus: EngineUtilityBus;
  toEngineId?: string;
  fromEngineId?: string | null;
  fromModuleId?: string | null;
  streamId?: string | null;
  streamDescriptor?: string | null;
};

function utilityEdgesFromEngines(engines: readonly CanvasEngineGroup[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const engine of engines) {
    for (const link of engine.utilityLinks ?? []) {
      const edge = toUtilityEdge({ ...link, toEngineId: engine.id });
      if (!edge || seen.has(edge.id)) continue;
      seen.add(edge.id);
      edges.push(edge);
    }
  }
  return edges;
}

/** Rebuild utility edges from current engine-group node data (keeps module_links edges). */
function mergeUtilityEdgesFromNodes(current: Edge[], nodes: CanvasFlowNode[]): Edge[] {
  return mergeDecorativeEdges(current, nodes);
}

/** Apply company-wide utility link rows onto engine nodes (keyed by toEngineId). */
function applyUtilityLinksToEngineNodes(
  nodes: CanvasFlowNode[],
  links: readonly UtilityLinkView[],
): CanvasFlowNode[] {
  const byEngine = new Map<string, UtilityLinkView[]>();
  for (const link of links) {
    const toId = link.toEngineId;
    if (!toId) continue;
    const list = byEngine.get(toId) ?? [];
    list.push(link);
    byEngine.set(toId, list);
  }
  return nodes.map((node) => {
    if (!isEngineGroupNode(node)) return node;
    const nextLinks = byEngine.get(node.id);
    if (!nextLinks) return node;
    return {
      ...node,
      data: {
        ...node.data,
        utilityLinks: nextLinks.map((link) => ({
          id: link.id,
          bus: link.bus,
          fromEngineId: link.fromEngineId ?? null,
          fromModuleId: link.fromModuleId ?? null,
          streamId: link.streamId ?? null,
          streamDescriptor: link.streamDescriptor ?? null,
        })),
      },
    };
  });
}

function appendUtilityLinkToEngineNodes(
  nodes: CanvasFlowNode[],
  engineId: string,
  link: {
    id: string;
    bus: EngineUtilityBus;
    fromEngineId?: string | null;
    fromModuleId?: string | null;
    streamId?: string | null;
    streamDescriptor?: string | null;
  },
): CanvasFlowNode[] {
  return nodes.map((node) => {
    if (!isEngineGroupNode(node) || node.id !== engineId) return node;
    const existing = node.data.utilityLinks ?? [];
    if (existing.some((row) => row.id === link.id)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        utilityLinks: [...existing, link],
      },
    };
  });
}

/**
 * D-088: when legacy reciprocal owner↔Math data_feed pairs exist, draw only the
 * Math→owner Calc-ref edge so the dock shows one connection.
 */
function dedupeMathCalcRefLinks(
  links: readonly CanvasLink[],
  modules: readonly CanvasModule[],
): CanvasLink[] {
  const typeById = new Map(modules.map((m) => [m.id, m.type]));
  const mathToOwner = new Set<string>();
  for (const link of links) {
    if (link.linkKind !== 'data_feed') continue;
    const from = typeById.get(link.fromModuleId);
    const to = typeById.get(link.toModuleId);
    if (from === 'math' && to && to !== 'math') {
      mathToOwner.add(`${link.fromModuleId}->${link.toModuleId}`);
    }
  }
  return links.filter((link) => {
    if (link.linkKind !== 'data_feed') return true;
    const from = typeById.get(link.fromModuleId);
    const to = typeById.get(link.toModuleId);
    if (to === 'math' && from && from !== 'math') {
      return !mathToOwner.has(`${link.toModuleId}->${link.fromModuleId}`);
    }
    return true;
  });
}

function moduleRowToCanvas(row: {
  id: string;
  type: ModuleType;
  name: string;
  generatedNameBase: string;
  nameCustomized: boolean;
  status: ModuleStatus;
  canvasPosition: { x: number; y: number } | null;
  topicSectors: string[];
  capitalAllocationRef: string | null;
  targetExitRef: string | null;
  engineInstanceId: string | null;
  toolOwnerModuleId: string | null;
  topicSectorsOverridden: boolean;
  config?: Record<string, unknown> | null;
}): CanvasModule {
  const position = (row.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number };
  const config = (row.config ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    generatedNameBase: row.generatedNameBase,
    nameCustomized: row.nameCustomized,
    status: row.status,
    position,
    topicSectors: row.topicSectors,
    capitalAllocationRef: row.capitalAllocationRef,
    targetExitRef: row.targetExitRef,
    missingSetupFields: missingModuleSetupFields(row.type, {
      topicSectors: row.topicSectors,
      capitalAllocationRef: row.capitalAllocationRef,
      targetExitRef: row.targetExitRef,
    }),
    engineInstanceId: row.engineInstanceId,
    toolOwnerModuleId: row.toolOwnerModuleId,
    topicSectorsOverridden: row.topicSectorsOverridden,
    config,
    subtypeChip: moduleSubtypeChip(row.type, config, row.generatedNameBase),
  };
}

/**
 * The company canvas (ui-spec §3): modules as nodes in left→right columns,
 * links as validated edges. React Flow owns node state (v12 requires the
 * measured dimensions to round-trip); the server stays the authority via the
 * hardened API. Connections are validated against LINK_RULES client-side for
 * instant feedback and re-validated server-side.
 */
export function CompanyCanvas(props: {
  companyId: string;
  initialModules: CanvasModule[];
  initialEngines: CanvasEngineGroup[];
  initialLinks: CanvasLink[];
  /** Company-level defaults for engine insert cascade (D-176). */
  companyDefaults?: {
    sectorFocuses: string[];
    seedCreditsCents: number;
  };
}) {
  const [deleteEngineId, setDeleteEngineId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [clearCanvasOpen, setClearCanvasOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const clearInFlightRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processModuleId, setProcessModuleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);

  type EngineSetupModules = Array<{
    id: string;
    topicSectors: string[];
    capitalAllocationRef: string | null;
    targetExitRef: string | null;
    topicSectorsOverridden: boolean;
  }>;

  const engineCallbacksRef = useRef<{
    onRequestDelete: (engineId: string) => void;
    onRequestReflow: (engineId: string) => void;
    onEngineSetupSaved: (
      engineId: string,
      engine: {
        masterTopicSectors: string[];
        setupSnapshot?: EngineGroupFlowNode['data']['setupSnapshot'];
        templateInputs?: Record<string, string>;
        capitalAllocationRef?: string | null;
        targetExitRef?: string | null;
      },
      modules: EngineSetupModules,
    ) => void;
  }>({
    onRequestDelete: () => {},
    onRequestReflow: () => {},
    onEngineSetupSaved: () => {},
  });

  const stableEngineCallbacks = useMemo(
    () => ({
      onRequestDelete: (engineId: string) => {
        engineCallbacksRef.current.onRequestDelete(engineId);
      },
      onRequestReflow: (engineId: string) => {
        engineCallbacksRef.current.onRequestReflow(engineId);
      },
      onEngineSetupSaved: (
        engineId: string,
        engine: {
          masterTopicSectors: string[];
          setupSnapshot?: EngineGroupFlowNode['data']['setupSnapshot'];
          templateInputs?: Record<string, string>;
          capitalAllocationRef?: string | null;
          targetExitRef?: string | null;
        },
        modules: EngineSetupModules,
      ) => {
        engineCallbacksRef.current.onEngineSetupSaved(engineId, engine, modules);
      },
    }),
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(
    buildInitialGraph(
      props.initialModules,
      props.initialEngines,
      props.initialLinks,
      props.companyId,
      stableEngineCallbacks,
    ),
  );
  const initialTypeById = useMemo(
    () => new Map(props.initialModules.map((m) => [m.id, m.type] as const)),
    [props.initialModules],
  );
  const [edges, setEdges] = useEdgesState<Edge>([
    ...dedupeMathCalcRefLinks(props.initialLinks, props.initialModules).map((l) =>
      toEdge(l, initialTypeById),
    ),
    ...utilityEdgesFromEngines(props.initialEngines),
    ...buildOptionAnchorArtifacts(props.initialEngines, props.initialModules).edges,
  ]);
  const ownerDragOriginRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const handleRequestDelete = useCallback((engineId: string) => {
    setDeleteEngineId(engineId);
  }, []);

  const handleEngineSetupSaved = useCallback(
    (
      engineId: string,
      engine: {
        masterTopicSectors: string[];
        setupSnapshot?: EngineGroupFlowNode['data']['setupSnapshot'];
        templateInputs?: Record<string, string>;
        capitalAllocationRef?: string | null;
        targetExitRef?: string | null;
      },
      modules: EngineSetupModules,
    ) => {
      const moduleById = new Map(modules.map((m) => [m.id, m]));
      setNodes((current) =>
        current.map((node) => {
          if (isEngineGroupNode(node) && node.id === engineId) {
            return {
              ...node,
              data: {
                ...node.data,
                masterTopicSectors: engine.masterTopicSectors,
                setupSnapshot:
                  engine.setupSnapshot !== undefined
                    ? engine.setupSnapshot
                    : (node.data.setupSnapshot ?? null),
                templateInputs: engine.templateInputs ?? node.data.templateInputs ?? {},
                memberModuleIds: modules.map((m) => m.id),
              },
            };
          }
          if (!isModuleNode(node)) return node;
          const updated = moduleById.get(node.id);
          if (!updated) return node;
          return {
            ...node,
            data: {
              ...node.data,
              topicSectors: updated.topicSectors,
              capitalAllocationRef: updated.capitalAllocationRef,
              targetExitRef: updated.targetExitRef,
              topicSectorsOverridden: updated.topicSectorsOverridden,
              missingSetupFields: missingModuleSetupFields(node.data.moduleType, updated),
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const applyLayoutResult = useCallback(
    (layout: LayoutResult) => {
      setNodes((current) => applyLayoutToNodes(current, layout));
    },
    [setNodes],
  );

  const handleEngineReflow = useCallback(
    async (engineId: string) => {
      let workingNodes = nodes;
      let workingEdges = edges;
      try {
        const provisioned = await api<{ tools: ProvisionedMathClient[] }>(
          `/api/companies/${props.companyId}/math-tools`,
          { method: 'POST', body: { engineId } },
        );
        const appended = appendProvisionedMath(
          workingNodes,
          workingEdges,
          provisioned.tools,
          props.companyId,
        );
        workingNodes = appended.nodes;
        workingEdges = appended.edges;
        if (provisioned.tools.length > 0) {
          setNodes(workingNodes);
          setEdges(workingEdges);
        }
      } catch {
        flash('Could not provision required Math tools.');
        return;
      }

      const engineNode = workingNodes.find(
        (n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id === engineId,
      );
      if (!engineNode) return;

      let layout = reflowEngineAtOrigin(
        {
          id: engineId,
          memberModuleIds: engineNode.data.memberModuleIds,
          templateId: engineNode.data.templateId,
        },
        gatherLayoutModules(workingNodes),
        gatherLayoutLinks(workingEdges),
        { x: engineNode.position.x, y: engineNode.position.y },
        ENGINE_GROUP_PADDING,
      );
      const reflowedBounds = layout.engines[0]?.canvasBounds;
      if (reflowedBounds) {
        const others = workingNodes
          .filter((n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id !== engineId)
          .map(engineBounds);
        const section =
          engineCreateSection(
            getEngineTemplateById(engineNode.data.templateId) ?? {
              id: engineNode.data.templateId,
              label: '',
              category: 'research',
              description: '',
              available: true,
              modules: [],
              links: [],
              inputs: [],
            },
          );
        const clearOrigin = placeNextEngineOrigin(others, reflowedBounds, {
          preferred: { x: reflowedBounds.x, y: reflowedBounds.y },
          section,
        });
        layout = translateLayoutResultToOrigin(layout, engineId, clearOrigin);
      }

      applyLayoutResult(layout);

      try {
        await api(`/api/companies/${props.companyId}/canvas/layout`, {
          method: 'PATCH',
          body: {
            modules: layout.modules,
            engines: layout.engines,
          },
        });
        requestAnimationFrame(() => {
          rfInstanceRef.current?.fitView({ padding: 0.15, maxZoom: 1, minZoom: 0.15 });
        });
      } catch {
        flash('Could not save engine reflow.');
      }
    },
    [nodes, edges, props.companyId, applyLayoutResult, setEdges, setNodes],
  );

  const handleCanvasReflow = useCallback(async () => {
    let workingNodes = nodes;
    let workingEdges = edges;
    try {
      const provisioned = await api<{ tools: ProvisionedMathClient[] }>(
        `/api/companies/${props.companyId}/math-tools`,
        { method: 'POST', body: {} },
      );
      const appended = appendProvisionedMath(
        workingNodes,
        workingEdges,
        provisioned.tools,
        props.companyId,
      );
      workingNodes = appended.nodes;
      workingEdges = appended.edges;
      if (provisioned.tools.length > 0) {
        setNodes(workingNodes);
        setEdges(workingEdges);
      }
    } catch {
      flash('Could not provision required Math tools.');
      return;
    }

    const engineNodes = workingNodes.filter(isEngineGroupNode);
    const layout = layoutCanvas(
      engineNodes.map((n) => ({
        id: n.id,
        memberModuleIds: n.data.memberModuleIds,
        templateId: n.data.templateId,
        dataHubModuleId: resolveDataHubModuleId(n.id, workingNodes),
      })),
      gatherLayoutModules(workingNodes),
      gatherLayoutLinks(workingEdges),
      ENGINE_GROUP_PADDING,
    );

    applyLayoutResult(layout);

    try {
      await api(`/api/companies/${props.companyId}/canvas/layout`, {
        method: 'PATCH',
        body: {
          modules: layout.modules,
          engines: layout.engines,
        },
      });
      requestAnimationFrame(() => {
        rfInstanceRef.current?.fitView({ padding: 0.15, maxZoom: 1, minZoom: 0.15 });
      });
    } catch {
      flash('Could not save canvas reflow.');
    }
  }, [nodes, edges, props.companyId, applyLayoutResult, setEdges, setNodes]);

  engineCallbacksRef.current = {
    onRequestDelete: handleRequestDelete,
    onRequestReflow: handleEngineReflow,
    onEngineSetupSaved: handleEngineSetupSaved,
  };

  useEffect(() => {
    function handleSetupSaved(event: Event) {
      const detail = (
        event as CustomEvent<{
          moduleId: string;
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
          topicSectorsOverridden?: boolean;
          engineInstanceId?: string | null;
        }>
      ).detail;
      setNodes((current) =>
        current.map((node) => {
          if (!isModuleNode(node) || node.id !== detail.moduleId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              topicSectors: detail.topicSectors,
              capitalAllocationRef: detail.capitalAllocationRef,
              targetExitRef: detail.targetExitRef,
              topicSectorsOverridden:
                detail.topicSectorsOverridden ?? node.data.topicSectorsOverridden,
              engineInstanceId:
                detail.engineInstanceId !== undefined
                  ? detail.engineInstanceId
                  : node.data.engineInstanceId,
              missingSetupFields: missingModuleSetupFields(node.data.moduleType, detail),
            },
          };
        }),
      );
    }
    function handleTopicRestored(event: Event) {
      const detail = (
        event as CustomEvent<{
          moduleId: string;
          topicSectors: string[];
          topicSectorsOverridden: boolean;
        }>
      ).detail;
      setNodes((current) =>
        current.map((node) => {
          if (!isModuleNode(node) || node.id !== detail.moduleId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              topicSectors: detail.topicSectors,
              topicSectorsOverridden: detail.topicSectorsOverridden,
              missingSetupFields: missingModuleSetupFields(node.data.moduleType, {
                topicSectors: detail.topicSectors,
                capitalAllocationRef: node.data.capitalAllocationRef,
                targetExitRef: node.data.targetExitRef,
              }),
            },
          };
        }),
      );
    }
    function handleConfigSaved(event: Event) {
      const detail = (
        event as CustomEvent<{
          moduleId: string;
          config: Record<string, unknown>;
        }>
      ).detail;
      setNodes((current) =>
        current.map((node) => {
          if (!isModuleNode(node) || node.id !== detail.moduleId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              config: { ...(node.data.config ?? {}), ...detail.config },
            },
          };
        }),
      );
    }
    window.addEventListener('hftr:module-setup-saved', handleSetupSaved);
    window.addEventListener('hftr:module-topic-restored', handleTopicRestored);
    window.addEventListener('hftr:module-config-saved', handleConfigSaved);
    return () => {
      window.removeEventListener('hftr:module-setup-saved', handleSetupSaved);
      window.removeEventListener('hftr:module-topic-restored', handleTopicRestored);
      window.removeEventListener('hftr:module-config-saved', handleConfigSaved);
    };
  }, [setNodes]);

  // T1.4 / D-077: poll status + type-context projections.
  useEffect(() => {
    let stopped = false;
    async function poll() {
      try {
        const { modules: projections } = await api<{
          modules: {
            moduleId: string;
            statusText: string;
            activeJobs: number;
            budgetQueuedJobs: number;
            typeContext?: ModuleTypeContextProjection;
          }[];
        }>(`/api/companies/${props.companyId}/canvas`);
        if (stopped) return;
        const byId = new Map(projections.map((p) => [p.moduleId, p]));
        setNodes((current) => {
          const next = current.map((n) => {
            if (!isModuleNode(n)) return n;
            const p = byId.get(n.id);
            return p
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    statusText: p.statusText,
                    activeJobs: p.activeJobs,
                    budgetQueuedJobs: p.budgetQueuedJobs,
                    ...(p.typeContext != null ? { typeContext: p.typeContext } : {}),
                  },
                }
              : n;
          });
          setEdges((edges) => {
            const withBindings = mergeTrendBindingEdges(edges, next);
            const active = new Set(
              projections.filter((p) => p.activeJobs > 0).map((p) => p.moduleId),
            );
            return withBindings.map((e) => {
              const animated = active.has(e.source) || active.has(e.target);
              return animated === Boolean(e.animated) ? e : { ...e, animated };
            });
          });
          return next;
        });
      } catch {
        // transient; next poll retries
      }
    }
    void poll();
    const interval = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [props.companyId, setNodes, setEdges]);

  useEffect(() => {
    if (!deleteEngineId || deleteBusy) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDeleteEngineId(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [deleteEngineId, deleteBusy]);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  }

  const persistNodeDragStop = useCallback(
    async (_e: unknown, node: CanvasFlowNode) => {
      if (isEngineGroupNode(node)) {
        const rawBounds = engineBounds(node);
        const others = nodes
          .filter((n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id !== node.id)
          .map(engineBounds);
        const template = getEngineTemplateById(node.data.templateId);
        const section = template ? engineCreateSection(template) : undefined;
        const clearOrigin = placeNextEngineOrigin(others, rawBounds, {
          preferred: { x: rawBounds.x, y: rawBounds.y },
          ...(section ? { section } : {}),
        });
        const bounds: LayoutRect = {
          ...rawBounds,
          x: clearOrigin.x,
          y: clearOrigin.y,
        };
        const dx = bounds.x - rawBounds.x;
        const dy = bounds.y - rawBounds.y;
        if (dx !== 0 || dy !== 0) {
          setNodes((current) =>
            current.map((n) => {
              if (isEngineGroupNode(n) && n.id === node.id) {
                return {
                  ...n,
                  position: { x: bounds.x, y: bounds.y },
                  style: { ...n.style, width: bounds.width, height: bounds.height },
                };
              }
              return n;
            }),
          );
        }
        try {
          await api(`/api/companies/${props.companyId}/engines/${node.id}`, {
            method: 'PATCH',
            body: {
              canvasBounds: {
                x: Math.round(bounds.x),
                y: Math.round(bounds.y),
                width: Math.round(bounds.width),
                height: Math.round(bounds.height),
              },
            },
          });
        } catch {
          flash('Could not save engine group bounds.');
        }
        return;
      }

      if (isMathToolNode(node)) {
        try {
          const abs = absoluteModulePosition(node, nodes);
          await api(`/api/companies/${props.companyId}/modules/${node.id}`, {
            method: 'PATCH',
            body: { canvasPosition: { x: Math.round(abs.x), y: Math.round(abs.y) } },
          });
        } catch {
          flash('Could not save Math tool position.');
        }
        return;
      }

      if (!isModuleNode(node)) return;
      if (node.data.moduleType === 'math') {
        try {
          const abs = absoluteModulePosition(node, nodes);
          await api(`/api/companies/${props.companyId}/modules/${node.id}`, {
            method: 'PATCH',
            body: {
              canvasPosition: { x: Math.round(abs.x), y: Math.round(abs.y) },
            },
          });
        } catch {
          flash('Could not save position.');
        }
        return;
      }

      const abs = absoluteModulePosition(node, nodes);
      const engineNodes = nodes.filter(isEngineGroupNode);
      const targetEngineId = findEngineAtPoint(abs, engineNodes);
      const currentEngineId = node.data.engineInstanceId;

      try {
        await api(`/api/companies/${props.companyId}/modules/${node.id}`, {
          method: 'PATCH',
          body: {
            canvasPosition: { x: Math.round(abs.x), y: Math.round(abs.y) },
            ...(targetEngineId !== currentEngineId ? { engineInstanceId: targetEngineId } : {}),
          },
        });

        const dedicatedTools = nodes.filter(
          (candidate): candidate is MathToolFlowNode =>
            isMathToolNode(candidate) && candidate.data.ownerModuleId === node.id,
        );
        // Persist current tool positions (already coupled via drag delta) —
        // do not snap tools back under the owner.
        for (const tool of dedicatedTools) {
          const toolAbs = absoluteModulePosition(tool, nodes);
          await api(`/api/companies/${props.companyId}/modules/${tool.id}`, {
            method: 'PATCH',
            body: {
              canvasPosition: {
                x: Math.round(toolAbs.x),
                y: Math.round(toolAbs.y),
              },
            },
          });
        }

        if (targetEngineId !== currentEngineId) {
          setNodes((current) => {
            const engineNode = current.find(
              (n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id === targetEngineId,
            );
            const parentBounds = engineNode ? engineBounds(engineNode) : null;
            const next = syncDedicatedMathParents(
              current.map((n) => {
                if (!isModuleNode(n) || n.id !== node.id) return n;
                if (!targetEngineId || !parentBounds) {
                  const { parentId: _parent, ...rest } = n;
                  return {
                    ...rest,
                    position: abs,
                    expandParent: false,
                    data: {
                      ...n.data,
                      engineInstanceId: null,
                    },
                  };
                }
                return {
                  ...n,
                  parentId: targetEngineId,
                  position: {
                    x: abs.x - parentBounds.x,
                    y: abs.y - parentBounds.y,
                  },
                  expandParent: false,
                  data: {
                    ...n.data,
                    engineInstanceId: targetEngineId,
                  },
                };
              }),
            );
            const synced = withSyncedOptionAnchors(next);
            setEdges((edges) => mergeDecorativeEdges(edges, synced.nodes));
            return synced.nodes;
          });
        } else {
          setNodes((current) => {
            const synced = withSyncedOptionAnchors(current);
            setEdges((edges) => mergeDecorativeEdges(edges, synced.nodes));
            return synced.nodes;
          });
        }
      } catch {
        flash('Could not save position.');
      }
    },
    [nodes, props.companyId, setNodes, setEdges],
  );

  const onOwnerDragStart = useCallback((_e: unknown, node: CanvasFlowNode) => {
    if (!isModuleNode(node) || node.data.moduleType === 'math') return;
    ownerDragOriginRef.current.set(node.id, { x: node.position.x, y: node.position.y });
  }, []);

  const onOwnerDrag = useCallback(
    (_e: unknown, node: CanvasFlowNode) => {
      if (!isModuleNode(node) || node.data.moduleType === 'math') return;
      const prev = ownerDragOriginRef.current.get(node.id);
      if (!prev) return;
      const dx = node.position.x - prev.x;
      const dy = node.position.y - prev.y;
      if (dx === 0 && dy === 0) return;
      ownerDragOriginRef.current.set(node.id, { x: node.position.x, y: node.position.y });
      setNodes((current) =>
        current.map((candidate) => {
          if (isMathToolNode(candidate) && candidate.data.ownerModuleId === node.id) {
            return {
              ...candidate,
              position: {
                x: candidate.position.x + dx,
                y: candidate.position.y + dy,
              },
            };
          }
          if (
            isOptionAnchorNode(candidate) &&
            candidate.data.ownerModuleId === node.id &&
            candidate.parentId === node.parentId
          ) {
            return {
              ...candidate,
              position: {
                x: candidate.position.x + dx,
                y: candidate.position.y + dy,
              },
            };
          }
          return candidate;
        }),
      );
    },
    [setNodes],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      const from = nodes.find((n) => n.id === connection.source);
      const to = nodes.find((n) => n.id === connection.target);
      if (!from || !to) return;

      const sourceUtil = parseEngineUtilityHandle(connection.sourceHandle);
      const targetUtil = parseEngineUtilityHandle(connection.targetHandle);

      // D-091: engine data_out → peer data_in (or system_control cascade).
      if (
        isEngineGroupNode(from) &&
        isEngineGroupNode(to) &&
        sourceUtil?.direction === 'out' &&
        targetUtil?.direction === 'in'
      ) {
        if (from.id === to.id) {
          flash('An engine cannot link to itself.');
          return;
        }
        if (sourceUtil.bus === 'data_out' && targetUtil.bus !== 'data_in') {
          flash('Connect Data out to Data in.');
          return;
        }
        if (sourceUtil.bus === 'system_control' && targetUtil.bus !== 'system_control') {
          flash('Connect Control out to Control in.');
          return;
        }
        try {
          const { utilityLink } = await api<{
            utilityLink: {
              id: string;
              bus: EngineUtilityBus;
              fromEngineId?: string | null;
              fromModuleId?: string | null;
              streamId?: string | null;
              streamDescriptor?: string | null;
            };
          }>(`/api/companies/${props.companyId}/engine-utility-links`, {
            method: 'POST',
            body: {
              toEngineId: to.id,
              bus: targetUtil.bus,
              fromEngineId: from.id,
            },
          });
          setNodes((current) => {
            const withLink = appendUtilityLinkToEngineNodes(current, to.id, utilityLink);
            setEdges((edges) => {
              const edge = toUtilityEdge({ ...utilityLink, toEngineId: to.id });
              const next = edge ? [...edges, edge] : edges;
              return mergeUtilityEdgesFromNodes(next, withLink);
            });
            return withLink;
          });
        } catch {
          flash('Could not create engine utility link.');
        }
        return;
      }

      // D-091: company module → engine utility bus (clock / funds / data_in).
      if (isGraphModuleNode(from) && isEngineGroupNode(to) && targetUtil?.direction === 'in') {
        const moduleType = from.data.moduleType;
        const bus = targetUtil.bus;
        if (bus === 'clock' && moduleType !== 'clock') {
          flash('Only Master Clock can bind to the Clock utility.');
          return;
        }
        if (bus === 'funds' && moduleType !== 'holding_fund' && moduleType !== 'math') {
          flash('Funds utility accepts Holding Fund or Math.');
          return;
        }
        if (
          bus === 'data_in' &&
          moduleType !== 'library' &&
          moduleType !== 'live_api' &&
          moduleType !== 'research' &&
          moduleType !== 'librarian'
        ) {
          flash('Data in accepts library, live API, research, or librarian modules.');
          return;
        }
        if (bus === 'data_out') {
          flash('Data out is an engine export port — connect from it, not to it.');
          return;
        }
        try {
          const { utilityLink } = await api<{
            utilityLink: {
              id: string;
              bus: EngineUtilityBus;
              fromEngineId?: string | null;
              fromModuleId?: string | null;
              streamId?: string | null;
              streamDescriptor?: string | null;
            };
          }>(`/api/companies/${props.companyId}/engine-utility-links`, {
            method: 'POST',
            body: {
              toEngineId: to.id,
              bus,
              fromModuleId: from.id,
            },
          });
          setNodes((current) => {
            const withLink = appendUtilityLinkToEngineNodes(current, to.id, utilityLink);
            setEdges((edges) => {
              const edge = toUtilityEdge({ ...utilityLink, toEngineId: to.id });
              const next = edge ? [...edges, edge] : edges;
              return mergeUtilityEdgesFromNodes(next, withLink);
            });
            return withLink;
          });
        } catch {
          flash('Could not bind that module to the engine utility.');
        }
        return;
      }

      if (!isGraphModuleNode(from) || !isGraphModuleNode(to)) return;

      const fromHub = isEngineDataHubConfig(moduleConfigRecord(from));
      const toHub = isEngineDataHubConfig(moduleConfigRecord(to));
      if (fromHub || toHub) {
        flash('Connect Data Hub via the engine Data in port (motherboard), not module links.');
        return;
      }
      const fromEngine = from.data.engineInstanceId;
      const toEngine = to.data.engineInstanceId;
      if (fromEngine && toEngine && fromEngine !== toEngine) {
        flash('Cross-engine links use engine Data out → Data in (motherboard).');
        return;
      }
      if (
        ((!fromEngine && toEngine) || (fromEngine && !toEngine)) &&
        !(isMathToolNode(from) || isMathToolNode(to))
      ) {
        flash('Attach free libraries to the engine Data in port.');
        return;
      }

      const trendCandidateId = parseTrendCandidateHandle(connection.sourceHandle);
      if (trendCandidateId) {
        if (!isModuleNode(from) || from.data.moduleType !== 'trend') {
          flash('Trend item ports only apply on Trend cards.');
          return;
        }
        if (!isModuleNode(to) || to.data.moduleType !== 'trading') {
          flash('Connect a trend item to a trading module.');
          return;
        }
        try {
          const { trend } = await api<{
            trend: {
              id: string;
              engineInstanceId: string | null;
              tradingModuleId: string | null;
            };
          }>(`/api/companies/${props.companyId}/trends/${trendCandidateId}`, {
            method: 'PATCH',
            body: {
              tradingModuleId: to.id,
              engineInstanceId: to.data.engineInstanceId,
            },
          });
          setNodes((current) => {
            const next = current.map((node) => {
              if (!isModuleNode(node) || node.id !== from.id) return node;
              const prevCtx = node.data.typeContext;
              if (prevCtx?.kind !== 'trend') return node;
              return {
                ...node,
                data: {
                  ...node.data,
                  typeContext: {
                    ...prevCtx,
                    trends: prevCtx.trends.map((row) =>
                      row.id === trend.id
                        ? {
                            ...row,
                            engineInstanceId: trend.engineInstanceId,
                            tradingModuleId: trend.tradingModuleId,
                          }
                        : row,
                    ),
                  },
                },
              };
            });
            setEdges((edges) => mergeTrendBindingEdges(edges, next));
            return next;
          });
        } catch {
          flash('Could not bind that trend to the trading module.');
        }
        return;
      }

      const linkKind = edgeKindForHandles(
        connection.sourceHandle,
        connection.targetHandle,
        from.data.moduleType,
        to.data.moduleType,
      );
      const allowed = allowedLinkKinds(from.data.moduleType, to.data.moduleType);
      if (!linkKind || !allowed.includes(linkKind)) {
        flash(`${from.data.moduleType} → ${to.data.moduleType} is not a valid connection.`);
        return;
      }
      if (
        !isLegalStreamPortPair({
          fromType: from.data.moduleType,
          toType: to.data.moduleType,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          linkKind,
        })
      ) {
        flash('That port pair is not allowed (time outs require Clock in).');
        return;
      }
      try {
        const { link, renamedModules } = await api<{
          link: CanvasLink;
          renamedModules: ModuleNameUpdate[];
        }>(`/api/companies/${props.companyId}/links`, {
          method: 'POST',
          body: {
            fromModuleId: from.id,
            toModuleId: to.id,
            linkKind,
            sourceHandle: connection.sourceHandle ?? undefined,
            targetHandle: connection.targetHandle ?? undefined,
          },
        });
        setEdges((current) => {
          const next = [
            ...current,
            toEdge(link, new Map([[from.id, from.data.moduleType], [to.id, to.data.moduleType]])),
          ];
          setNodes((nodeState) =>
            applyMathAttachments(applyRenamedModules(nodeState, renamedModules ?? []), next),
          );
          return next;
        });
      } catch (err) {
        flash(
          err instanceof RequestError && err.code === 'link_already_exists'
            ? 'That link already exists.'
            : err instanceof RequestError && err.code === 'port_slot_not_allowed'
              ? 'That port pair is not allowed (time outs require Clock in).'
              : 'Link rejected by the server.',
        );
      }
    },
    [nodes, props.companyId, setEdges, setNodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceId = 'source' in connection ? connection.source : null;
      const targetId = 'target' in connection ? connection.target : null;
      if (!sourceId || !targetId) return false;
      const from = nodes.find((n) => n.id === sourceId);
      const to = nodes.find((n) => n.id === targetId);
      if (!from || !to) return false;
      const sourceUtil = parseEngineUtilityHandle(
        'sourceHandle' in connection ? connection.sourceHandle : null,
      );
      const targetUtil = parseEngineUtilityHandle(
        'targetHandle' in connection ? connection.targetHandle : null,
      );
      if (isEngineGroupNode(from) && isEngineGroupNode(to)) {
        if (from.id === to.id) return false;
        return (
          sourceUtil?.direction === 'out' &&
          targetUtil?.direction === 'in' &&
          ((sourceUtil.bus === 'data_out' && targetUtil.bus === 'data_in') ||
            (sourceUtil.bus === 'system_control' && targetUtil.bus === 'system_control'))
        );
      }
      if (isGraphModuleNode(from) && isEngineGroupNode(to) && targetUtil?.direction === 'in') {
        const moduleType = from.data.moduleType;
        if (targetUtil.bus === 'clock') return moduleType === 'clock';
        if (targetUtil.bus === 'funds') {
          return moduleType === 'holding_fund' || moduleType === 'math';
        }
        if (targetUtil.bus === 'data_in') {
          return (
            moduleType === 'library' ||
            moduleType === 'live_api' ||
            moduleType === 'research' ||
            moduleType === 'librarian'
          );
        }
        if (targetUtil.bus === 'system_control') return true;
        return false;
      }
      if (!isGraphModuleNode(from) || !isGraphModuleNode(to)) return false;
      // D-159: hub and cross-engine data only via motherboard utility edges.
      const fromHub = isEngineDataHubConfig(moduleConfigRecord(from));
      const toHub = isEngineDataHubConfig(moduleConfigRecord(to));
      if (fromHub || toHub) return false;
      const fromEngine = from.data.engineInstanceId;
      const toEngine = to.data.engineInstanceId;
      if (fromEngine && toEngine && fromEngine !== toEngine) return false;
      if ((!fromEngine && toEngine) || (fromEngine && !toEngine)) {
        // Free module ↔ engine member: reject (use engine data_in / chrome instead).
        // Exception: dedicated Math tools stay attachable to their owner (same visual family).
        if (!(isMathToolNode(from) || isMathToolNode(to))) return false;
      }
      if (parseTrendCandidateHandle(connection.sourceHandle)) {
        return (
          isModuleNode(from) &&
          from.data.moduleType === 'trend' &&
          isModuleNode(to) &&
          to.data.moduleType === 'trading'
        );
      }
      const linkKind = edgeKindForHandles(
        connection.sourceHandle,
        connection.targetHandle,
        from.data.moduleType,
        to.data.moduleType,
      );
      if (!linkKind) return false;
      if (!allowedLinkKinds(from.data.moduleType, to.data.moduleType).includes(linkKind)) {
        return false;
      }
      return isLegalStreamPortPair({
        fromType: from.data.moduleType,
        toType: to.data.moduleType,
        sourceHandle: 'sourceHandle' in connection ? connection.sourceHandle : null,
        targetHandle: 'targetHandle' in connection ? connection.targetHandle : null,
        linkKind,
      });
    },
    [nodes],
  );

  const addModule = useCallback(
    async (type: ModuleType, name: string, config: unknown) => {
      const column = MODULE_COLUMN[type];
      const moduleNodes = nodes.filter(isModuleNode);
      const inColumn = moduleNodes.filter(
        (n) => MODULE_COLUMN[n.data.moduleType] === column,
      ).length;
      const position = {
        x: CANVAS_LAYOUT.originX + column * LAYOUT_COLUMN_STEP,
        y: CANVAS_LAYOUT.originY + inColumn * LAYOUT_ROW_STEP,
      };
      try {
        const { module, dedicatedMath } = await api<{
          module: {
            id: string;
            name: string;
            generatedNameBase: string;
            nameCustomized: boolean;
            topicSectors: string[];
            capitalAllocationRef: string | null;
            targetExitRef: string | null;
          };
          dedicatedMath: Array<{
            id: string;
            ownerModuleId: string;
            position: { x: number; y: number };
            links: CanvasLink[];
          }>;
        }>(`/api/companies/${props.companyId}/modules`, {
          method: 'POST',
          body: { type, name, config, canvasPosition: position },
        });
        setNodes((current) => [
          ...current,
          toModuleNode(
            {
              id: module.id,
              type,
              name: module.name,
              generatedNameBase: module.generatedNameBase,
              nameCustomized: module.nameCustomized,
              status: 'draft',
              position,
              topicSectors: module.topicSectors,
              capitalAllocationRef: module.capitalAllocationRef,
              targetExitRef: module.targetExitRef,
              missingSetupFields: missingModuleSetupFields(type, {
                topicSectors: module.topicSectors,
                capitalAllocationRef: module.capitalAllocationRef,
                targetExitRef: module.targetExitRef,
              }),
              engineInstanceId: null,
              toolOwnerModuleId: null,
              topicSectorsOverridden: false,
              config: (config && typeof config === 'object'
                ? (config as Record<string, unknown>)
                : {}) as Record<string, unknown>,
            },
            props.companyId,
          ),
          ...dedicatedMath.map((tool): MathToolFlowNode => ({
            id: tool.id,
            type: 'mathTool',
            position: tool.position,
            expandParent: false,
            draggable: true,
            data: {
              name: `Math · ${module.name}`,
              companyId: props.companyId,
              moduleType: 'math',
              engineInstanceId: null,
              toolOwnerModuleId: module.id,
              ownerEngineInstanceId: null,
              ownerModuleId: module.id,
              ownerName: module.name,
            },
          })),
        ]);
        setEdges((current) => [
          ...current,
          ...dedicatedMath.flatMap((tool) => tool.links.map((l) => toEdge(l))),
        ]);
        setSelectedId(module.id);
      } catch (err) {
        flash(
          err instanceof RequestError && err.code === 'clock_singleton'
            ? 'Master Clock already exists for this company.'
            : err instanceof RequestError && err.code === 'invalid_input'
              ? 'Module config is invalid.'
              : 'Could not create module.',
        );
      }
    },
    [nodes, props.companyId, setEdges, setNodes],
  );

  const insertEngine = useCallback(
    async (
      engine: EngineTemplate,
      inputs: Record<string, string>,
      setup?: ModuleSetupInput,
      options?: {
        cascadeFromCompany?: boolean;
        simulationBinding?: import('@hftr/contracts').SimulationEngineBinding;
      },
    ) => {
      const cascadeFromCompany = options?.cascadeFromCompany !== false;
      const present = new Set(
        nodes.filter(isEngineGroupNode).map((node) => node.data.templateId),
      );
      const queue: Array<{
        template: EngineTemplate;
        inputs: Record<string, string>;
        simulationBinding?: import('@hftr/contracts').SimulationEngineBinding;
      }> = [];
      if (engineCreateSection(engine) === 'execution') {
        for (const depId of researchDependenciesForExecutionEngine(engine.id)) {
          if (present.has(depId)) continue;
          const dep = ENGINE_TEMPLATES.find((item) => item.id === depId);
          if (!dep?.available) continue;
          queue.push({ template: dep, inputs: {} });
          present.add(depId);
        }
      }
      queue.push({
        template: engine,
        inputs,
        ...(options?.simulationBinding
          ? { simulationBinding: options.simulationBinding }
          : {}),
      });

      // After the parent exec is inserted, child sims are queued with its id.
      const pendingSimDeps =
        engineCreateSection(engine) === 'execution'
          ? simDependenciesForExecutionEngine(engine.id, DEFAULT_EXECUTION_SIM_COUNT).filter(
              (dep) => {
                if (present.has(dep.templateId)) return false;
                const depTemplate = ENGINE_TEMPLATES.find((item) => item.id === dep.templateId);
                return Boolean(depTemplate?.available);
              },
            )
          : [];

      let workingNodes = nodes;
      let workingEdges = edges;
      const insertedLabels: string[] = [];
      let insertedExecutionId: string | null = null;

      try {
        for (const item of queue) {
          const occupied = workingNodes.filter(isEngineGroupNode).map(engineBounds);
          const templatePositions = item.template.modules.map((module) => module.position);
          const relativeBounds = computeEngineBoundsFromPositions(templatePositions);
          const section = engineCreateSection(item.template);
          const researchNodes = workingNodes.filter(
            (n): n is EngineGroupFlowNode =>
              isEngineGroupNode(n) &&
              (() => {
                const t = getEngineTemplateById(n.data.templateId);
                return t ? engineCreateSection(t) === 'research' : false;
              })(),
          );
          const lastResearch = researchNodes.at(-1);
          const origin = placeNextEngineOrigin(occupied, relativeBounds, {
            originX: CANVAS_LAYOUT.originX,
            originY: CANVAS_LAYOUT.originY,
            section,
            ...(section === 'execution' && lastResearch
              ? { familyAnchor: engineBounds(lastResearch) }
              : {}),
          });
          const { offset } = engineCanvasOffsetForOrigin(
            templatePositions,
            origin,
            ENGINE_GROUP_PADDING,
          );

          const response = await api<{
            engine: {
              id: string;
              templateId: string;
              label: string;
              masterTopicSectors: string[];
              capitalAllocationRef?: string | null;
              targetExitRef?: string | null;
              setupSnapshot?: CanvasEngineGroup['setupSnapshot'];
              templateInputs?: Record<string, string>;
              canvasBounds: { x: number; y: number; width: number; height: number } | null;
              memberModuleIds: string[];
            };
            modules: Array<{
              id: string;
              type: ModuleType;
              name: string;
              generatedNameBase: string;
              nameCustomized: boolean;
              status: ModuleStatus;
              canvasPosition: { x: number; y: number } | null;
              topicSectors: string[];
              topicSectorsOverridden?: boolean;
              capitalAllocationRef?: string | null;
              targetExitRef?: string | null;
              config: unknown;
              engineInstanceId: string | null;
            }>;
            links: Array<{
              id: string;
              fromModuleId: string;
              toModuleId: string;
              linkKind: LinkKind;
            }>;
            familyLayout?: {
              modules: Array<{ id: string; canvasPosition: { x: number; y: number } }>;
              engines: Array<{
                id: string;
                canvasBounds: { x: number; y: number; width: number; height: number };
              }>;
            } | null;
            utilityLinks?: Array<{
              id: string;
              toEngineId: string;
              bus: EngineUtilityBus;
              fromEngineId?: string | null;
              fromModuleId?: string | null;
              streamId?: string | null;
              streamDescriptor?: string | null;
            }>;
          }>(`/api/companies/${props.companyId}/engines`, {
            method: 'POST',
            body: {
              templateId: item.template.id,
              inputs: item.inputs,
              setup,
              cascadeFromCompany,
              canvasOffset: offset,
              ...(item.simulationBinding
                ? { simulationBinding: item.simulationBinding }
                : {}),
            },
          });

          if (engineCreateSection(item.template) === 'execution') {
            insertedExecutionId = response.engine.id;
          }
          insertedLabels.push(response.engine.label);

          const bounds =
            response.engine.canvasBounds ??
            computeEngineBoundsFromPositions(
              response.modules
                .filter((m) => m.engineInstanceId === response.engine.id && m.type !== 'math')
                .map((m) => (m.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number }),
            );

          const utilityLinks = (response.utilityLinks ?? []).map((link) => ({
            ...link,
            toEngineId: link.toEngineId,
          }));
          const newModuleEdges = response.links.map((l) => toEdge(l));
          const insertedNodes = buildInitialGraph(
            response.modules.map((row) =>
              moduleRowToCanvas({
                ...row,
                capitalAllocationRef: row.capitalAllocationRef ?? null,
                targetExitRef: row.targetExitRef ?? null,
                toolOwnerModuleId: null,
                topicSectorsOverridden: row.topicSectorsOverridden ?? false,
                config: (row.config ?? {}) as Record<string, unknown>,
              }),
            ),
            [
              {
                id: response.engine.id,
                templateId: response.engine.templateId,
                label: response.engine.label,
                masterTopicSectors: response.engine.masterTopicSectors,
                capitalAllocationRef: response.engine.capitalAllocationRef ?? null,
                targetExitRef: response.engine.targetExitRef ?? null,
                setupSnapshot: response.engine.setupSnapshot ?? null,
                templateInputs: response.engine.templateInputs ?? item.inputs,
                canvasBounds: bounds,
                memberModuleIds: response.engine.memberModuleIds,
                utilityLinks: utilityLinks.filter((link) => link.toEngineId === response.engine.id),
              },
            ],
            response.links,
            props.companyId,
            stableEngineCallbacks,
          );

          const allEdges = [...workingEdges, ...newModuleEdges];
          workingNodes = applyUtilityLinksToEngineNodes(
            applyMathAttachments([...workingNodes, ...insertedNodes], allEdges),
            utilityLinks,
          );

          // Prefer server D-159 family layout (already persisted); avoid fighting it
          // with a single-engine reflow that stacks exec below research.
          if (response.familyLayout) {
            workingNodes = applyLayoutToNodes(workingNodes, response.familyLayout);
          }
          workingEdges = mergeUtilityEdgesFromNodes(allEdges, workingNodes);
        }

        // D-189: default child sims after parent execution is known.
        if (insertedExecutionId && pendingSimDeps.length > 0) {
          for (const simDep of pendingSimDeps) {
            const simTemplate = ENGINE_TEMPLATES.find((item) => item.id === simDep.templateId);
            if (!simTemplate?.available) continue;
            const occupied = workingNodes.filter(isEngineGroupNode).map(engineBounds);
            const templatePositions = simTemplate.modules.map((module) => module.position);
            const relativeBounds = computeEngineBoundsFromPositions(templatePositions);
            const origin = placeNextEngineOrigin(occupied, relativeBounds, {
              originX: CANVAS_LAYOUT.originX,
              originY: CANVAS_LAYOUT.originY,
              section: 'simulation',
            });
            const { offset } = engineCanvasOffsetForOrigin(
              templatePositions,
              origin,
              ENGINE_GROUP_PADDING,
            );
            const simResponse = await api<{
              engine: {
                id: string;
                templateId: string;
                label: string;
                masterTopicSectors: string[];
                capitalAllocationRef?: string | null;
                targetExitRef?: string | null;
                setupSnapshot?: CanvasEngineGroup['setupSnapshot'];
                templateInputs?: Record<string, string>;
                canvasBounds: { x: number; y: number; width: number; height: number } | null;
                memberModuleIds: string[];
              };
              modules: Array<{
                id: string;
                type: ModuleType;
                name: string;
                generatedNameBase: string;
                nameCustomized: boolean;
                status: ModuleStatus;
                canvasPosition: { x: number; y: number } | null;
                topicSectors: string[];
                topicSectorsOverridden?: boolean;
                capitalAllocationRef?: string | null;
                targetExitRef?: string | null;
                config: unknown;
                engineInstanceId: string | null;
              }>;
              links: Array<{
                id: string;
                fromModuleId: string;
                toModuleId: string;
                linkKind: LinkKind;
              }>;
              familyLayout?: {
                modules: Array<{ id: string; canvasPosition: { x: number; y: number } }>;
                engines: Array<{
                  id: string;
                  canvasBounds: { x: number; y: number; width: number; height: number };
                }>;
              } | null;
              utilityLinks?: Array<{
                id: string;
                toEngineId: string;
                bus: EngineUtilityBus;
                fromEngineId?: string | null;
                fromModuleId?: string | null;
                streamId?: string | null;
                streamDescriptor?: string | null;
              }>;
            }>(`/api/companies/${props.companyId}/engines`, {
              method: 'POST',
              body: {
                templateId: simTemplate.id,
                inputs: {},
                setup,
                cascadeFromCompany,
                canvasOffset: offset,
                simulationBinding: {
                  role: simulationRoleForPlacement(simDep.placement),
                  placement: simDep.placement,
                  parentExecutionEngineId: insertedExecutionId,
                  mimicParent: true,
                },
              },
            });
            insertedLabels.push(simResponse.engine.label);
            const simBounds =
              simResponse.engine.canvasBounds ??
              computeEngineBoundsFromPositions(
                simResponse.modules
                  .filter(
                    (m) => m.engineInstanceId === simResponse.engine.id && m.type !== 'math',
                  )
                  .map((m) => (m.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number }),
              );
            const utilityLinks = (simResponse.utilityLinks ?? []).map((link) => ({
              ...link,
              toEngineId: link.toEngineId,
            }));
            const newModuleEdges = simResponse.links.map((l) => toEdge(l));
            const insertedNodes = buildInitialGraph(
              simResponse.modules.map((row) =>
                moduleRowToCanvas({
                  ...row,
                  capitalAllocationRef: row.capitalAllocationRef ?? null,
                  targetExitRef: row.targetExitRef ?? null,
                  toolOwnerModuleId: null,
                  topicSectorsOverridden: row.topicSectorsOverridden ?? false,
                  config: (row.config ?? {}) as Record<string, unknown>,
                }),
              ),
              [
                {
                  id: simResponse.engine.id,
                  templateId: simResponse.engine.templateId,
                  label: simResponse.engine.label,
                  masterTopicSectors: simResponse.engine.masterTopicSectors,
                  capitalAllocationRef: simResponse.engine.capitalAllocationRef ?? null,
                  targetExitRef: simResponse.engine.targetExitRef ?? null,
                  setupSnapshot: simResponse.engine.setupSnapshot ?? null,
                  templateInputs: simResponse.engine.templateInputs ?? {},
                  canvasBounds: simBounds,
                  memberModuleIds: simResponse.engine.memberModuleIds,
                  utilityLinks: utilityLinks.filter(
                    (link) => link.toEngineId === simResponse.engine.id,
                  ),
                },
              ],
              simResponse.links,
              props.companyId,
              stableEngineCallbacks,
            );
            const allEdges = [...workingEdges, ...newModuleEdges];
            workingNodes = applyUtilityLinksToEngineNodes(
              applyMathAttachments([...workingNodes, ...insertedNodes], allEdges),
              utilityLinks,
            );
            if (simResponse.familyLayout) {
              workingNodes = applyLayoutToNodes(workingNodes, simResponse.familyLayout);
            }
            workingEdges = mergeUtilityEdgesFromNodes(allEdges, workingNodes);
          }
        }

        // Final client family reflow so local node graph matches research|hub|exec.
        const engineNodes = workingNodes.filter(isEngineGroupNode);
        const familyLayout = layoutCanvas(
          engineNodes.map((n) => ({
            id: n.id,
            memberModuleIds: n.data.memberModuleIds,
            templateId: n.data.templateId,
            dataHubModuleId: resolveDataHubModuleId(n.id, workingNodes),
          })),
          gatherLayoutModules(workingNodes),
          gatherLayoutLinks(workingEdges),
          ENGINE_GROUP_PADDING,
        );
        workingNodes = applyLayoutToNodes(workingNodes, familyLayout);
        workingEdges = mergeUtilityEdgesFromNodes(workingEdges, workingNodes);
        try {
          await api(`/api/companies/${props.companyId}/canvas/layout`, {
            method: 'PATCH',
            body: {
              modules: familyLayout.modules,
              engines: familyLayout.engines,
            },
          });
        } catch {
          // Insert succeeded; Canvas Reflow can still persist spacing.
        }

        setNodes(workingNodes);
        setEdges(workingEdges);
        requestAnimationFrame(() => {
          rfInstanceRef.current?.fitView({ padding: 0.15, maxZoom: 1, minZoom: 0.15 });
        });
        flash(
          insertedLabels.length > 1
            ? `${insertedLabels.join(' + ')} inserted — activate modules to start.`
            : `${engine.label} inserted — activate its modules to start.`,
        );
      } catch {
        flash('Engine insert failed.');
        throw new Error('engine_insert_failed');
      }
    },
    [nodes, edges, props.companyId, setNodes, setEdges, stableEngineCallbacks],
  );

  const confirmClearCanvas = useCallback(async () => {
    if (clearInFlightRef.current) return;
    const snapshot = nodes;
    const engineIds = snapshot.filter(isEngineGroupNode).map((node) => node.id);
    const moduleIds = snapshot.filter(isGraphModuleNode).map((node) => node.id);
    if (engineIds.length === 0 && moduleIds.length === 0) {
      setNodes([]);
      setEdges([]);
      setSelectedId(null);
      setClearCanvasOpen(false);
      flash('Canvas is already empty.');
      return;
    }

    clearInFlightRef.current = true;
    setClearBusy(true);
    try {
      for (const engineId of engineIds) {
        try {
          await api(`/api/companies/${props.companyId}/engines/${engineId}`, {
            method: 'DELETE',
            body: { mode: 'cascade' },
          });
        } catch (error) {
          if (error instanceof RequestError && error.status === 404) continue;
          throw error;
        }
      }

      for (const moduleId of moduleIds) {
        try {
          await api(`/api/companies/${props.companyId}/modules/${moduleId}`, {
            method: 'DELETE',
          });
        } catch (error) {
          // Cascade or concurrent delete already removed the row.
          if (error instanceof RequestError && error.status === 404) continue;
          throw error;
        }
      }

      setNodes([]);
      setEdges([]);
      setSelectedId(null);
      setClearCanvasOpen(false);
      flash('Canvas cleared.');
    } catch {
      flash('Could not clear the canvas.');
    } finally {
      clearInFlightRef.current = false;
      setClearBusy(false);
    }
  }, [nodes, props.companyId, setNodes, setEdges]);

  const cancelClearCanvas = useCallback(() => {
    if (!clearBusy) setClearCanvasOpen(false);
  }, [clearBusy]);

  const confirmDeleteEngine = useCallback(
    async (mode: DeleteEngineMode) => {
      if (!deleteEngineId) return;
      setDeleteBusy(true);
      try {
        const response = await api<{
          deleted: true;
          mode: DeleteEngineMode;
          deletedModuleIds: string[];
          renamedModules: ModuleNameUpdate[];
        }>(`/api/companies/${props.companyId}/engines/${deleteEngineId}`, {
          method: 'DELETE',
          body: { mode },
        });

        const deletedIds = new Set(response.deletedModuleIds);
        const deletedToolIds = new Set(
          nodes
            .filter(
              (node): node is MathToolFlowNode =>
                isMathToolNode(node) && deletedIds.has(node.data.ownerModuleId),
            )
            .map((node) => node.id),
        );
        setNodes((current) => {
          const remaining = current
            .filter(
              (n) =>
                n.id !== deleteEngineId &&
                !deletedIds.has(n.id) &&
                !(response.mode === 'cascade' && deletedToolIds.has(n.id)),
            )
            .map((n) => {
              if (isMathToolNode(n) && n.data.ownerEngineInstanceId === deleteEngineId) {
                const abs = absoluteModulePosition(n, current);
                const { parentId: _parent, ...rest } = n;
                return {
                  ...rest,
                  position: abs,
                  data: { ...n.data, ownerEngineInstanceId: null },
                };
              }
              if (!isModuleNode(n)) return n;
              if (n.data.engineInstanceId === deleteEngineId) {
                const abs = absoluteModulePosition(n, current);
                const { parentId: _parent, ...rest } = n;
                return {
                  ...rest,
                  position: abs,
                  expandParent: false,
                  data: { ...n.data, engineInstanceId: null },
                };
              }
              return n;
            });
          return applyRenamedModules(remaining, response.renamedModules ?? []);
        });
        if (response.mode === 'cascade') {
          setEdges((current) =>
            current.filter(
              (e) =>
                !deletedIds.has(e.source) &&
                !deletedIds.has(e.target) &&
                !deletedToolIds.has(e.source) &&
                !deletedToolIds.has(e.target),
            ),
          );
        }
        if (selectedId && (deletedIds.has(selectedId) || selectedId === deleteEngineId)) {
          setSelectedId(null);
        }
        setDeleteEngineId(null);
        flash(mode === 'cascade' ? 'Engine and modules deleted.' : 'Engine ungrouped.');
      } catch {
        flash('Could not delete engine.');
      } finally {
        setDeleteBusy(false);
      }
    },
    [deleteEngineId, nodes, props.companyId, selectedId, setNodes, setEdges],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        void api<{ deleted: true; renamedModules: ModuleNameUpdate[] }>(
          `/api/companies/${props.companyId}/links/${edge.id}`,
          { method: 'DELETE' },
        )
          .then((response) => {
            setEdges((current) => {
              const next = current.filter((e) => e.id !== edge.id);
              setNodes((nodeState) =>
                applyMathAttachments(
                  applyRenamedModules(nodeState, response.renamedModules ?? []),
                  next,
                ),
              );
              return next;
            });
          })
          .catch(() => {
            setEdges((current) =>
              current.some((item) => item.id === edge.id) ? current : [...current, edge],
            );
            flash('Could not delete link.');
          });
      }
    },
    [props.companyId, setEdges, setNodes],
  );

  const updateModule = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          CanvasModule,
          | 'name'
          | 'status'
          | 'generatedNameBase'
          | 'nameCustomized'
          | 'config'
          | 'topicSectors'
          | 'capitalAllocationRef'
          | 'targetExitRef'
          | 'missingSetupFields'
          | 'topicSectorsOverridden'
        >
      >,
    ) => {
      setNodes((current) => {
        const patched = current.map((n) => {
          if (!isModuleNode(n) || n.id !== id) return n;
          return { ...n, data: { ...n.data, ...patch } };
        });
        if (patch.config === undefined) return patched;
        const synced = withSyncedOptionAnchors(patched);
        setEdges((edges) => mergeDecorativeEdges(edges, synced.nodes));
        return synced.nodes;
      });
    },
    [setNodes, setEdges],
  );

  const handleAnchorPositionChange = useCallback(
    (anchorId: string, position: OptionAnchorPosition) => {
      const anchorNode = nodes.find(
        (node): node is OptionAnchorFlowNode =>
          isOptionAnchorNode(node) && node.id === anchorId,
      );
      const engineId =
        anchorNode?.data.ownerEngineId ??
        (typeof anchorId === 'string' ? anchorId.split(':')[0] : null);
      if (!engineId) return;

      setNodes((current) => {
        const next = current.map((node) => {
          if (isOptionAnchorNode(node) && node.id === anchorId) {
            return { ...node, data: { ...node.data, position } };
          }
          if (!isEngineGroupNode(node) || node.id !== engineId) return node;
          const prevSnap = node.data.setupSnapshot ?? {
            topicSectors: node.data.masterTopicSectors,
            allocationMode: 'amount' as const,
            allocationValue: '',
            targetExitLocal: '',
          };
          const optionAnchorPositions = {
            ...(prevSnap.optionAnchorPositions ?? {}),
            [anchorId]: position,
          };
          return {
            ...node,
            data: {
              ...node.data,
              setupSnapshot: {
                ...prevSnap,
                optionAnchorPositions,
              },
            },
          };
        });
        return withSyncedOptionAnchors(next).nodes;
      });

      void api(`/api/companies/${props.companyId}/engines/${engineId}`, {
        method: 'PATCH',
        body: {
          setupSnapshot: (() => {
            const eng = nodes.find(
              (n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id === engineId,
            );
            const prev = eng?.data.setupSnapshot ?? {
              topicSectors: eng?.data.masterTopicSectors ?? [],
              allocationMode: 'amount' as const,
              allocationValue: '',
              targetExitLocal: '',
            };
            return {
              ...prev,
              optionAnchorPositions: {
                ...(prev.optionAnchorPositions ?? {}),
                [anchorId]: position,
              },
            };
          })(),
        },
      }).catch(() => {
        flash('Could not save lever position.');
      });
    },
    [nodes, props.companyId, setNodes],
  );

  const removeModule = useCallback(
    (id: string, renamedModules?: readonly ModuleNameUpdate[]) => {
      const toolIds = new Set(
        nodes
          .filter(
            (node): node is MathToolFlowNode =>
              isMathToolNode(node) && node.data.ownerModuleId === id,
          )
          .map((node) => node.id),
      );
      setNodes((current) => {
        const remaining = current.filter((n) => n.id !== id && !toolIds.has(n.id));
        return applyRenamedModules(remaining, renamedModules ?? []);
      });
      setEdges((current) => {
        const next = current.filter(
          (e) =>
            e.source !== id && e.target !== id && !toolIds.has(e.source) && !toolIds.has(e.target),
        );
        setNodes((nodeState) => applyMathAttachments(nodeState, next));
        return next;
      });
      setSelectedId(null);
    },
    [nodes, setNodes, setEdges],
  );

  const selected: CanvasModule | null = useMemo(() => {
    const node = nodes.find((n) => n.id === selectedId);
    if (!node || !isModuleNode(node)) return null;
    return canvasModuleFromNode(node, nodes);
  }, [nodes, selectedId]);

  const selectedEngine = useMemo(() => {
    const node = nodes.find((n) => n.id === selectedId);
    if (!node || !isEngineGroupNode(node)) return null;
    return {
      id: node.id,
      label: node.data.label,
      templateId: node.data.templateId,
      masterTopicSectors: node.data.masterTopicSectors,
      setupSnapshot: node.data.setupSnapshot ?? null,
      templateInputs: node.data.templateInputs ?? {},
    };
  }, [nodes, selectedId]);

  const selectedAnchor = useMemo(() => {
    const node = nodes.find((n) => n.id === selectedId);
    if (!node || !isOptionAnchorNode(node)) return null;
    return node;
  }, [nodes, selectedId]);

  const anchorsByEngine = useMemo(() => {
    const modules = canvasModulesFromNodes(nodes);
    const map = new Map<string, OptionAnchorSpec[]>();
    for (const eng of nodes.filter(isEngineGroupNode)) {
      map.set(
        eng.id,
        anchorsForEngine({ id: eng.id, templateId: eng.data.templateId }, modules),
      );
    }
    return map;
  }, [nodes]);

  const moduleInspectorAnchors = useMemo(() => {
    if (!selected?.engineInstanceId) return [] as OptionAnchorSpec[];
    const all = anchorsByEngine.get(selected.engineInstanceId) ?? [];
    return all.filter(
      (anchor) => !anchor.ownerModuleId || anchor.ownerModuleId === selected.id,
    );
  }, [anchorsByEngine, selected]);

  const processModule: CanvasModule | null = useMemo(() => {
    const node = nodes.find((n) => n.id === processModuleId);
    if (!node || !isModuleNode(node)) return null;
    return canvasModuleFromNode(node, nodes);
  }, [nodes, processModuleId]);

  useEffect(() => {
    function onOpenProcess(event: Event) {
      const detail = (event as CustomEvent<{ moduleId?: string }>).detail;
      if (!detail?.moduleId) return;
      setProcessModuleId(detail.moduleId);
      setSelectedId(detail.moduleId);
    }
    window.addEventListener('hftr:open-process-modal', onOpenProcess);
    return () => window.removeEventListener('hftr:open-process-modal', onOpenProcess);
  }, []);

  return (
    <div className="absolute inset-0 flex min-h-0">
      <Palette
        onAdd={addModule}
        onInsertEngine={insertEngine}
        {...(props.companyDefaults ? { companyDefaults: props.companyDefaults } : {})}
        executionEngines={nodes
          .filter(isEngineGroupNode)
          .filter((node) => {
            const template = getEngineTemplateById(node.data.templateId);
            return template ? engineCreateSection(template) === 'execution' : false;
          })
          .map((node) => ({ id: node.id, label: node.data.label }))}
      />

      {/*
        overscroll-none: block browser history swipe / rubber-band navigation when
        trackpad-panning the canvas (Chrome/Edge/Firefox; Safari content-area only).
      */}
      <div className="h-full min-h-0 min-w-0 flex-1 overscroll-none">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => {
            rfInstanceRef.current = instance;
          }}
          onNodesChange={onNodesChange}
          onNodeDragStart={onOwnerDragStart}
          onNodeDrag={onOwnerDrag}
          onNodeDragStop={persistNodeDragStop}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          connectionLineType={ConnectionLineType.SmoothStep}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnPinch
          zoomOnScroll={false}
          selectionOnDrag={false}
          preventScrolling
          className="hftr-canvas-flow"
          onNodeClick={(event, node) => {
            if (isInteractiveNodeTarget(event.target)) return;
            if (
              isModuleNode(node as CanvasFlowNode) ||
              isEngineGroupNode(node as CanvasFlowNode) ||
              isOptionAnchorNode(node as CanvasFlowNode)
            ) {
              setSelectedId(node.id);
              return;
            }
            setSelectedId(null);
          }}
          onPaneClick={() => setSelectedId(null)}
          minZoom={0.15}
          maxZoom={1.5}
          fitView
          fitViewOptions={{ maxZoom: 1, minZoom: 0.15, padding: 0.12 }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          style={{ width: '100%', height: '100%', background: 'var(--color-surface-0)' }}
        >
          <Background gap={18} color="var(--color-line)" />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <CanvasSettingsMenu
              disabled={clearBusy || deleteBusy}
              canClear={nodes.length > 0}
              onReflow={() => void handleCanvasReflow()}
              onRequestClear={() => setClearCanvasOpen(true)}
            />
          </Panel>
        </ReactFlow>
      </div>

      {selected && (
        <InspectorPanel
          companyId={props.companyId}
          module={selected}
          anchors={moduleInspectorAnchors}
          {...(selected.engineInstanceId
            ? {
                anchorPositions:
                  (
                    nodes.find(
                      (n): n is EngineGroupFlowNode =>
                        isEngineGroupNode(n) && n.id === selected.engineInstanceId,
                    )?.data.setupSnapshot?.optionAnchorPositions ?? {}
                  ),
              }
            : {})}
          onUpdated={updateModule}
          onDeleted={removeModule}
          onClose={() => setSelectedId(null)}
          onOpenProcess={() => setProcessModuleId(selected.id)}
          onAnchorPositionChange={handleAnchorPositionChange}
        />
      )}

      {selectedEngine && (
        <EngineInspectorPanel
          companyId={props.companyId}
          engine={selectedEngine}
          anchors={anchorsByEngine.get(selectedEngine.id) ?? []}
          {...(selectedEngine.setupSnapshot?.optionAnchorPositions
            ? { anchorPositions: selectedEngine.setupSnapshot.optionAnchorPositions }
            : {})}
          onUpdated={(engineId, patch) => {
            setNodes((current) =>
              current.map((node) => {
                if (!isEngineGroupNode(node) || node.id !== engineId) return node;
                return {
                  ...node,
                  data: {
                    ...node.data,
                    ...(patch.label !== undefined ? { label: patch.label } : {}),
                    ...(patch.masterTopicSectors !== undefined
                      ? { masterTopicSectors: patch.masterTopicSectors }
                      : {}),
                    ...(patch.setupSnapshot !== undefined
                      ? { setupSnapshot: patch.setupSnapshot }
                      : {}),
                    ...(patch.templateInputs !== undefined
                      ? { templateInputs: patch.templateInputs }
                      : {}),
                  },
                };
              }),
            );
          }}
          onClose={() => setSelectedId(null)}
          onFocusAnchor={(anchorId) => setSelectedId(anchorId)}
          onAnchorPositionChange={handleAnchorPositionChange}
        />
      )}

      {selectedAnchor && (
        <OptionAnchorInspectorPanel
          companyId={props.companyId}
          anchor={{
            id: selectedAnchor.data.id,
            kind: selectedAnchor.data.kind,
            catalogRef: selectedAnchor.data.catalogRef,
            label: selectedAnchor.data.label,
            ...(selectedAnchor.data.layer ? { layer: selectedAnchor.data.layer } : {}),
            parentAnchorId: selectedAnchor.data.parentAnchorId ?? null,
            ownerModuleId: selectedAnchor.data.ownerModuleId ?? null,
            ownerEngineId: selectedAnchor.data.ownerEngineId,
            defaultPosition: selectedAnchor.data.position ?? 'typical',
          }}
          position={selectedAnchor.data.position ?? 'typical'}
          siblings={anchorsByEngine.get(selectedAnchor.data.ownerEngineId) ?? []}
          onClose={() => setSelectedId(null)}
          onFocusEngine={(engineId) => setSelectedId(engineId)}
          onFocusModule={(moduleId) => setSelectedId(moduleId)}
          onPositionChange={handleAnchorPositionChange}
        />
      )}

      {processModule && (
        <ModuleProcessDetailModal
          companyId={props.companyId}
          moduleId={processModule.id}
          moduleType={processModule.type}
          moduleName={processModule.name}
          onClose={() => setProcessModuleId(null)}
        />
      )}

      {deleteEngineId && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
          onClick={() => {
            if (!deleteBusy) setDeleteEngineId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-engine-title"
            className="w-80 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="delete-engine-title" className="text-sm font-medium text-[var(--color-ink)]">
              Delete engine group?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-dim)]">
              Delete modules removes all member nodes and their links. Ungroup only removes the
              engine chrome and keeps modules on the canvas.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteEngine('cascade')}
                className="rounded-md border border-[var(--color-block)] px-3 py-2 text-xs text-[var(--color-block)] disabled:opacity-50"
              >
                Delete modules
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void confirmDeleteEngine('ungroup')}
                className="rounded-md border border-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-accent)] disabled:opacity-50"
              >
                Ungroup only
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteEngineId(null)}
                className="rounded-md border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-ink-dim)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {clearCanvasOpen && (
        <ClearCanvasDialog
          busy={clearBusy}
          engineCount={nodes.filter(isEngineGroupNode).length}
          moduleCount={nodes.filter(isGraphModuleNode).length}
          onCancel={cancelClearCanvas}
          onConfirm={() => void confirmClearCanvas()}
        />
      )}

      {notice && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-warn)] shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
