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
  resolveStageScreenId,
  type PostureAlgoEdgeData,
  type PostureAlgoNodeData,
} from '@/lib/market-posture-algorithm-graph';
import type { MarketPostureStageScreenId } from '@/lib/market-posture-stage-screens';

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

/** Per-role chrome — distinct fills/borders so node types read at a glance (D-163 / D-165 / D-169). */
function roleChrome(role: PostureAlgoNodeData['nodeRole']): string {
  switch (role) {
    case 'live_source':
      return 'border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-surface-1)]';
    case 'library_source':
      return 'border-l-[3px] border-l-[var(--color-ink-dim)] bg-[var(--color-surface-1)] border-dashed';
    case 'capital_source':
      return 'border-l-[3px] border-l-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,var(--color-surface-1))]';
    case 'adapter':
      return 'border-l-[3px] border-l-[var(--color-ink-faint)] bg-[var(--color-surface-0)]';
    case 'process':
      return 'border-l-[3px] border-l-[var(--color-accent)] border-dotted bg-[var(--color-surface-0)]';
    case 'process_cluster':
      return 'border border-[var(--color-line)] border-dashed bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-surface-0))]';
    case 'stage':
      return 'border-[var(--color-line)] bg-[var(--color-surface-1)]';
    case 'panel_surface':
      return 'border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_6%,var(--color-surface-1))]';
    case 'lane_label':
      return 'border-transparent bg-transparent shadow-none';
    case 'screen_group':
      return 'border-[var(--color-line)] bg-[var(--color-surface-1)]/80';
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

/** Per-function process chrome (D-169) — fetch ≠ normalize ≠ score ≠ seal. */
function processFunctionChrome(fn: string | undefined): string {
  switch (fn) {
    case 'fetch':
      return 'border-l-[3px] border-l-sky-500 bg-[color-mix(in_srgb,rgb(14_165_233)_10%,var(--color-surface-0))]';
    case 'normalize':
      return 'border-l-[3px] border-l-violet-400 bg-[color-mix(in_srgb,rgb(167_139_250)_8%,var(--color-surface-0))]';
    case 'extract':
      return 'border-l-[3px] border-l-amber-400 bg-[color-mix(in_srgb,rgb(251_191_36)_8%,var(--color-surface-0))]';
    case 'corroborate':
      return 'border-l-[3px] border-l-teal-400 bg-[color-mix(in_srgb,rgb(45_212_191)_8%,var(--color-surface-0))]';
    case 'entitle':
      return 'border-l-[3px] border-l-[var(--color-ink-faint)] bg-[var(--color-surface-1)]';
    case 'announce':
      return 'border-l-[3px] border-l-[var(--color-ink-dim)] border-dashed bg-[var(--color-surface-0)]';
    case 'score':
      return 'border-l-[3px] border-l-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-surface-0))]';
    case 'rank':
      return 'border-l-[3px] border-l-orange-400 bg-[color-mix(in_srgb,rgb(251_146_60)_10%,var(--color-surface-0))]';
    case 'verify':
      return 'border-l-[3px] border-l-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_10%,var(--color-surface-0))]';
    case 'seal':
      return 'border-l-[3px] border-l-emerald-600 bg-[color-mix(in_srgb,rgb(5_150_105)_12%,var(--color-surface-0))]';
    case 'compose':
      return 'border-l-[3px] border-l-[var(--color-ink)] bg-[var(--color-surface-1)]';
    case 'load':
      return 'border-l-[3px] border-l-indigo-400 border-dashed bg-[var(--color-surface-0)]';
    case 'defaults':
      return 'border-l-[3px] border-l-[var(--color-line)] bg-[var(--color-surface-0)]';
    case 'thresholds':
      return 'border-l-[3px] border-l-[var(--color-accent)] border-dashed bg-[var(--color-surface-0)]';
    case 'context':
      return 'border-l-[3px] border-l-cyan-500 bg-[color-mix(in_srgb,rgb(6_182_212)_10%,var(--color-surface-0))]';
    default:
      return 'border-l-[3px] border-l-[var(--color-accent)] border-dotted bg-[var(--color-surface-0)]';
  }
}

/** Domain tint for live SRC nodes (D-169) — matches ResearchSourceDomain. */
function sourceDomainChrome(domain: string | undefined): string {
  const d = (domain ?? '').toLowerCase();
  if (d === 'news' || d === 'equity_news' || d === 'web_search') {
    return 'border-l-[3px] border-l-sky-400 bg-[color-mix(in_srgb,rgb(56_189_248)_8%,var(--color-surface-1))]';
  }
  if (d === 'filings') {
    return 'border-l-[3px] border-l-amber-500 bg-[color-mix(in_srgb,rgb(245_158_11)_8%,var(--color-surface-1))]';
  }
  if (d === 'macro' || d === 'fx') {
    return 'border-l-[3px] border-l-violet-400 bg-[color-mix(in_srgb,rgb(167_139_250)_8%,var(--color-surface-1))]';
  }
  if (d === 'crypto') {
    return 'border-l-[3px] border-l-fuchsia-400 bg-[color-mix(in_srgb,rgb(232_121_249)_8%,var(--color-surface-1))]';
  }
  if (d === 'equity_bars') {
    return 'border-l-[3px] border-l-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-surface-1))]';
  }
  return 'border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-surface-1)]';
}

function processFunctionLabel(fn: string | undefined): string {
  if (!fn) return 'PROC';
  return fn.slice(0, 8).toUpperCase();
}

function roleLabel(role: PostureAlgoNodeData['nodeRole']): string {
  switch (role) {
    case 'live_source':
      return 'SRC';
    case 'adapter':
      return 'ADAPT';
    case 'process':
      return 'PROC';
    case 'process_cluster':
      return 'ROUTE';
    case 'library_source':
      return 'LIB';
    case 'capital_source':
      return 'CAP';
    case 'stage':
      return 'STAGE';
    case 'panel_surface':
      return 'PANEL';
    case 'lane_label':
      return 'LANE';
    case 'screen_group':
      return 'GROUP';
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
    case 'panel':
      return '3 2';
    case 'emit':
      return '2 6';
    default: {
      const _exhaustive: never = edgeType;
      return _exhaustive;
    }
  }
}

function styleModelEdge(
  edge: {
    id: string;
    source: string;
    target: string;
    label?: string | undefined;
    data: PostureAlgoEdgeData;
  },
  opts?: { crossScreen?: boolean },
): LiveEdge {
  const { edgeType, activation, status, track } = edge.data;
  const stroke = trackStroke(track);
  const animated = activation === 'active' || activation === 'pulsing';
  const cross = opts?.crossScreen === true || edge.id.startsWith('e-group:');
  const width =
    edgeType === 'emit'
      ? cross
        ? 1.6
        : 1
      : activation === 'active' || activation === 'pulsing'
        ? 2.2
        : cross
          ? 1.8
          : 1.2;
  const opacity =
    activation === 'blocked' || activation === 'stale'
      ? 0.35
      : edgeType === 'emit'
        ? activation === 'idle'
          ? 0.4
          : cross
            ? 0.85
            : 0.65
        : activation === 'idle'
          ? cross
            ? 0.55
            : 0.45
          : activation === 'armed'
            ? 0.75
            : 1;
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
    animated: animated || cross,
    zIndex: cross ? 8 : edgeType === 'emit' ? 2 : 4,
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
  if (data.nodeRole === 'lane_label') {
    return (
      <div
        className="pointer-events-none w-[88px] select-none"
        data-testid="market-posture-model-node-lane_label"
        data-track={data.track}
      >
        <div
          className="mb-1 h-0.5 w-full rounded-full"
          style={{ background: trackStroke(data.track) }}
          aria-hidden
        />
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: trackStroke(data.track) }}
        >
          {data.label}
        </p>
        <p className="mt-0.5 font-mono text-[7px] leading-tight text-[var(--color-ink-faint)]">
          {data.detail}
        </p>
      </div>
    );
  }

  const ring = data.selected
    ? 'ring-1 ring-[var(--color-accent)]'
    : activationRing(data.activation);
  return (
    <div
      className={`min-w-[140px] max-w-[240px] rounded border border-t-[3px] px-1.5 py-1 shadow-sm ${kindBorder(data.kind)} ${
        data.nodeRole === 'process'
          ? processFunctionChrome(data.processFunction)
          : data.nodeRole === 'live_source'
            ? sourceDomainChrome(data.sourceDomain)
            : roleChrome(data.nodeRole)
      } ${ring}`}
      style={{ borderTopColor: trackStroke(data.track) }}
      data-testid={`market-posture-model-node-${data.nodeRole}`}
      data-activation={data.activation}
      data-track={data.track}
      data-layer={data.layer}
      data-capital-bearing={data.capitalBearing ? 'true' : undefined}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
      <div className="flex items-baseline justify-between gap-1">
        <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {data.nodeRole === 'process'
            ? processFunctionLabel(data.processFunction)
            : roleLabel(data.nodeRole)}{' '}
          · {data.layer}
        </p>
        <p
          className="font-mono text-[8px] uppercase tracking-wider"
          style={{ color: trackStroke(data.track) }}
          title={`track ${data.track} · ${data.activation} / ${data.status}`}
        >
          {data.track}
        </p>
      </div>
      <p className="truncate text-[11px] font-medium text-[var(--color-ink)]" title={data.label}>
        {data.label}
      </p>
      <p
        className={
          data.capitalBearing
            ? 'mt-1 font-mono text-[12px] font-semibold tabular-nums tracking-tight text-[var(--color-ok)]'
            : 'mt-0.5 font-mono text-[10px] tabular-nums text-[var(--color-ink)]'
        }
        data-testid={data.capitalBearing ? 'market-posture-model-capital-amount' : undefined}
        title={data.amount}
      >
        {data.amount}
      </p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)]">
        {data.operation}
      </p>
      {data.nodeRole === 'stage' ? (
        <p className="mt-0.5 font-mono text-[8px] text-[var(--color-ink-dim)]">
          <span aria-hidden>{statusGlyph(data.stageStatus)}</span> {statusWord(data.stageStatus)}
        </p>
      ) : (
        <p className="mt-0.5 font-mono text-[8px] uppercase text-[var(--color-ink-faint)]">
          {data.activation}
        </p>
      )}
      {data.nodeRole === 'adapter' && data.analysisRoles && data.analysisRoles.length > 0 ? (
        <p
          className="mt-0.5 truncate font-mono text-[8px] text-[var(--color-ink-dim)]"
          title={data.analysisRoles.join(' · ')}
        >
          {data.analysisRoles.join(' · ')}
        </p>
      ) : null}
      {data.nodeRole === 'process' && data.processRoute ? (
        <p
          className="mt-0.5 truncate font-mono text-[8px] text-[var(--color-ink-dim)]"
          title={`${data.processFunction ?? ''} · ${data.processRoute}`}
        >
          {(data.processFunction ? `${data.processFunction} · ` : '') +
            data.processRoute.replace(/_/g, ' ')}
        </p>
      ) : null}
      {(data.nodeRole === 'live_source' ||
        data.nodeRole === 'library_source' ||
        data.nodeRole === 'capital_source') &&
      data.detail ? (
        <p
          className="mt-0.5 truncate font-mono text-[8px] text-[var(--color-ink-faint)]"
          title={data.detail}
        >
          {data.detail}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-[var(--color-ink-faint)]" />
    </div>
  );
});

