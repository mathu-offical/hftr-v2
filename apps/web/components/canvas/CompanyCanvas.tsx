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
import { ModuleNode, type ModuleFlowNode } from './ModuleNode';
import { Palette } from './Palette';
import {
  edgeKindForHandles,
  LINK_COLORS,
  type CanvasEngineGroup,
  type CanvasLink,
  type CanvasModule,
} from './types';

const nodeTypes = { module: ModuleNode, engineGroup: EngineGroupNode };

export type CanvasFlowNode = ModuleFlowNode | EngineGroupFlowNode;

function isModuleNode(node: CanvasFlowNode): node is ModuleFlowNode {
  return node.type === 'module';
}

function isEngineGroupNode(node: CanvasFlowNode): node is EngineGroupFlowNode {
  return node.type === 'engineGroup';
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
  node: ModuleFlowNode,
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
  for (const node of nodes) {
    if (!isModuleNode(node)) continue;
    typeById.set(node.id, node.data.moduleType);
    nameById.set(node.id, node.data.name);
  }

  const attachments = new Map<string, { id: string; name: string }[]>();
  for (const edge of edges) {
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
      topicSectorsOverridden: m.topicSectorsOverridden,
      attachedMathTools,
    },
  };
}

function gatherLayoutModules(nodes: readonly CanvasFlowNode[]): LayoutModule[] {
  return nodes.filter(isModuleNode).map((node) => ({
    id: node.id,
    type: node.data.moduleType,
    engineInstanceId: node.data.engineInstanceId,
    position: absoluteModulePosition(node, nodes),
  }));
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
    'onRequestDelete' | 'onRequestReflow' | 'onMasterTopicSaved'
  >,
): CanvasFlowNode[] {
  const attachmentMap = new Map<string, { id: string; name: string }[]>();
  const typeById = new Map(modules.map((m) => [m.id, m.type]));
  const nameById = new Map(modules.map((m) => [m.id, m.name]));
  for (const link of links) {
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
        memberModuleIds: engine.memberModuleIds,
        ...engineCallbacks,
      },
    });
  }

  for (const m of modules) {
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance<CanvasFlowNode, Edge> | null>(null);

  type MasterTopicModules = Array<{
    id: string;
    topicSectors: string[];
    capitalAllocationRef: string | null;
    targetExitRef: string | null;
    topicSectorsOverridden: boolean;
  }>;

  const engineCallbacksRef = useRef<{
    onRequestDelete: (engineId: string) => void;
    onRequestReflow: (engineId: string) => void;
    onMasterTopicSaved: (
      engineId: string,
      masterTopicSectors: string[],
      modules: MasterTopicModules,
    ) => void;
  }>({
    onRequestDelete: () => {},
    onRequestReflow: () => {},
    onMasterTopicSaved: () => {},
  });

  const stableEngineCallbacks = useMemo(
    () => ({
      onRequestDelete: (engineId: string) => {
        engineCallbacksRef.current.onRequestDelete(engineId);
      },
      onRequestReflow: (engineId: string) => {
        engineCallbacksRef.current.onRequestReflow(engineId);
      },
      onMasterTopicSaved: (
        engineId: string,
        masterTopicSectors: string[],
        modules: MasterTopicModules,
      ) => {
        engineCallbacksRef.current.onMasterTopicSaved(engineId, masterTopicSectors, modules);
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

  const handleRequestDelete = useCallback((engineId: string) => {
    setDeleteEngineId(engineId);
  }, []);

  const handleMasterTopicSaved = useCallback(
    (engineId: string, masterTopicSectors: string[], modules: MasterTopicModules) => {
      const moduleById = new Map(modules.map((m) => [m.id, m]));
      setNodes((current) =>
        current.map((node) => {
          if (isEngineGroupNode(node) && node.id === engineId) {
            return {
              ...node,
              data: {
                ...node.data,
                masterTopicSectors,
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
          if (!isModuleNode(node)) return node;

          const abs = modulePosById.get(node.id);
          if (!abs) return node;

          const engineId = node.data.engineInstanceId;
          if (engineId && node.data.moduleType !== 'math') {
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
      const engineNode = nodes.find(
        (n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id === engineId,
      );
      if (!engineNode) return;

      const layout = reflowEngineAtOrigin(
        { id: engineId, memberModuleIds: engineNode.data.memberModuleIds },
        gatherLayoutModules(nodes),
        gatherLayoutLinks(edges),
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
    [nodes, edges, props.companyId, applyLayoutResult],
  );

  const handleCanvasReflow = useCallback(async () => {
    const engineNodes = nodes.filter(isEngineGroupNode);
    const layout = layoutCanvas(
      engineNodes.map((n) => ({ id: n.id, memberModuleIds: n.data.memberModuleIds })),
      gatherLayoutModules(nodes),
      gatherLayoutLinks(edges),
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
  }, [nodes, edges, props.companyId, applyLayoutResult]);

  engineCallbacksRef.current = {
    onRequestDelete: handleRequestDelete,
    onRequestReflow: handleEngineReflow,
    onMasterTopicSaved: handleMasterTopicSaved,
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
          modules: { moduleId: string; statusText: string; activeJobs: number }[];
        }>(`/api/companies/${props.companyId}/canvas`);
        if (stopped) return;
        const byId = new Map(projections.map((p) => [p.moduleId, p]));
        setNodes((current) =>
          current.map((n) => {
            if (!isModuleNode(n)) return n;
            const p = byId.get(n.id);
            return p
              ? { ...n, data: { ...n.data, statusText: p.statusText, activeJobs: p.activeJobs } }
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

        if (targetEngineId !== currentEngineId) {
          setNodes((current) => {
            const engineNode = current.find(
              (n): n is EngineGroupFlowNode => isEngineGroupNode(n) && n.id === targetEngineId,
            );
            const parentBounds = engineNode ? engineBounds(engineNode) : null;
            return current.map((n) => {
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
            });
          });
        }
      } catch {
        flash('Could not save position.');
      }
    },
    [nodes, props.companyId, setNodes],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      const from = nodes.find((n) => n.id === connection.source);
      const to = nodes.find((n) => n.id === connection.target);
      if (!from || !to || !isModuleNode(from) || !isModuleNode(to)) return;

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
        const { module } = await api<{
          module: {
            id: string;
            name: string;
            generatedNameBase: string;
            nameCustomized: boolean;
            topicSectors: string[];
            capitalAllocationRef: string | null;
            targetExitRef: string | null;
          };
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
              topicSectorsOverridden: false,
            },
            props.companyId,
          ),
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
    [nodes, props.companyId, setNodes],
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

        const engineGroupNode: EngineGroupFlowNode = {
          id: response.engine.id,
          type: 'engineGroup',
          position: { x: bounds.x, y: bounds.y },
          style: { width: bounds.width, height: bounds.height },
          draggable: true,
          selectable: true,
          zIndex: -1,
          data: {
            companyId: props.companyId,
            label: response.engine.label,
            templateId: response.engine.templateId,
            masterTopicSectors: response.engine.masterTopicSectors,
            memberModuleIds: response.engine.memberModuleIds,
            onRequestDelete: stableEngineCallbacks.onRequestDelete,
            onRequestReflow: stableEngineCallbacks.onRequestReflow,
            onMasterTopicSaved: stableEngineCallbacks.onMasterTopicSaved,
          },
        };

        const memberCanvas = response.modules
          .filter((m) => m.engineInstanceId === response.engine.id)
          .map((row) => moduleRowToCanvas(row));

        const moduleNodes: ModuleFlowNode[] = memberCanvas.map((m) => {
          const abs = m.position;
          const relative = {
            x: abs.x - bounds.x,
            y: abs.y - bounds.y,
          };
          const base = toModuleNode(m, props.companyId);
          if (m.type === 'math') {
            return { ...base, position: abs, expandParent: false };
          }
          return {
            ...base,
            parentId: response.engine.id,
            position: relative,
            expandParent: false,
          };
        });

        const newEdges = response.links.map(toEdge);

        setNodes((current) =>
          applyMathAttachments(
            [...current, engineGroupNode, ...moduleNodes],
            [...edges, ...newEdges],
          ),
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
        setNodes((current) => {
          const remaining = current
            .filter((n) => n.id !== deleteEngineId && !deletedIds.has(n.id))
            .map((n) => {
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
            current.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)),
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
    [deleteEngineId, props.companyId, selectedId, setNodes, setEdges],
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
      setNodes((current) => {
        const remaining = current.filter((n) => n.id !== id);
        return applyRenamedModules(remaining, renamedModules ?? []);
      });
      setEdges((current) => {
        const next = current.filter((e) => e.source !== id && e.target !== id);
        setNodes((nodeState) => applyMathAttachments(nodeState, next));
        return next;
      });
      setSelectedId(null);
    },
    [setNodes, setEdges],
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
      topicSectorsOverridden: node.data.topicSectorsOverridden,
    };
  }, [nodes, selectedId]);

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
            <button
              type="button"
              onClick={() => void handleCanvasReflow()}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-ink-dim)] shadow-sm hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]"
            >
              Reflow canvas
            </button>
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
        />
      )}

      {deleteEngineId && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-[var(--color-ink)]">Delete engine group?</h3>
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

      {notice && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-warn)] shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
