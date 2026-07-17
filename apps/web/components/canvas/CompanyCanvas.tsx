'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  ConnectionLineType,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  allowedLinkKinds,
  handleIdForLink,
  missingModuleSetupFields,
  MODULE_COLUMN,
  type EngineTemplate,
  type ModuleStatus,
  type ModuleSetupInput,
  type ModuleType,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import type { ModuleNameUpdate } from '@/lib/module-generated-name';
import { InspectorPanel } from './InspectorPanel';
import { ModuleNode, type ModuleFlowNode } from './ModuleNode';
import { Palette } from './Palette';
import { edgeKindForHandles, LINK_COLORS, type CanvasLink, type CanvasModule } from './types';

const nodeTypes = { module: ModuleNode };

/** True when the click landed on an editable control inside the node body. */
function isInteractiveNodeTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('input, select, textarea, button, label') !== null
  );
}

function applyRenamedModules(
  nodes: ModuleFlowNode[],
  updates: readonly ModuleNameUpdate[],
): ModuleFlowNode[] {
  if (updates.length === 0) return nodes;
  const byId = new Map(updates.map((update) => [update.moduleId, update]));
  return nodes.map((node) => {
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

function toNode(m: CanvasModule, companyId: string): ModuleFlowNode {
  return {
    id: m.id,
    type: 'module',
    position: m.position,
    deletable: false, // module removal goes through the inspector's guarded delete
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
    },
  };
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
  initialLinks: CanvasLink[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<ModuleFlowNode>(
    props.initialModules.map((module) => toNode(module, props.companyId)),
  );
  const [edges, setEdges] = useEdgesState<Edge>(props.initialLinks.map(toEdge));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    function handleSetupSaved(event: Event) {
      const detail = (
        event as CustomEvent<{
          moduleId: string;
          topicSectors: string[];
          capitalAllocationRef: string | null;
          targetExitRef: string | null;
        }>
      ).detail;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== detail.moduleId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              topicSectors: detail.topicSectors,
              capitalAllocationRef: detail.capitalAllocationRef,
              targetExitRef: detail.targetExitRef,
              missingSetupFields: missingModuleSetupFields(node.data.moduleType, detail),
            },
          };
        }),
      );
    }
    window.addEventListener('hftr:module-setup-saved', handleSetupSaved);
    return () => window.removeEventListener('hftr:module-setup-saved', handleSetupSaved);
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
            const p = byId.get(n.id);
            return p
              ? { ...n, data: { ...n.data, statusText: p.statusText, activeJobs: p.activeJobs } }
              : n;
          }),
        );
        // Edges animate while either endpoint module is actively working.
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

  const persistPosition = useCallback(
    async (_e: unknown, node: ModuleFlowNode) => {
      try {
        await api(`/api/companies/${props.companyId}/modules/${node.id}`, {
          method: 'PATCH',
          body: {
            canvasPosition: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
          },
        });
      } catch {
        flash('Could not save position.');
      }
    },
    [props.companyId],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      const from = nodes.find((n) => n.id === connection.source);
      const to = nodes.find((n) => n.id === connection.target);
      if (!from || !to) return;

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
        setEdges((current) => [...current, toEdge(link)]);
        setNodes((current) => applyRenamedModules(current, renamedModules ?? []));
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
      const inColumn = nodes.filter((n) => MODULE_COLUMN[n.data.moduleType] === column).length;
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
          toNode(
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

  /**
   * Inserts an end-to-end engine template: creates each module (user input
   * values merged into configs — inputs sharing a configKey are joined),
   * then the links between them, offset below existing nodes.
   */
  const insertEngine = useCallback(
    async (engine: EngineTemplate, inputs: Record<string, string>, setup?: ModuleSetupInput) => {
      const configs = engine.modules.map((m) => ({ ...m.config }));
      // Inputs sharing a target configKey compose in declaration order.
      const grouped = new Map<string, string[]>();
      for (const input of engine.inputs) {
        const value = inputs[input.key]?.trim();
        if (!value) continue;
        const mapKey = `${input.target.moduleIndex}:${input.target.configKey}`;
        grouped.set(mapKey, [...(grouped.get(mapKey) ?? []), value]);
      }
      for (const [mapKey, values] of grouped) {
        const [idx, configKey] = mapKey.split(':') as [string, string];
        configs[Number(idx)]![configKey] = values.join(' — ');
      }

      const yOffset = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.y)) + 180 : 60;
      const baseY = Math.min(...engine.modules.map((m) => m.position.y));

      const created: Array<{
        id: string;
        name: string;
        generatedNameBase: string;
        nameCustomized: boolean;
        topicSectors: string[];
        capitalAllocationRef: string | null;
        targetExitRef: string | null;
      }> = [];
      for (let i = 0; i < engine.modules.length; i += 1) {
        const m = engine.modules[i]!;
        const position = { x: m.position.x, y: yOffset + (m.position.y - baseY) };
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
          body: {
            type: m.type,
            name: m.name,
            config: configs[i],
            canvasPosition: position,
            setup,
          },
        });
        created.push(module);
        setNodes((current) => [
          ...current,
          toNode(
            {
              id: module.id,
              type: m.type,
              name: module.name,
              generatedNameBase: module.generatedNameBase,
              nameCustomized: module.nameCustomized,
              status: 'draft',
              position,
              topicSectors: module.topicSectors,
              capitalAllocationRef: module.capitalAllocationRef,
              targetExitRef: module.targetExitRef,
              missingSetupFields: missingModuleSetupFields(m.type, {
                topicSectors: module.topicSectors,
                capitalAllocationRef: module.capitalAllocationRef,
                targetExitRef: module.targetExitRef,
              }),
            },
            props.companyId,
          ),
        ]);
      }
      for (const l of engine.links) {
        const fromModuleId =
          l.fromIndex === 'math'
            ? nodes.find((node) => node.data.moduleType === 'math')?.id
            : created[l.fromIndex]?.id;
        const toModuleId =
          l.toIndex === 'math'
            ? nodes.find((node) => node.data.moduleType === 'math')?.id
            : created[l.toIndex]?.id;
        if (!fromModuleId || !toModuleId) {
          throw new Error('engine_link_unresolved');
        }
        const { link, renamedModules } = await api<{
          link: CanvasLink;
          renamedModules: ModuleNameUpdate[];
        }>(`/api/companies/${props.companyId}/links`, {
          method: 'POST',
          body: {
            fromModuleId,
            toModuleId,
            linkKind: l.linkKind,
          },
        });
        setEdges((current) => [...current, toEdge(link)]);
        setNodes((current) => applyRenamedModules(current, renamedModules ?? []));
      }
      flash(`${engine.label} inserted — activate its modules to start.`);
    },
    [nodes, props.companyId, setNodes, setEdges],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        void api<{ deleted: true; renamedModules: ModuleNameUpdate[] }>(
          `/api/companies/${props.companyId}/links/${edge.id}`,
          { method: 'DELETE' },
        )
          .then((response) => {
            setEdges((current) => current.filter((e) => e.id !== edge.id));
            setNodes((current) => applyRenamedModules(current, response.renamedModules ?? []));
          })
          .catch(() => flash('Could not delete link.'));
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
        current.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
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
      setEdges((current) => current.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges],
  );

  const selected: CanvasModule | null = useMemo(() => {
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return null;
    return {
      id: node.id,
      type: node.data.moduleType,
      name: node.data.name,
      generatedNameBase: node.data.generatedNameBase,
      nameCustomized: node.data.nameCustomized,
      status: node.data.status,
      position: node.position,
      topicSectors: node.data.topicSectors,
      capitalAllocationRef: node.data.capitalAllocationRef,
      targetExitRef: node.data.targetExitRef,
      missingSetupFields: node.data.missingSetupFields,
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
          onNodesChange={onNodesChange}
          onNodeDragStop={persistPosition}
          onConnect={onConnect}
          connectionLineType={ConnectionLineType.SmoothStep}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeClick={(event, node) => {
            if (isInteractiveNodeTarget(event.target)) return;
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

      {notice && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-warn)] shadow-xl">
          {notice}
        </div>
      )}
    </div>
  );
}
