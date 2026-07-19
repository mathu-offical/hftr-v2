'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  MarketHubModelEdgeActivation,
  MarketHubModelEdgeType,
  MarketHubModelHydration,
  MarketHubModelTrack,
  MarketHubSynthesisRun,
  MarketHubSynthesisStage,
  MarketHubSynthesisStageStatus,
} from '@hftr/contracts';
import { Justification } from '@/components/panels/Justification';
import {
  buildMarketPostureAlgorithmGraph,
  collectModelPulseIds,
  type PostureAlgoEdgeData,
  type PostureAlgoNodeData,
} from '@/lib/market-posture-algorithm-graph';

const PULSE_MS = 2_200;

type LiveNodeData = PostureAlgoNodeData & {
  stageStatus?: MarketHubSynthesisStageStatus;
  selected?: boolean;
};

type LiveEdge = Edge<PostureAlgoEdgeData>;

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
    case 'adapter':
      return 'ADAPT';
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

function activationRing(activation: MarketHubModelEdgeActivation): string {
  switch (activation) {
    case 'active':
      return 'ring-1 ring-[var(--color-accent)]';
    case 'pulsing':
      return 'ring-2 ring-[var(--color-ok)] animate-pulse';
    case 'blocked':
      return 'opacity-60';
    case 'stale':
      return 'opacity-70';
    case 'armed':
    case 'idle':
      return '';
    default: {
      const _exhaustive: never = activation;
      return _exhaustive;
    }
  }
}

function trackStroke(track: MarketHubModelTrack): string {
  switch (track) {
    case 'entitle':
      return 'var(--color-ink-faint)';
    case 'compound':
      return 'var(--color-accent)';
    case 'sector':
      return 'var(--color-ok)';
    case 'daily':
      return 'var(--color-ink-dim)';
    case 'compose':
      return 'var(--color-ink)';
    default: {
      const _exhaustive: never = track;
      return _exhaustive;
    }
  }
}

function edgeTypeDash(edgeType: MarketHubModelEdgeType): string | undefined {
  switch (edgeType) {
    case 'hydrate':
      return '4 3';
    case 'adapt':
      return undefined;
    case 'pipeline':
      return undefined;
    case 'entitle':
      return '2 2';
    case 'corpus':
      return '6 3';
    case 'parallel':
      return '1 4';
    default: {
      const _exhaustive: never = edgeType;
      return _exhaustive;
    }
  }
}

function styleModelEdge(edge: {
  id: string;
  source: string;
  target: string;
  label?: string;
  data: PostureAlgoEdgeData;
}): LiveEdge {
  const { edgeType, activation, status, track } = edge.data;
  const stroke = trackStroke(track);
  const animated = activation === 'active' || activation === 'pulsing';
  const opacity =
    activation === 'blocked' || activation === 'stale'
      ? 0.35
      : activation === 'idle'
        ? 0.45
        : activation === 'armed'
          ? 0.75
          : 1;
  const width = activation === 'active' || activation === 'pulsing' ? 2.2 : 1.2;
  const label =
    edge.label != null
      ? `${edge.label} · ${activation}/${status}`
      : `${edgeType} · ${activation}`;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label,
    data: edge.data,
    animated,
    style: {
      stroke,
      strokeWidth: width,
      opacity,
      strokeDasharray: edgeTypeDash(edgeType),
    },
    labelStyle: {
      fill: 'var(--color-ink-faint)',
      fontSize: 8,
      fontFamily: 'ui-monospace, monospace',
    },
    labelBgStyle: { fill: 'var(--color-surface-0)', fillOpacity: 0.85 },
  };
}

