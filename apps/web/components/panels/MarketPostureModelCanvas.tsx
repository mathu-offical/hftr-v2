'use client';

import { memo, useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildMarketPostureAlgorithmGraph,
  type PostureAlgoNodeData,
} from '@/lib/market-posture-algorithm-graph';

function kindBorder(kind: PostureAlgoNodeData['kind']): string {
  switch (kind) {
    case 'llm':
      return 'border-[var(--color-accent)]';
    case 'data':
      return 'border-[var(--color-ink-faint)]';
    case 'deterministic':
      return 'border-[var(--color-line)]';
    case 'output':
      return 'border-[var(--color-ok)]';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function kindLabel(kind: PostureAlgoNodeData['kind']): string {
  switch (kind) {
    case 'llm':
      return 'LLM';
    case 'data':
      return 'DATA';
    case 'deterministic':
      return 'DET';
    case 'output':
      return 'OUT';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

const PostureAlgoNode = memo(function PostureAlgoNode({
  data,
}: NodeProps<Node<PostureAlgoNodeData>>) {
  return (
    <div
      className={`min-w-[148px] max-w-[168px] rounded border bg-[var(--color-surface-1)] px-2 py-1.5 shadow-sm ${kindBorder(data.kind)}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
      <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {kindLabel(data.kind)}
      </p>
      <p className="text-[11px] font-medium text-[var(--color-ink)]">{data.label}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-ink-faint)]">{data.detail}</p>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
    </div>
  );
});

const nodeTypes: NodeTypes = { postureAlgo: PostureAlgoNode };

function InnerCanvas() {
  const graph = useMemo(() => buildMarketPostureAlgorithmGraph(), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    graph.edges.map((e) => ({
      ...e,
      style: { stroke: 'var(--color-line)' },
      labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 9 },
    })),
  );
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(
      graph.edges.map((e) => ({
        ...e,
        style: { stroke: 'var(--color-line)' },
        labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 9 },
      })),
    );
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.14, maxZoom: 1, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, setNodes, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnScroll
      zoomOnScroll={false}
      minZoom={0.2}
      maxZoom={1.2}
      proOptions={{ hideAttribution: true }}
      className="bg-[var(--color-surface-0)]"
    >
      <Background gap={14} size={1} color="var(--color-line)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

/**
 * Read-only canvas of baseline Market posture processing (D-111).
 * Static UI — never driven by live hub poll (D-112).
 */
export const MarketPostureModelCanvas = memo(function MarketPostureModelCanvas(props: {
  className?: string;
}) {
  return (
    <div
      data-testid="market-posture-model-canvas"
      className={`h-[min(22rem,42vh)] min-h-[200px] overflow-hidden rounded border border-[var(--color-line)] ${props.className ?? ''}`}
      role="img"
      aria-label="Market posture baseline algorithm canvas"
    >
      <ReactFlowProvider>
        <InnerCanvas />
      </ReactFlowProvider>
    </div>
  );
});

