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
  computeEngineBoundsFromPositions,
  ENGINE_GROUP_PADDING,
  handleIdForLink,
  isMathToolAttachment,
  layoutCanvas,
  missingModuleSetupFields,
  MODULE_COLUMN,
  reflowEngineAtOrigin,
  type DeleteEngineMode,
  type EngineTemplate,
  type LayoutLink,
  type LayoutModule,
  type LayoutResult,
  type LinkKind,
  type ModuleStatus,
  type ModuleSetupInput,
  type ModuleType,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import type { ModuleNameUpdate } from '@/lib/module-generated-name';
import { EngineGroupNode, type EngineGroupFlowNode } from './EngineGroupNode';
import { InspectorPanel } from './InspectorPanel';
import { ModuleProcessDetailModal } from './ModuleProcessDetailModal';
import { MathToolNode, type MathToolFlowNode } from './MathToolNode';
import { ModuleNode, type ModuleFlowNode } from './ModuleNode';
import { CanvasSettingsMenu } from './CanvasSettingsMenu';
import { Palette } from './Palette';
import {
  edgeKindForHandles,
  LINK_COLORS,
  type CanvasEngineGroup,
  type CanvasLink,
  type CanvasModule,
} from './types';

const nodeTypes = { module: ModuleNode, mathTool: MathToolNode, engineGroup: EngineGroupNode };

export type CanvasFlowNode = ModuleFlowNode | MathToolFlowNode | EngineGroupFlowNode;

function isModuleNode(node: CanvasFlowNode): node is ModuleFlowNode {
  return node.type === 'module';
}

function isEngineGroupNode(node: CanvasFlowNode): node is EngineGroupFlowNode {
  return node.type === 'engineGroup';
}

function isMathToolNode(node: CanvasFlowNode): node is MathToolFlowNode {
  return node.type === 'mathTool';
}

function isGraphModuleNode(node: CanvasFlowNode): node is ModuleFlowNode | MathToolFlowNode {
  return isModuleNode(node) || isMathToolNode(node);
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

function engineBounds(node: EngineGroupFlowNode): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: node.position.x,
    y: node.position.y,
    width: (node.style?.width as number) ?? 400,
    height: (node.style?.height as number) ?? 300,
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

/** True when the click landed on an editable control inside the node body. */
function isInteractiveNodeTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('input, select, textarea, button, label') !== null
  );
}

