'use client';

import { memo, useEffect, useMemo, useState } from 'react';
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
import type {
  MarketHubSynthesisRun,
  MarketHubSynthesisStage,
  MarketHubSynthesisStageStatus,
} from '@hftr/contracts';
import { Justification } from '@/components/panels/Justification';
import {
  buildMarketPostureAlgorithmGraph,
  type PostureAlgoNodeData,
} from '@/lib/market-posture-algorithm-graph';

type LiveNodeData = PostureAlgoNodeData & {
  stageStatus?: MarketHubSynthesisStageStatus;
  selected?: boolean;
};

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

function statusGlyph(status: MarketHubSynthesisStageStatus | undefined): string {
  switch (status) {
    case 'queued':
      return '·';
    case 'running':
      return '›';
    case 'succeeded':
      return '✓';
    case 'failed':
      return '×';
    case 'skipped':
      return '~';
    default:
      return '·';
  }
}

function statusWord(status: MarketHubSynthesisStageStatus | undefined): string {
  return status ?? 'idle';
}

const PostureAlgoNode = memo(function PostureAlgoNode({
  data,
}: NodeProps<Node<LiveNodeData>>) {
  const ring = data.selected ? 'ring-1 ring-[var(--color-accent)]' : '';
  return (
    <div
      className={`min-w-[148px] max-w-[168px] rounded border bg-[var(--color-surface-1)] px-2 py-1.5 shadow-sm ${kindBorder(data.kind)} ${ring}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
      <div className="flex items-baseline justify-between gap-1">
        <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {kindLabel(data.kind)}
        </p>
        <p
          className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
          title={statusWord(data.stageStatus)}
        >
          <span aria-hidden>{statusGlyph(data.stageStatus)}</span> {statusWord(data.stageStatus)}
        </p>
      </div>
      <p className="text-[11px] font-medium text-[var(--color-ink)]">{data.label}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-ink-faint)]">{data.detail}</p>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
    </div>
  );
});

const nodeTypes: NodeTypes = { postureAlgo: PostureAlgoNode };

function InnerCanvas(props: {
  run: MarketHubSynthesisRun | null;
  selectedStageId: string | null;
  onSelectStage: (stageId: string | null) => void;
}) {
  const graph = useMemo(() => buildMarketPostureAlgorithmGraph(), []);
  const byStage = useMemo(() => {
    const m = new Map<string, MarketHubSynthesisStage>();
    for (const s of props.run?.stages ?? []) m.set(s.stageId, s);
    return m;
  }, [props.run]);

  const liveNodes = useMemo(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          stageStatus: byStage.get(n.id)?.status,
          selected: props.selectedStageId === n.id,
        },
        selectable: true,
      })),
    [graph.nodes, byStage, props.selectedStageId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(liveNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    graph.edges.map((e) => ({
      ...e,
      style: { stroke: 'var(--color-line)' },
      labelStyle: { fill: 'var(--color-ink-faint)', fontSize: 9 },
    })),
  );
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(liveNodes);
  }, [liveNodes, setNodes]);

  useEffect(() => {
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
  }, [graph, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_e, node) => props.onSelectStage(node.id)}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
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

function StageInspector(props: { stage: MarketHubSynthesisStage | null }) {
  if (!props.stage) {
    return (
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        Select a stage node for summary and justification.
      </p>
    );
  }
  const s = props.stage;
  return (
    <div className="space-y-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
        {s.label} · {s.status}
      </p>
      {s.summary ? (
        <Justification
          sourceClass={s.kind === 'llm' ? 'model_generated' : 'deterministic_scan'}
          lines={
            s.justificationLines.length > 0
              ? s.justificationLines
              : [s.summary]
          }
        >
          <p className="text-[11px] text-[var(--color-ink)]">{s.summary}</p>
        </Justification>
      ) : (
        <p className="text-[10px] text-[var(--color-ink-faint)]">No summary yet</p>
      )}
      <p className="font-mono text-[8px] text-[var(--color-ink-faint)]">
        {s.startedAt ? `start ${new Date(s.startedAt).toLocaleTimeString()}` : '—'}
        {s.finishedAt ? ` · end ${new Date(s.finishedAt).toLocaleTimeString()}` : ''}
      </p>
    </div>
  );
}

/**
 * Live synthesis hub canvas (D-120). Status from synthesis run stages;
 * never driven by equity live poll (D-112).
 */
export const MarketPostureModelCanvas = memo(function MarketPostureModelCanvas(props: {
  className?: string;
  run?: MarketHubSynthesisRun | null;
}) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const selected = props.run?.stages.find((s) => s.stageId === selectedStageId) ?? null;
  const done = props.run?.stages.filter((s) =>
    s.status === 'succeeded' || s.status === 'skipped' || s.status === 'failed',
  ).length;
  const total = props.run?.stages.length ?? 0;

  return (
    <div className={`space-y-2 ${props.className ?? ''}`}>
      {props.run ? (
        <p
          className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
          data-testid="market-posture-synthesis-strip"
        >
          Run {props.run.status}
          {total > 0 ? ` · ${done ?? 0}/${total} stages` : ''}
        </p>
      ) : (
        <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
          No synthesis run yet — Analyze to start
        </p>
      )}
      <div
        data-testid="market-posture-model-canvas"
        className="h-[min(22rem,42vh)] min-h-[200px] overflow-hidden rounded border border-[var(--color-line)]"
        role="img"
        aria-label="Market posture synthesis hub canvas"
      >
        <ReactFlowProvider>
          <InnerCanvas
            run={props.run ?? null}
            selectedStageId={selectedStageId}
            onSelectStage={setSelectedStageId}
          />
        </ReactFlowProvider>
      </div>
      <StageInspector stage={selected} />
    </div>
  );
});