const PostureGroupNode = memo(function PostureGroupNode({
  data,
}: NodeProps<Node<LiveNodeData>>) {
  const isCluster = data.nodeRole === 'process_cluster';
  return (
    <div
      className={`h-full w-full rounded border ${
        isCluster
          ? 'border-dashed border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-accent)_5%,var(--color-surface-0))]'
          : 'border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-surface-0)_70%,transparent)]'
      } ${data.selected ? 'ring-1 ring-[var(--color-accent)]' : ''}`}
      data-testid={
        isCluster
          ? 'market-posture-model-node-process_cluster'
          : 'market-posture-model-node-screen_group'
      }
      data-stage-screen={data.stageScreenId}
      data-process-route={data.processRoute}
    >
      <div className="flex items-center justify-between gap-1 border-b border-[var(--color-line)] px-1.5 py-0.5">
        <p
          className={`font-mono uppercase tracking-[0.12em] text-[var(--color-ink)] ${
            isCluster ? 'text-[8px] font-medium' : 'text-[9px] font-semibold'
          }`}
        >
          {isCluster ? `Route · ${data.label}` : data.label}
        </p>
        <span className="font-mono text-[8px] tabular-nums text-[var(--color-ink-faint)]">
          {data.amount}
        </span>
      </div>
      {isCluster && data.detail ? (
        <p className="truncate px-1.5 pt-0.5 font-mono text-[7px] text-[var(--color-ink-faint)]">
          {data.detail}
        </p>
      ) : null}
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !bg-[var(--color-line)]" />
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !bg-[var(--color-line)]" />
    </div>
  );
});