const PostureAlgoNode = memo(function PostureAlgoNode({
  data,
}: NodeProps<Node<LiveNodeData>>) {
  const ring = data.selected
    ? 'ring-1 ring-[var(--color-accent)]'
    : activationRing(data.activation);
  return (
    <div
      className={`min-w-[152px] max-w-[176px] rounded border bg-[var(--color-surface-1)] px-2 py-1.5 shadow-sm ${kindBorder(data.kind)} ${ring}`}
      data-testid={`market-posture-model-node-${data.nodeRole}`}
      data-activation={data.activation}
      data-track={data.track}
      data-layer={data.layer}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
      <div className="flex items-baseline justify-between gap-1">
        <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {roleLabel(data.nodeRole)} · {data.track}
        </p>
        <p
          className="font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-dim)]"
          title={`${data.activation} / ${data.status}`}
        >
          {data.nodeRole === 'stage' ? (
            <>
              <span aria-hidden>{statusGlyph(data.stageStatus)}</span>{' '}
              {statusWord(data.stageStatus)}
            </>
          ) : (
            data.activation
          )}
        </p>
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
      {data.nodeRole === 'adapter' && data.analysisRoles && data.analysisRoles.length > 0 ? (
        <p
          className="mt-0.5 truncate font-mono text-[8px] text-[var(--color-ink-dim)]"
          title={data.analysisRoles.join(' · ')}
        >
          {data.analysisRoles.join(' · ')}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
    </div>
  );
});

const nodeTypes: NodeTypes = { postureAlgo: PostureAlgoNode };

function InnerCanvas(props: {
  run: MarketHubSynthesisRun | null;
  hydration: MarketHubModelHydration | null;
  pulsedEdgeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  const graph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration: props.hydration,
        stages: props.run?.stages ?? null,
        pulsedEdgeIds: props.pulsedEdgeIds,
      }),
    [props.hydration, props.run, props.pulsedEdgeIds],
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

  const styledEdges = useMemo(() => graph.edges.map(styleModelEdge), [graph.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(liveNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(styledEdges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(liveNodes);
  }, [liveNodes, setNodes]);

  useEffect(() => {
    setEdges(styledEdges);
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.1, maxZoom: 0.85, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [styledEdges, setEdges, fitView]);

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
        Select a live source, adapter, library, or stage for operation detail.
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
      <p className="font-mono text-[10px] text-[var(--color-ink-dim)]">
        layer {n.layer} · track {n.track} · {n.activation}/{n.status}
      </p>
      <p className="font-mono text-[11px] tabular-nums text-[var(--color-ink)]">
        {n.amount} · {n.operation}
      </p>
      {n.nodeRole === 'adapter' && n.analysisRoles && n.analysisRoles.length > 0 ? (
        <p className="text-[10px] text-[var(--color-ink)]">
          Analysis: {n.analysisRoles.join(' · ')}
          {n.pipelines && n.pipelines.length > 0
            ? ` · pipelines ${n.pipelines.join('+')}`
            : ''}
        </p>
      ) : null}
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
      {n.updatedAt ? (
        <p className="font-mono text-[8px] text-[var(--color-ink-faint)]">
          updated {new Date(n.updatedAt).toLocaleTimeString()}
        </p>
      ) : null}
      {s ? (
        <p className="font-mono text-[8px] text-[var(--color-ink-faint)]">
          {s.startedAt ? `start ${new Date(s.startedAt).toLocaleTimeString()}` : '—'}
          {s.finishedAt ? ` · end ${new Date(s.finishedAt).toLocaleTimeString()}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function TrackLegend(props: {
  tracks: Array<{ id: MarketHubModelTrack; label: string; summary: string }>;
}) {
  return (
    <div
      className="flex flex-wrap gap-x-3 gap-y-1"
      data-testid="market-posture-model-track-legend"
    >
      {props.tracks.map((t) => (
        <p
          key={t.id}
          className="font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]"
          title={t.summary}
        >
          <span
            className="mr-1 inline-block h-1.5 w-3 align-middle"
            style={{ background: trackStroke(t.id) }}
            aria-hidden
          />
          {t.label}
        </p>
      ))}
      <p className="font-mono text-[8px] text-[var(--color-ink-faint)]">
        edges: hydrate dashed · adapt solid · corpus dash · ∥ parallel · pulse on refresh
      </p>
    </div>
  );
}

function stageSignature(run: MarketHubSynthesisRun | null): string {
  if (!run) return '';
  return run.stages.map((s) => `${s.stageId}:${s.status}:${s.finishedAt ?? ''}`).join('|');
}

/**
 * Live synthesis hub canvas (D-120 / D-147 / D-156 / D-160).
 * Typed edges with activation/status; pulses on Sync/Analyze refresh.
 */
export const MarketPostureModelCanvas = memo(function MarketPostureModelCanvas(props: {
  className?: string;
  run?: MarketHubSynthesisRun | null;
  hydration?: MarketHubModelHydration | null;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pulsedEdgeIds, setPulsedEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  const prevAsOf = useRef<string | null>(null);
  const prevStageSig = useRef('');
  const hydration = props.hydration ?? null;
  const run = props.run ?? null;

  const baselineGraph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration,
        stages: run?.stages ?? null,
      }),
    [hydration, run],
  );

  useEffect(() => {
    const nextAsOf = hydration?.asOfIso ?? null;
    const nextSig = stageSignature(run);
    const pulse = collectModelPulseIds({
      prevAsOf: prevAsOf.current,
      nextAsOf,
      prevStageSig: prevStageSig.current,
      nextStageSig: nextSig,
      edgeIds: baselineGraph.edges.map((e) => e.id),
      stageIds: baselineGraph.nodes.filter((n) => n.data.nodeRole === 'stage').map((n) => n.id),
    });
    prevAsOf.current = nextAsOf;
    prevStageSig.current = nextSig;
    if (pulse.size === 0) return;
    setPulsedEdgeIds(pulse);
    const t = window.setTimeout(() => setPulsedEdgeIds(new Set()), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [hydration?.asOfIso, run, baselineGraph]);

  const selectedNode = baselineGraph.nodes.find((n) => n.id === selectedNodeId)?.data ?? null;
  const selectedStage =
    selectedNode?.stageId != null
      ? (run?.stages.find((s) => s.stageId === selectedNode.stageId) ?? null)
      : null;
  const done = run?.stages.filter(
    (s) => s.status === 'succeeded' || s.status === 'skipped' || s.status === 'failed',
  ).length;
  const total = run?.stages.length ?? 0;
  const liveN = hydration?.liveSources.length ?? 0;
  const libN = hydration?.librarySources.length ?? 0;

  return (
    <div className={`space-y-2 ${props.className ?? ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {run ? (
          <p
            className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]"
            data-testid="market-posture-synthesis-strip"
          >
            Run {run.status}
            {total > 0 ? ` · ${done ?? 0}/${total} stages` : ''}
            {pulsedEdgeIds.size > 0 ? ' · refreshing' : ''}
          </p>
        ) : (
          <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            Baseline hydration — Analyze to animate stages
            {pulsedEdgeIds.size > 0 ? ' · refreshed' : ''}
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
          {hydration && hydration.processingFlows.length > 0
            ? ` · ${hydration.processingFlows.length} flows`
            : ''}
          {hydration?.asOfIso
            ? ` · asOf ${new Date(hydration.asOfIso).toLocaleTimeString()}`
            : ''}
        </p>
      </div>
      <TrackLegend tracks={baselineGraph.tracks} />
      <div
        data-testid="market-posture-model-canvas"
        className="h-[min(32rem,55vh)] min-h-[280px] overflow-hidden rounded border border-[var(--color-line)]"
        role="img"
        aria-label="Market posture synthesis hydration model"
      >
        <ReactFlowProvider>
          <InnerCanvas
            run={run}
            hydration={hydration}
            pulsedEdgeIds={pulsedEdgeIds}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </ReactFlowProvider>
      </div>
      <NodeInspector node={selectedNode} stage={selectedStage} />
    </div>
  );
});
