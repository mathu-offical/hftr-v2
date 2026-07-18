'use client';

import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PreviewEngineGroupNode } from '@/components/canvas/preview/PreviewEngineGroupNode';
import { PreviewModuleNode } from '@/components/canvas/preview/PreviewModuleNode';
import {
  buildTemplatePreviewGraph,
  type PreviewEngineSeed,
} from '@/lib/build-template-preview-graph';

const previewNodeTypes: NodeTypes = {
  previewEngine: PreviewEngineGroupNode,
  previewModule: PreviewModuleNode,
};

function PreviewCanvasInner(props: {
  engines: PreviewEngineSeed[];
  selectedEngineKey: string | null;
  onSelectEngine: (engineKey: string | null) => void;
}) {
  const graph = useMemo(
    () =>
      buildTemplatePreviewGraph({
        engines: props.engines,
        selectedEngineKey: props.selectedEngineKey,
      }),
    [props.engines, props.selectedEngineKey],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.12, maxZoom: 0.95, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, setNodes, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={previewNodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnScroll={false}
      minZoom={0.25}
      maxZoom={1.25}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => props.onSelectEngine(null)}
      onNodeClick={(_event, node) => {
        if (node.type === 'previewEngine') {
          const key = (node.data as { engineKey?: string }).engineKey;
          if (key) props.onSelectEngine(key);
          return;
        }
        if (node.type === 'previewModule') {
          const key = (node.data as { engineKey?: string }).engineKey;
          if (key) props.onSelectEngine(key);
        }
      }}
      className="bg-[var(--color-surface-0)]"
    >
      <Background gap={16} size={1} color="var(--color-line)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

/**
 * Read-only create-form canvas: template modules + links, plus dashed
 * execution→research dependency edges. Click an engine group to edit setup.
 */
export function EngineCanvasPreview(props: {
  engines: PreviewEngineSeed[];
  selectedEngineKey: string | null;
  onSelectEngine: (engineKey: string | null) => void;
  /** Fill parent height (create-form workspace center pane). */
  fill?: boolean;
}) {
  const shellClass = props.fill
    ? 'h-full min-h-0 overflow-hidden bg-[var(--color-surface-0)]'
    : 'h-[min(28rem,46vh)] min-h-[220px] overflow-hidden rounded-md border border-[var(--color-line)]';

  if (props.engines.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-[11px] text-[var(--color-ink-faint)] ${shellClass}`}
        data-testid="engine-canvas-preview-empty"
      >
        Add research and/or execution engines to preview the graph
      </div>
    );
  }

  return (
    <div className={shellClass} data-testid="engine-canvas-preview">
      <ReactFlowProvider>
        <PreviewCanvasInner
          engines={props.engines}
          selectedEngineKey={props.selectedEngineKey}
          onSelectEngine={props.onSelectEngine}
        />
      </ReactFlowProvider>
    </div>
  );
}