/** Default placement under an owner (reflow / first provision only). */
function defaultMathOffset(owner: Pick<ModuleFlowNode, 'measured'>): { x: number; y: number } {
  const ownerWidth = Math.max(owner.measured?.width ?? 280, 280);
  const ownerHeight = Math.max(owner.measured?.height ?? 220, 220);
  return {
    x: (ownerWidth - 220) / 2,
    y: ownerHeight + 24,
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
    edges: [...edges, ...tools.flatMap((tool) => tool.links.map(toEdge))],
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
      companyId,
      topicSectors: m.topicSectors,
      capitalAllocationRef: m.capitalAllocationRef,
      targetExitRef: m.targetExitRef,
      missingSetupFields: m.missingSetupFields,
      engineInstanceId: m.engineInstanceId,
      toolOwnerModuleId: m.toolOwnerModuleId,
      topicSectorsOverridden: m.topicSectorsOverridden,
      attachedMathTools,
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

  return nodes;
}

function toEdge(l: CanvasLink): Edge {
  return {
    id: l.id,
    source: l.fromModuleId,
    target: l.toModuleId,
    type: 'smoothstep',
    sourceHandle: handleIdForLink(l.linkKind, 'out'),
    targetHandle: handleIdForLink(l.linkKind, 'in'),
    label: l.linkKind.replace('_', ' '),
    style: { stroke: LINK_COLORS[l.linkKind], strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 10 },
    labelBgStyle: { fill: 'var(--color-surface-0)' },
    animated: false,
    data: { linkKind: l.linkKind },
  };
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
}): CanvasModule {
  const position = (row.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number };
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
  const [edges, setEdges] = useEdgesState<Edge>(props.initialLinks.map(toEdge));
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
      const modulePosById = new Map(layout.modules.map((m) => [m.id, m.canvasPosition]));
      const engineBoundsById = new Map(layout.engines.map((e) => [e.id, e.canvasBounds]));

      setNodes((current) =>
        current.map((node) => {
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
        }),
      );
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

      const layout = reflowEngineAtOrigin(
        { id: engineId, memberModuleIds: engineNode.data.memberModuleIds },
        gatherLayoutModules(workingNodes),
        gatherLayoutLinks(workingEdges),
        { x: engineNode.position.x, y: engineNode.position.y },
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
          rfInstanceRef.current?.fitView({ padding: 0.15, maxZoom: 1 });
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
      engineNodes.map((n) => ({ id: n.id, memberModuleIds: n.data.memberModuleIds })),
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
        rfInstanceRef.current?.fitView({ padding: 0.15, maxZoom: 1 });
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
    window.addEventListener('hftr:module-setup-saved', handleSetupSaved);
    window.addEventListener('hftr:module-topic-restored', handleTopicRestored);
    return () => {
      window.removeEventListener('hftr:module-setup-saved', handleSetupSaved);
      window.removeEventListener('hftr:module-topic-restored', handleTopicRestored);
    };
  }, [setNodes]);

  // T1.4 node status projections: poll the server-composed status lines.
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
          }[];
        }>(`/api/companies/${props.companyId}/canvas`);
        if (stopped) return;
        const byId = new Map(projections.map((p) => [p.moduleId, p]));
        setNodes((current) =>
          current.map((n) => {
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
                  },
                }
              : n;
          }),
        );
        const active = new Set(projections.filter((p) => p.activeJobs > 0).map((p) => p.moduleId));
        setEdges((current) =>
          current.map((e) => {
            const animated = active.has(e.source) || active.has(e.target);
            return animated === Boolean(e.animated) ? e : { ...e, animated };
          }),
        );
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
        const bounds = engineBounds(node);
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
            return syncDedicatedMathParents(
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
          });
        }
      } catch {
        flash('Could not save position.');
      }
    },
    [nodes, props.companyId, setNodes],
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
          if (!isMathToolNode(candidate) || candidate.data.ownerModuleId !== node.id) {
            return candidate;
          }
          return {
            ...candidate,
            position: {
              x: candidate.position.x + dx,
              y: candidate.position.y + dy,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      const from = nodes.find((n) => n.id === connection.source);
      const to = nodes.find((n) => n.id === connection.target);
      if (!from || !to || !isGraphModuleNode(from) || !isGraphModuleNode(to)) return;

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
      try {
        const { link, renamedModules } = await api<{
          link: CanvasLink;
          renamedModules: ModuleNameUpdate[];
        }>(`/api/companies/${props.companyId}/links`, {
          method: 'POST',
          body: { fromModuleId: from.id, toModuleId: to.id, linkKind },
        });
        setEdges((current) => {
          const next = [...current, toEdge(link)];
          setNodes((nodeState) =>
            applyMathAttachments(applyRenamedModules(nodeState, renamedModules ?? []), next),
          );
          return next;
        });
      } catch (err) {
        flash(
          err instanceof RequestError && err.code === 'link_already_exists'
            ? 'That link already exists.'
            : 'Link rejected by the server.',
        );
      }
    },
    [nodes, props.companyId, setEdges, setNodes],
  );

  const addModule = useCallback(
    async (type: ModuleType, name: string, config: unknown) => {
      const column = MODULE_COLUMN[type];
      const moduleNodes = nodes.filter(isModuleNode);
      const inColumn = moduleNodes.filter(
        (n) => MODULE_COLUMN[n.data.moduleType] === column,
      ).length;
      const position = { x: 80 + column * 260, y: 60 + inColumn * 140 };
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
          ...dedicatedMath.flatMap((tool) => tool.links.map(toEdge)),
        ]);
        setSelectedId(module.id);
      } catch (err) {
        flash(
          err instanceof RequestError && err.code === 'invalid_input'
            ? 'Module config is invalid.'
            : 'Could not create module.',
        );
      }
    },
    [nodes, props.companyId, setEdges, setNodes],
  );

  const insertEngine = useCallback(
    async (engine: EngineTemplate, inputs: Record<string, string>, setup?: ModuleSetupInput) => {
      const yCandidates = nodes.flatMap((n) => {
        if (isEngineGroupNode(n)) {
          const b = engineBounds(n);
          return [b.y + b.height];
        }
        if (isModuleNode(n)) {
          const abs = absoluteModulePosition(n, nodes);
          return [abs.y + 220];
        }
        return [];
      });
      const yOffset = yCandidates.length > 0 ? Math.max(...yCandidates) + 60 : 60;

      try {
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
            capitalAllocationRef: string | null;
            targetExitRef: string | null;
            engineInstanceId: string | null;
            toolOwnerModuleId: string | null;
            topicSectorsOverridden: boolean;
          }>;
          links: CanvasLink[];
        }>(`/api/companies/${props.companyId}/engines`, {
          method: 'POST',
          body: {
            templateId: engine.id,
            inputs,
            setup,
            canvasOffset: { x: 80, y: yOffset },
          },
        });

        const bounds =
          response.engine.canvasBounds ??
          computeEngineBoundsFromPositions(
            response.modules
              .filter((m) => m.engineInstanceId === response.engine.id && m.type !== 'math')
              .map((m) => (m.canvasPosition ?? { x: 0, y: 0 }) as { x: number; y: number }),
          );

        const newEdges = response.links.map(toEdge);
        const insertedNodes = buildInitialGraph(
          response.modules.map((row) => moduleRowToCanvas(row)),
          [
            {
              id: response.engine.id,
              templateId: response.engine.templateId,
              label: response.engine.label,
              masterTopicSectors: response.engine.masterTopicSectors,
              capitalAllocationRef: response.engine.capitalAllocationRef ?? null,
              targetExitRef: response.engine.targetExitRef ?? null,
              setupSnapshot: response.engine.setupSnapshot ?? null,
              templateInputs: response.engine.templateInputs ?? inputs,
              canvasBounds: bounds,
              memberModuleIds: response.engine.memberModuleIds,
            },
          ],
          response.links,
          props.companyId,
          stableEngineCallbacks,
        );

        setNodes((current) =>
          applyMathAttachments([...current, ...insertedNodes], [...edges, ...newEdges]),
        );
        setEdges((current) => [...current, ...newEdges]);
        flash(`${engine.label} inserted — activate its modules to start.`);
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
        Pick<CanvasModule, 'name' | 'status' | 'generatedNameBase' | 'nameCustomized'>
      >,
    ) => {
      setNodes((current) =>
        current.map((n) => {
          if (!isModuleNode(n) || n.id !== id) return n;
          return { ...n, data: { ...n.data, ...patch } };
        }),
      );
    },
    [setNodes],
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
    const abs = absoluteModulePosition(node, nodes);
    return {
      id: node.id,
      type: node.data.moduleType,
      name: node.data.name,
      generatedNameBase: node.data.generatedNameBase,
      nameCustomized: node.data.nameCustomized,
      status: node.data.status,
      position: abs,
      topicSectors: node.data.topicSectors,
      capitalAllocationRef: node.data.capitalAllocationRef,
      targetExitRef: node.data.targetExitRef,
      missingSetupFields: node.data.missingSetupFields,
      engineInstanceId: node.data.engineInstanceId,
      toolOwnerModuleId: node.data.toolOwnerModuleId ?? null,
      topicSectorsOverridden: node.data.topicSectorsOverridden,
    };
  }, [nodes, selectedId]);

  const processModule: CanvasModule | null = useMemo(() => {
    const node = nodes.find((n) => n.id === processModuleId);
    if (!node || !isModuleNode(node)) return null;
    const abs = absoluteModulePosition(node, nodes);
    return {
      id: node.id,
      type: node.data.moduleType,
      name: node.data.name,
      generatedNameBase: node.data.generatedNameBase,
      nameCustomized: node.data.nameCustomized,
      status: node.data.status,
      position: abs,
      topicSectors: node.data.topicSectors,
      capitalAllocationRef: node.data.capitalAllocationRef,
      targetExitRef: node.data.targetExitRef,
      missingSetupFields: node.data.missingSetupFields,
      engineInstanceId: node.data.engineInstanceId,
      toolOwnerModuleId: node.data.toolOwnerModuleId ?? null,
      topicSectorsOverridden: node.data.topicSectorsOverridden,
    };
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
    <div className="relative flex min-h-0 flex-1">
      <Palette onAdd={addModule} onInsertEngine={insertEngine} />

      <div className="min-w-0 flex-1">
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
          connectionLineType={ConnectionLineType.SmoothStep}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnPinch
          zoomOnScroll={false}
          selectionOnDrag={false}
          onNodeClick={(event, node) => {
            if (isInteractiveNodeTarget(event.target)) return;
            if (!isModuleNode(node)) {
              setSelectedId(null);
              return;
            }
            setSelectedId(node.id);
          }}
          onPaneClick={() => setSelectedId(null)}
          fitView
          fitViewOptions={{ maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          style={{ background: 'var(--color-surface-0)' }}
        >
          <Background gap={24} color="var(--color-line)" />
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
          onUpdated={updateModule}
          onDeleted={removeModule}
          onClose={() => setSelectedId(null)}
          onOpenProcess={() => setProcessModuleId(selected.id)}
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