const nodeTypes: NodeTypes = {
  postureAlgo: PostureAlgoNode,
  postureGroup: PostureGroupNode,
};

function InnerCanvas(props: {
  run: MarketHubSynthesisRun | null;
  hydration: MarketHubModelHydration | null;
  pulsedEdgeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  layoutMode: 'default' | 'stripExpanded';
  onNavigate?: ((nodeId: string, screenId: MarketPostureStageScreenId) => void) | undefined;
}) {
  const graph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration: props.hydration,
        stages: props.run?.stages ?? null,
        pulsedEdgeIds: props.pulsedEdgeIds,
        layoutMode: props.layoutMode,
      }),
    [props.hydration, props.run, props.pulsedEdgeIds, props.layoutMode],
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
        selectable: n.data.nodeRole !== 'lane_label',
      })),
    [graph.nodes, byStage, props.selectedNodeId],
  );

  const styledEdges = useMemo(() => {
    const screenById = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.data.stageScreenId) screenById.set(n.id, n.data.stageScreenId);
    }
    return graph.edges.map((e) => {
      const a = screenById.get(e.source);
      const b = screenById.get(e.target);
      const crossScreen =
        e.id.startsWith('e-group:') ||
        (a != null && b != null && a !== b);
      return styleModelEdge(e, { crossScreen });
    });
  }, [graph.edges, graph.nodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(liveNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(styledEdges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(liveNodes);
  }, [liveNodes, setNodes]);

  useEffect(() => {
    setEdges(styledEdges);
    const frame = requestAnimationFrame(() => {
      const padding = props.layoutMode === 'stripExpanded' ? 0.08 : 0.18;
      const maxZoom = props.layoutMode === 'stripExpanded' ? 0.85 : 0.75;
      void fitView({ padding, maxZoom, duration: 220 });
    });
    return () => cancelAnimationFrame(frame);
  }, [styledEdges, setEdges, fitView, props.layoutMode]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_e, node) => {
        const data = node.data as LiveNodeData;
        if (data.nodeRole === 'lane_label') return;
        props.onSelectNode(node.id);
        if (data.nodeRole === 'screen_group' && data.stageScreenId) {
          props.onNavigate?.(
            node.id,
            data.stageScreenId as MarketPostureStageScreenId,
          );
          return;
        }
        if (data.nodeRole === 'process_cluster') {
          props.onNavigate?.(node.id, 'process');
          return;
        }
        const screenId = resolveStageScreenId({
          nodeId: node.id,
          nodeRole: data.nodeRole,
          stageId: data.stageId ?? null,
          panelSurfaceId: data.panelSurfaceId ?? null,
        });
        props.onNavigate?.(node.id, screenId);
      }}
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
        Select a data source, adapter, process step, capital fund, stage, or panel surface.
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
      {n.nodeRole === 'process' ? (
        <p className="text-[10px] text-[var(--color-ink)]">
          Route {n.processRoute?.replace(/_/g, ' ') ?? '—'}
          {n.processStepId ? ` · ${n.processStepId}` : ''}
        </p>
      ) : null}
      {n.capitalBearing ? (
        <p className="font-mono text-[12px] font-semibold tabular-nums text-[var(--color-ok)]">
          Amount {n.amount}
        </p>
      ) : null}
      {n.nodeRole === 'panel_surface' ? (
        <p className="text-[10px] text-[var(--color-ink)]">
          Panel {n.panelKind ?? '—'}
          {n.panelSurfaceId ? ` · ${n.panelSurfaceId}` : ''}
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
  compact?: boolean;
}) {
  if (props.compact) {
    return (
      <div
        className="flex flex-wrap gap-x-2 gap-y-0.5"
        data-testid="market-posture-model-track-legend"
      >
        {props.tracks.map((t) => (
          <p
            key={t.id}
            className="font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]"
            title={t.summary}
          >
            <span
              className="mr-1 inline-block h-1.5 w-3 align-middle rounded-sm"
              style={{ background: trackStroke(t.id) }}
              aria-hidden
            />
            {t.label}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1.5" data-testid="market-posture-model-track-legend">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-dim)]">
          Tracks
        </p>
        {props.tracks.map((t) => (
          <p
            key={t.id}
            className="font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]"
            title={t.summary}
          >
            <span
              className="mr-1 inline-block h-1.5 w-4 align-middle rounded-sm"
              style={{ background: trackStroke(t.id) }}
              aria-hidden
            />
            {t.label}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <p className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-ink-dim)]">
          Types
        </p>
        {(
          [
            ['SRC', 'live API · domain tint'],
            ['LIB', 'library'],
            ['CAP', 'capital'],
            ['ADAPT', 'adapter'],
            ['FETCH', 'process fetch'],
            ['NORM', 'normalize'],
            ['SCORE', 'score / RS'],
            ['SEAL', 'seal'],
            ['STAGE', 'milestone'],
            ['PANEL', 'board'],
          ] as const
        ).map(([code, hint]) => (
          <p
            key={code}
            className="font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]"
            title={hint}
          >
            {code}
          </p>
        ))}
      </div>
      <p className="font-mono text-[8px] text-[var(--color-ink-faint)]">
        Layers: sources → adapters → pipeline → output · edges: hydrate dashed · adapt solid ·
        corpus dash · ∥ parallel · panel → boards · emit dashed mid-pipeline metrics · top bar =
        track color
      </p>
    </div>
  );
}

function stageSignature(run: MarketHubSynthesisRun | null): string {
  if (!run) return '';
  return run.stages.map((s) => `${s.stageId}:${s.status}:${s.finishedAt ?? ''}`).join('|');
}

/**
 * Live synthesis hub canvas (D-120 / D-147 / D-156 / D-160 / D-165 / D-169 / D-186).
 * Track-banded layout; typed edges; pulses on Sync/Analyze refresh.
 * `variant="strip"` — fixed bottom dock with expanded graph + navigate callbacks.
 */
export const MarketPostureModelCanvas = memo(function MarketPostureModelCanvas(props: {
  className?: string;
  run?: MarketHubSynthesisRun | null;
  hydration?: MarketHubModelHydration | null;
  /** embedded = mid-page card; strip = bottom Model dock (D-186). */
  variant?: 'embedded' | 'strip';
  /** Selected node controlled by parent when using ViewContext (D-186). */
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onNavigate?: (nodeId: string, screenId: MarketPostureStageScreenId) => void;
}) {
  const variant = props.variant ?? 'embedded';
  const layoutMode = variant === 'strip' ? 'stripExpanded' : 'default';
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedNodeId = props.selectedNodeId ?? internalSelected;
  const setSelectedNodeId = props.onSelectNode ?? setInternalSelected;
  const [pulsedEdgeIds, setPulsedEdgeIds] = useState<ReadonlySet<string>>(() => new Set());
  const prevAsOf = useRef<string | null>(null);
  const prevStageSig = useRef('');
  const prevLivePatched = useRef<string | null>(null);
  const hydration = props.hydration ?? null;
  const run = props.run ?? null;

  const baselineGraph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration,
        stages: run?.stages ?? null,
        layoutMode,
      }),
    [hydration, run, layoutMode],
  );

  useEffect(() => {
    const nextAsOf = hydration?.asOfIso ?? null;
    const nextSig = stageSignature(run);
    const nextLive = hydration?.livePatchedAt ?? null;
    const pulse = collectModelPulseIds({
      prevAsOf: prevAsOf.current,
      nextAsOf,
      prevStageSig: prevStageSig.current,
      nextStageSig: nextSig,
      prevLivePatchedAt: prevLivePatched.current,
      nextLivePatchedAt: nextLive,
      edgeIds: baselineGraph.edges.map((e) => e.id),
      stageIds: baselineGraph.nodes.filter((n) => n.data.nodeRole === 'stage').map((n) => n.id),
      panelNodeIds: baselineGraph.nodes
        .filter((n) => n.data.nodeRole === 'panel_surface')
        .map((n) => n.id),
    });
    prevAsOf.current = nextAsOf;
    prevStageSig.current = nextSig;
    prevLivePatched.current = nextLive;
    if (pulse.size === 0) return;
    setPulsedEdgeIds(pulse);
    const t = window.setTimeout(() => setPulsedEdgeIds(new Set()), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [hydration?.asOfIso, hydration?.livePatchedAt, run, baselineGraph]);

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
  const isStrip = variant === 'strip';

  return (
    <div className={`flex min-h-0 flex-col ${isStrip ? 'h-full gap-1' : 'space-y-2'} ${props.className ?? ''}`}>
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
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
          {hydration && (hydration.processSteps?.length ?? 0) > 0
            ? ` · ${hydration.processSteps.length} steps`
            : ''}
          {hydration && (hydration.panelSurfaces?.length ?? 0) > 0
            ? ` · ${hydration.panelSurfaces.length} panels`
            : ''}
          {hydration?.asOfIso
            ? ` · asOf ${new Date(hydration.asOfIso).toLocaleTimeString()}`
            : ''}
          {hydration?.livePatchedAt
            ? ` · live ${new Date(hydration.livePatchedAt).toLocaleTimeString()}`
            : ''}
        </p>
      </div>
      <TrackLegend tracks={baselineGraph.tracks} compact={isStrip} />
      <div
        data-testid="market-posture-model-canvas"
        className={
          isStrip
            ? 'min-h-0 flex-1 overflow-hidden border border-[var(--color-line)] bg-[var(--color-surface-0)]'
            : 'h-[min(40rem,62vh)] min-h-[320px] overflow-hidden rounded border border-[var(--color-line)]'
        }
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
            layoutMode={layoutMode}
            onNavigate={props.onNavigate}
          />
        </ReactFlowProvider>
      </div>
      {selectedNode ? (
        <div className={isStrip ? 'max-h-24 shrink-0 overflow-y-auto' : undefined}>
          <NodeInspector node={selectedNode} stage={selectedStage} />
        </div>
      ) : null}
    </div>
  );
});
