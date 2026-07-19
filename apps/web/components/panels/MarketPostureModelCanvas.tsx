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
  MarketHubModelHydration,
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

function roleLabel(role: PostureAlgoNodeData['nodeRole']): string {
  switch (role) {
    case 'live_source':
      return 'LIVE';
    case 'library_source':
      return 'LIB';
    case 'stage':
      return 'STAGE';
    default: {
      const _exhaustive: never = role;
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
      className={`min-w-[152px] max-w-[176px] rounded border bg-[var(--color-surface-1)] px-2 py-1.5 shadow-sm ${kindBorder(data.kind)} ${ring}`}
      data-testid={`market-posture-model-node-${data.nodeRole}`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
      <div className="flex items-baseline justify-between gap-1">
        <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {roleLabel(data.nodeRole)}
        </p>
        {data.nodeRole === 'stage' ? (
          <p
            className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
            title={statusWord(data.stageStatus)}
          >
            <span aria-hidden>{statusGlyph(data.stageStatus)}</span> {statusWord(data.stageStatus)}
          </p>
        ) : null}
      </div>
      <p className="truncate text-[11px] font-medium text-[var(--color-ink)]" title={data.label}>
        {data.label}
      </p>
      <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--color-ink)]">
        {data.amount}
      </p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)]">
        {data.operation}
      </p>
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
    </div>
  );
});

const nodeTypes: NodeTypes = { postureAlgo: PostureAlgoNode };

function InnerCanvas(props: {
  run: MarketHubSynthesisRun | null;
  hydration: MarketHubModelHydration | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const graph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration: props.hydration,
        stages: props.run?.stages ?? null,
      }),
    [props.hydration, props.run],
  );
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
          stageStatus: n.data.stageId ? byStage.get(n.data.stageId)?.status : undefined,
          selected: props.selectedNodeId === n.id,
        },
        selectable: true,
      })),
    [graph.nodes, byStage, props.selectedNodeId],
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
      void fitView({ padding: 0.1, maxZoom: 0.85, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_e, node) => props.onSelectNode(node.id)}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnScroll={false}
      minZoom={0.12}
      maxZoom={1.2}
      proOptions={{ hideAttribution: true }}
      className="bg-[var(--color-surface-0)]"
    >
      <Background gap={14} size={1} color="var(--color-line)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

function NodeInspector(props: {
  node: PostureAlgoNodeData | null;
  stage: MarketHubSynthesisStage | null;
}) {
  if (!props.node) {
    return (
      <p className="text-[10px] text-[var(--color-ink-faint)]">
        Select a live source, library, or stage for operation detail.
      </p>
    );
  }
  const n = props.node;
  const s = props.stage;
  return (
    <div className="space-y-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
        {roleLabel(n.nodeRole)} · {n.label}
      </p>
      <p className="font-mono text-[11px] tabular-nums text-[var(--color-ink)]">
        {n.amount} · {n.operation}
      </p>
      {s?.summary ? (
        <Justification
          sourceClass={s.kind === 'llm' ? 'model_generated' : 'deterministic_scan'}
          lines={
            s.justificationLines.length > 0 ? s.justificationLines : [s.summary]
          }
        >
          <p className="text-[11px] text-[var(--color-ink)]">{s.summary}</p>
        </Justification>
      ) : (
        <p className="text-[10px] text-[var(--color-ink-faint)]">{n.detail}</p>
      )}
      {s ? (
        <p className="font-mono text-[8px] text-[var(--color-ink-faint)]">
          {s.startedAt ? `start ${new Date(s.startedAt).toLocaleTimeString()}` : '—'}
          {s.finishedAt ? ` · end ${new Date(s.finishedAt).toLocaleTimeString()}` : ''}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Live synthesis hub canvas (D-120 / D-147).
 * Shows all live + library baseline sources hydrating into Analyze stages.
 * Status from synthesis run; never driven by equity live poll (D-112).
 */
export const MarketPostureModelCanvas = memo(function MarketPostureModelCanvas(props: {
  className?: string;
  run?: MarketHubSynthesisRun | null;
  hydration?: MarketHubModelHydration | null;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const hydration = props.hydration ?? null;
  const graph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration,
        stages: props.run?.stages ?? null,
      }),
    [hydration, props.run],
  );
  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId)?.data ?? null;
  const selectedStage =
    selectedNode?.stageId != null
      ? (props.run?.stages.find((s) => s.stageId === selectedNode.stageId) ?? null)
      : null;
  const done = props.run?.stages.filter(
    (s) => s.status === 'succeeded' || s.status === 'skipped' || s.status === 'failed',
  ).length;
  const total = props.run?.stages.length ?? 0;
  const liveN = hydration?.liveSources.length ?? 0;
  const libN = hydration?.librarySources.length ?? 0;

  return (
    <div className={`space-y-2 ${props.className ?? ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
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
            Baseline hydration — Analyze to animate stages
          </p>
        )}
        <p
          className="font-mono text-[9px] text-[var(--color-ink-faint)]"
          data-testid="market-posture-model-hydration-totals"
        >
          Live {liveN}
          {hydration ? ` · ${hydration.totals.liveReady} ready` : ''}
          {` · Libraries ${libN}`}
          {hydration ? ` · ${hydration.totals.admittedConcepts} admitted` : ''}
        </p>
      </div>
      <div
        data-testid="market-posture-model-canvas"
        className="h-[min(32rem,55vh)] min-h-[280px] overflow-hidden rounded border border-[var(--color-line)]"
        role="img"
        aria-label="Market posture synthesis hydration model"
      >
        <ReactFlowProvider>
          <InnerCanvas
            run={props.run ?? null}
            hydration={hydration}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </ReactFlowProvider>
      </div>
      <NodeInspector node={selectedNode} stage={selectedStage} />
    </div>
  );
});
