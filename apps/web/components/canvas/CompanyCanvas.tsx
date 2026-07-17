'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
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
  MODULE_COLUMN,
  type ModuleStatus,
  type ModuleType,
} from '@hftr/contracts';
import { api, RequestError } from '@/lib/client';
import { InspectorPanel } from './InspectorPanel';
import { ModuleNode, type ModuleFlowNode } from './ModuleNode';
import { Palette } from './Palette';
import { LINK_COLORS, type CanvasLink, type CanvasModule } from './types';

const nodeTypes = { module: ModuleNode };

function toNode(m: CanvasModule): ModuleFlowNode {
  return {
    id: m.id,
    type: 'module',
    position: m.position,
    deletable: false, // module removal goes through the inspector's guarded delete
    data: { name: m.name, moduleType: m.type, status: m.status },
  };
}

function toEdge(l: CanvasLink): Edge {
  return {
    id: l.id,
    source: l.fromModuleId,
    target: l.toModuleId,
    label: l.linkKind.replace('_', ' '),
    style: { stroke: LINK_COLORS[l.linkKind], strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 10 },
    labelBgStyle: { fill: 'var(--color-surface-0)' },
    animated: l.linkKind === 'data_feed',
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
    props.initialModules.map(toNode),
  );
  const [edges, setEdges] = useEdgesState<Edge>(props.initialLinks.map(toEdge));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  }, [props.companyId, setNodes]);

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

      const allowed = allowedLinkKinds(from.data.moduleType, to.data.moduleType);
      const linkKind = allowed[0];
      if (!linkKind) {
        flash(`${from.data.moduleType} → ${to.data.moduleType} is not a valid connection.`);
        return;
      }
      try {
        const { link } = await api<{ link: CanvasLink }>(
          `/api/companies/${props.companyId}/links`,
          {
            method: 'POST',
            body: { fromModuleId: from.id, toModuleId: to.id, linkKind },
          },
        );
        setEdges((current) => [...current, toEdge(link)]);
      } catch (err) {
        flash(
          err instanceof RequestError && err.code === 'link_already_exists'
            ? 'That link already exists.'
            : 'Link rejected by the server.',
        );
      }
    },
    [nodes, props.companyId, setEdges],
  );

  const addModule = useCallback(
    async (type: ModuleType, name: string, config: unknown) => {
      const column = MODULE_COLUMN[type];
      const inColumn = nodes.filter((n) => MODULE_COLUMN[n.data.moduleType] === column).length;
      const position = { x: 80 + column * 260, y: 60 + inColumn * 140 };
      try {
        const { module } = await api<{ module: { id: string } }>(
          `/api/companies/${props.companyId}/modules`,
          { method: 'POST', body: { type, name, config, canvasPosition: position } },
        );
        setNodes((current) => [
          ...current,
          toNode({ id: module.id, type, name, status: 'draft', position }),
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

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        void api(`/api/companies/${props.companyId}/links/${edge.id}`, { method: 'DELETE' }).catch(
          () => flash('Could not delete link.'),
        );
      }
      setEdges((current) => current.filter((e) => !deleted.some((d) => d.id === e.id)));
    },
    [props.companyId, setEdges],
  );

  const updateModule = useCallback(
    (id: string, patch: Partial<{ name: string; status: ModuleStatus }>) => {
      setNodes((current) =>
        current.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const removeModule = useCallback(
    (id: string) => {
      setNodes((current) => current.filter((n) => n.id !== id));
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
      status: node.data.status,
      position: node.position,
    };
  }, [nodes, selectedId]);

  return (
    <div className="relative flex min-h-0 flex-1">
      <Palette onAdd={addModule} />

      <div className="min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={persistPosition}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodeClick={(_e, node) => setSelectedId(node.id)}
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
