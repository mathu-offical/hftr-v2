'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeTypes,
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
import { MarketPostureOrthoEdge } from '@/components/panels/MarketPostureOrthoEdge';
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
  /** System id for strip chrome (kind / step / route). */
  systemKey?: string;
};

type LiveEdge = Edge<
  PostureAlgoEdgeData & {
    stripMode?: boolean;
    laneOffset?: number;
    railTitle?: string;
    railHuman?: string;
    railVerb?: string;
    railRole?: string;
    railBridge?: boolean;
  }
>;

const edgeTypes: EdgeTypes = {
  postureOrtho: MarketPostureOrthoEdge,
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

/** Per-role chrome — distinct fills/borders so node types read at a glance (D-163 / D-165 / D-169). */
function roleChrome(role: PostureAlgoNodeData['nodeRole']): string {
  switch (role) {
    case 'live_source':
      return 'border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-surface-1)]';
    case 'query_source':
      return 'border-l-[3px] border-l-amber-400 border-dashed bg-[color-mix(in_srgb,rgb(251_191_36)_10%,var(--color-surface-1))]';
    case 'library_source':
      return 'border-l-[3px] border-l-[var(--color-ink-dim)] bg-[var(--color-surface-1)] border-dashed';
    case 'research_engine':
      return 'border-l-[3px] border-l-fuchsia-500 bg-[color-mix(in_srgb,rgb(217_70_239)_10%,var(--color-surface-1))]';
    case 'research_articles':
      return 'border-l-[3px] border-l-emerald-400 bg-[color-mix(in_srgb,rgb(52_211_153)_10%,var(--color-surface-1))]';
    case 'capital_source':
      return 'border-l-[3px] border-l-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,var(--color-surface-1))]';
    case 'adapter':
      return 'border-l-[3px] border-l-[var(--color-ink-faint)] bg-[var(--color-surface-0)]';
    case 'process':
      return 'border-l-[3px] border-l-[var(--color-accent)] border-dotted bg-[var(--color-surface-0)]';
    case 'analysis':
      return 'border-l-[3px] border-l-cyan-500 bg-[color-mix(in_srgb,rgb(6_182_212)_12%,var(--color-surface-0))]';
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
    case 'organize':
      return 'border-l-[3px] border-l-cyan-400 bg-[color-mix(in_srgb,rgb(34_211_238)_10%,var(--color-surface-0))]';
    case 'route':
      return 'border-l-[3px] border-l-sky-500 bg-[color-mix(in_srgb,rgb(14_165_233)_10%,var(--color-surface-0))]';
    case 'analyze':
      return 'border-l-[3px] border-l-cyan-600 bg-[color-mix(in_srgb,rgb(8_145_178)_12%,var(--color-surface-0))]';
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
    case 'gather':
      return 'border-l-[3px] border-l-fuchsia-400 bg-[color-mix(in_srgb,rgb(232_121_249)_10%,var(--color-surface-0))]';
    case 'validate':
      return 'border-l-[3px] border-l-violet-500 bg-[color-mix(in_srgb,rgb(139_92_246)_10%,var(--color-surface-0))]';
    case 'synthesize':
      return 'border-l-[3px] border-l-pink-400 bg-[color-mix(in_srgb,rgb(244_114_182)_10%,var(--color-surface-0))]';
    case 'admit':
      return 'border-l-[3px] border-l-emerald-500 bg-[color-mix(in_srgb,rgb(16_185_129)_12%,var(--color-surface-0))]';
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
  if (fn === 'seal') return 'BOARD';
  if (fn === 'organize') return 'ORG';
  if (fn === 'route') return 'ROUTE';
  if (fn === 'analyze') return 'ANALYZE';
  return fn.slice(0, 8).toUpperCase();
}

function roleLabel(role: PostureAlgoNodeData['nodeRole']): string {
  switch (role) {
    case 'live_source':
      return 'SRC';
    case 'query_source':
      return 'QUERY';
    case 'adapter':
      return 'ADAPT';
    case 'process':
      return 'PROC';
    case 'analysis':
      return 'ANALYZE';
    case 'process_cluster':
      return 'ROUTE';
    case 'library_source':
      return 'LIB';
    case 'research_engine':
      return 'ENG';
    case 'research_articles':
      return 'ART';
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
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
    data: PostureAlgoEdgeData;
  },
  opts?: {
    crossScreen?: boolean;
    /** Strip: short transfer labels (no activation spam). */
    stripTransferLabels?: boolean;
    hideLabels?: boolean;
    /** Force Model orthogonal chrome (right-angle rails). */
    orthoStrip?: boolean;
    laneOffset?: number;
    /** Source node display name for strip rail labels. */
    sourceLabel?: string;
    sourceRole?: PostureAlgoNodeData['nodeRole'];
    targetLabel?: string;
    /** System id (kind / step / route) for silkscreen. */
    systemKey?: string;
    operation?: string;
    targetSystemKey?: string;
    /** Pulse overlay without rebuilding graph layout. */
    pulsed?: boolean;
  },
): LiveEdge {
  const { edgeType, activation, status, track } = edge.data;
  const stroke = trackStroke(track);
  const animated = activation === 'active' || activation === 'pulsing';
  const railBridge = edge.id.startsWith('e-rail:');
  const cross =
    opts?.crossScreen === true ||
    edge.id.startsWith('e-group:') ||
    railBridge;
  const strip = Boolean(opts?.stripTransferLabels || opts?.orthoStrip);
  const width =
    edgeType === 'emit'
      ? cross
        ? strip
          ? 2.2
          : 1.6
        : strip
          ? 1.8
          : 1.15
      : activation === 'active' || activation === 'pulsing'
        ? strip
          ? 3
          : 2.4
        : cross
          ? strip
            ? 2.4
            : 1.8
          : opts?.stripTransferLabels
            ? 2.6
            : 1.2;
  const opacity =
    activation === 'blocked' || activation === 'stale'
      ? 0.4
      : edgeType === 'emit'
        ? activation === 'idle'
          ? strip
            ? 0.65
            : 0.4
          : cross
            ? 0.95
            : 0.8
        : activation === 'idle'
          ? cross
            ? 0.7
            : strip
              ? 0.82
              : 0.5
          : activation === 'armed'
            ? strip
              ? 0.95
              : 0.8
            : 1;
  const transferWord = (() => {
    if (edge.label?.trim()) return edge.label.trim();
    switch (edgeType) {
      case 'hydrate':
        return 'hydrate';
      case 'adapt':
        return 'adapt';
      case 'pipeline':
        return 'transfer';
      case 'entitle':
        return 'entitle';
      case 'corpus':
        return 'corpus';
      case 'parallel':
        return 'parallel';
      case 'panel':
        return 'panel';
      case 'emit':
        return 'emit';
      default: {
        const _exhaustive: never = edgeType;
        return _exhaustive;
      }
    }
  })();
  const sourceName = (opts?.sourceLabel ?? '').trim();
  const targetName = (opts?.targetLabel ?? '').trim();
  const roleTag =
    opts?.sourceRole != null ? roleLabel(opts.sourceRole) : null;
  const sysKey = (opts?.systemKey ?? '').trim();
  const tgtSys = (opts?.targetSystemKey ?? '').trim();
  const op = (opts?.operation ?? '').trim();
  // Prefer system keys on copper silkscreen; human names ride as secondary.
  const railTitle = (() => {
    if (railBridge && sysKey && tgtSys) {
      return truncateSys(`${sysKey} → ${tgtSys}`, 36);
    }
    if (railBridge && edge.label?.trim()) {
      return truncateSys(edge.label.trim(), 36);
    }
    if (sysKey) return truncateSys(sysKey, 28);
    if (sourceName) return truncateSys(sourceName, 22);
    return null;
  })();
  const railHuman = (() => {
    if (railBridge && sourceName && targetName) {
      const h = `${sourceName} → ${targetName}`;
      if (railTitle && h !== railTitle) return truncateSys(h, 32);
      return null;
    }
    if (sourceName && railTitle && sourceName !== railTitle) {
      return truncateSys(sourceName, 22);
    }
    return null;
  })();
  const railVerb = (() => {
    if (railBridge) return 'rail↔rail';
    if (op) return truncateSys(op, 24);
    return transferWord;
  })();
  const stripLabel = (() => {
    if (opts?.hideLabels) return undefined;
    if (!opts?.stripTransferLabels) return undefined;
    if (railTitle) return railTitle;
    if ((cross || railBridge) && edge.label?.trim()) return edge.label.trim();
    if (roleTag) return `${roleTag} · ${transferWord}`;
    return transferWord;
  })();
  const label = opts?.hideLabels
    ? undefined
    : opts?.stripTransferLabels
      ? stripLabel
      : edge.label != null
        ? `${edge.label} · ${activation}/${status}`
        : `${edgeType} · ${activation}`;

  const pulsed = opts?.pulsed === true;
  const edgeActivation = pulsed ? 'pulsing' : activation;
  const edgeAnimated =
    edgeActivation === 'active' || edgeActivation === 'pulsing' || animated;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    data: {
      ...edge.data,
      activation: edgeActivation,
      stripMode: strip,
      ...(opts?.laneOffset != null ? { laneOffset: opts.laneOffset } : {}),
      ...(railTitle ? { railTitle } : {}),
      ...(railHuman ? { railHuman } : {}),
      ...(railBridge ? { railBridge: true } : {}),
      ...(opts?.stripTransferLabels
        ? {
            railVerb,
            ...(roleTag && !railBridge ? { railRole: roleTag } : {}),
            ...(railBridge ? { railRole: 'NET' } : {}),
          }
        : {}),
    },
    // Bespoke Model orthogonal rails (strip + default).
    type: 'postureOrtho',
    animated: edgeAnimated || cross,
    zIndex: railBridge ? 9 : cross ? 8 : edgeType === 'emit' ? 2 : 5,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: strip ? 12 : 10,
      height: strip ? 12 : 10,
      color: stroke,
    },
    style: {
      stroke,
      strokeWidth: width,
      opacity,
      strokeDasharray: edgeTypeDash(edgeType),
    },
    labelStyle: {
      fill: 'var(--color-ink)',
      fontSize: opts?.stripTransferLabels ? 8 : 8,
      fontFamily: 'ui-monospace, monospace',
      fontWeight: 700,
    },
    labelBgStyle: {
      fill: 'var(--color-surface-0)',
      fillOpacity: opts?.stripTransferLabels ? 0.96 : 0.85,
    },
    ...(opts?.stripTransferLabels
      ? { labelBgPadding: [3, 5] as [number, number] }
      : {}),
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
  const chrome =
    data.nodeRole === 'process' || data.nodeRole === 'analysis'
      ? processFunctionChrome(data.processFunction)
      : data.nodeRole === 'query_source'
        ? roleChrome(data.nodeRole)
        : data.nodeRole === 'live_source'
          ? sourceDomainChrome(data.sourceDomain)
          : roleChrome(data.nodeRole);

  // Dense strip cells — packing grid assumes ~40×118 chrome (D-214).
  if (data.stripCompact) {
    const badge =
      data.nodeRole === 'process' || data.nodeRole === 'analysis'
        ? processFunctionLabel(data.processFunction)
        : roleLabel(data.nodeRole);
    const isSource =
      data.nodeRole === 'live_source' ||
      data.nodeRole === 'query_source' ||
      data.nodeRole === 'library_source' ||
      data.nodeRole === 'capital_source';
    const sysKey = data.systemKey ?? null;
    return (
      <div
        className={`w-[112px] rounded-[1px] border border-t-2 px-1 py-0.5 ${kindBorder(data.kind)} ${chrome} ${ring}`}
        style={{
          borderTopColor: trackStroke(data.track),
          boxShadow:
            'inset 0 0 0 1px color-mix(in srgb, var(--color-line) 40%, transparent)',
        }}
        data-testid={`market-posture-model-node-${data.nodeRole}`}
        data-activation={data.activation}
        data-track={data.track}
        data-strip-compact="true"
        data-system-key={sysKey ?? undefined}
        data-transfer-hop={
          data.transferHop != null ? String(data.transferHop) : undefined
        }
        title={`${sysKey ? `${sysKey} · ` : ''}${data.label} · ${data.operation} · ${data.amount}`}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!h-1.5 !w-1.5 !border-[var(--color-surface-0)] !bg-[var(--color-accent)]"
        />
        <div className="flex items-center justify-between gap-0.5">
          <span className="flex min-w-0 items-center gap-0.5 font-mono text-[7px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {data.transferHop != null ? (
              <span
                className="inline-flex h-3 min-w-[0.75rem] shrink-0 items-center justify-center rounded-sm bg-[var(--color-accent)]/20 px-0.5 text-[7px] font-semibold tabular-nums text-[var(--color-accent)]"
                aria-label={`Transfer hop ${data.transferHop}`}
              >
                {data.transferHop}
              </span>
            ) : null}
            <span
              className={`truncate ${isSource ? 'font-bold text-[var(--color-accent)]' : ''}`}
            >
              {badge}
            </span>
          </span>
          <span
            className="max-w-[3.5rem] truncate font-mono text-[7px] tabular-nums text-[var(--color-ink-dim)]"
            title={data.amount}
          >
            {data.amount}
          </span>
        </div>
        {sysKey ? (
          <p
            className="truncate font-mono text-[8px] font-bold leading-tight tracking-tight text-[var(--color-accent)]"
            title={sysKey}
          >
            {sysKey}
          </p>
        ) : null}
        <p
          className={`truncate leading-tight text-[var(--color-ink)] ${
            sysKey
              ? 'text-[9px] font-medium text-[var(--color-ink-dim)]'
              : isSource
                ? 'text-[11px] font-semibold'
                : 'text-[10px] font-medium'
          }`}
          title={data.label}
        >
          {data.label}
        </p>
        <p
          className="truncate font-mono text-[8px] uppercase tracking-wide text-[var(--color-accent)]"
          title={data.operation}
        >
          {data.operation}
        </p>
        <Handle
          type="source"
          position={Position.Right}
          className="!h-1.5 !w-1.5 !border-[var(--color-surface-0)] !bg-[var(--color-accent)]"
        />
      </div>
    );
  }

  return (
    <div
      className={`min-w-[140px] max-w-[240px] rounded border border-t-[3px] px-1.5 py-1 shadow-sm ${kindBorder(data.kind)} ${chrome} ${ring}`}
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
          {data.nodeRole === 'process' || data.nodeRole === 'analysis'
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
      {((data.nodeRole === 'process' || data.nodeRole === 'analysis') &&
        data.processRoute) ? (
        <p
          className="mt-0.5 truncate font-mono text-[8px] text-[var(--color-ink-dim)]"
          title={`${data.processFunction ?? ''} · ${data.processRoute}`}
        >
          {(data.processFunction ? `${data.processFunction} · ` : '') +
            data.processRoute.replace(/_/g, ' ')}
        </p>
      ) : null}
      {(data.nodeRole === 'live_source' ||
        data.nodeRole === 'query_source' ||
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
  const compact = Boolean(data.stripCompact);
  return (
    <div
      className={`h-full w-full rounded-[1px] border ${
        isCluster
          ? 'border-[color-mix(in_srgb,#c48a3a_45%,var(--color-line))] border-l-[3px] border-l-[#c48a3a] bg-[color-mix(in_srgb,#0d1f17_55%,var(--color-surface-0))]'
          : 'border-[color-mix(in_srgb,#2a4a38_50%,var(--color-line))] bg-[color-mix(in_srgb,#0a1812_45%,var(--color-surface-0))]'
      } ${data.selected ? 'ring-1 ring-[var(--color-accent)]' : ''}`}
      data-testid={
        isCluster
          ? 'market-posture-model-node-process_cluster'
          : 'market-posture-model-node-screen_group'
      }
      data-stage-screen={data.stageScreenId}
      data-process-route={data.processRoute}
      data-strip-compact={compact ? 'true' : undefined}
    >
      <div
        className={`flex items-center justify-between gap-1 border-b border-[var(--color-line)] ${
          compact ? 'px-1 py-px' : 'px-1.5 py-0.5'
        }`}
      >
        <div className="min-w-0">
          {isCluster && (data.systemKey || data.processRoute) ? (
            <p
              className={`truncate font-mono font-bold tracking-tight text-[var(--color-accent)] ${
                compact ? 'text-[7px]' : 'text-[8px]'
              }`}
              title={data.systemKey ?? data.processRoute}
            >
              {data.systemKey ?? data.processRoute}
            </p>
          ) : null}
          <p
            className={`truncate font-mono uppercase tracking-[0.12em] text-[var(--color-ink)] ${
              isCluster
                ? compact
                  ? 'text-[7px] font-medium text-[var(--color-ink-dim)]'
                  : 'text-[8px] font-medium text-[var(--color-ink-dim)]'
                : compact
                  ? 'text-[8px] font-semibold'
                  : 'text-[9px] font-semibold'
            }`}
            title={data.label}
          >
            {data.label}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[7px] tabular-nums text-[var(--color-ink-faint)]">
          {data.amount}
        </span>
      </div>
      {isCluster && data.detail ? (
        <p
          className={`truncate font-mono text-[var(--color-ink-faint)] ${
            compact ? 'px-1 text-[6px] leading-tight' : 'px-1.5 pt-0.5 text-[7px]'
          }`}
          title={data.detail}
        >
          {data.detail}
        </p>
      ) : null}
      {isCluster ? (
        <>
          <Handle
            id="rail-in"
            type="target"
            position={Position.Top}
            className="!h-2 !w-2 !border-[var(--color-surface-0)] !bg-[var(--color-accent)]"
          />
          <Handle
            id="rail-out"
            type="source"
            position={Position.Bottom}
            className="!h-2 !w-2 !border-[var(--color-surface-0)] !bg-[var(--color-accent)]"
          />
        </>
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
  const hydrationKey = useMemo(
    () => hydrationStamp(props.hydration),
    [props.hydration],
  );
  const runKey = useMemo(() => stageSignature(props.run), [props.run]);

  // Layout graph is stable across pulse ticks — pulse is applied at style time only.
  const graph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration: props.hydration,
        stages: props.run?.stages ?? null,
        layoutMode: props.layoutMode,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by stamps, not object identity
    [hydrationKey, runKey, props.layoutMode],
  );
  const byStage = useMemo(() => {
    const m = new Map<string, MarketHubSynthesisStage>();
    for (const s of props.run?.stages ?? []) m.set(s.stageId, s);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runKey stamps stage content
  }, [runKey]);

  const liveNodes = useMemo(
    () =>
      graph.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          stageStatus: n.data.stageId ? byStage.get(n.data.stageId)?.status : undefined,
          selected: props.selectedNodeId === n.id,
          systemKey: systemKeyForNode(n),
          activation: props.pulsedEdgeIds.has(n.id)
            ? ('pulsing' as const)
            : n.data.activation,
        },
        selectable: n.data.nodeRole !== 'lane_label',
      })),
    [graph.nodes, byStage, props.selectedNodeId, props.pulsedEdgeIds],
  );

  const layoutKey = useMemo(
    () =>
      graph.nodes
        .map((n) => `${n.id}@${Math.round(n.position.x)},${Math.round(n.position.y)}`)
        .join('|'),
    [graph.nodes],
  );

  const styledEdges = useMemo(() => {
    const metaById = new Map<
      string,
      {
        label: string;
        role: PostureAlgoNodeData['nodeRole'];
        systemKey: string;
        operation: string;
      }
    >();
    const screenById = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.data.stageScreenId) screenById.set(n.id, n.data.stageScreenId);
      if (n.data.nodeRole === 'lane_label') continue;
      metaById.set(n.id, {
        label: n.data.label,
        role: n.data.nodeRole,
        systemKey: systemKeyForNode(n),
        operation: n.data.operation,
      });
    }
    const stripTransferLabels = props.layoutMode === 'stripExpanded';
    return graph.edges.map((e, i) => {
      const a = screenById.get(e.source);
      const b = screenById.get(e.target);
      const crossScreen =
        e.id.startsWith('e-group:') ||
        e.id.startsWith('e-rail:') ||
        (a != null && b != null && a !== b);
      const srcMeta = metaById.get(e.source);
      const opts: {
        crossScreen: boolean;
        stripTransferLabels: boolean;
        orthoStrip: true;
        hideLabels: boolean;
        laneOffset?: number;
        sourceLabel?: string;
        sourceRole?: PostureAlgoNodeData['nodeRole'];
        targetLabel?: string;
        systemKey?: string;
        operation?: string;
        targetSystemKey?: string;
        pulsed?: boolean;
      } = {
        crossScreen,
        stripTransferLabels,
        orthoStrip: true,
        hideLabels: false,
        pulsed:
          props.pulsedEdgeIds.has(e.id) ||
          props.pulsedEdgeIds.has(e.source) ||
          props.pulsedEdgeIds.has(e.target),
      };
      if (stripTransferLabels) {
        opts.laneOffset = ((i % 5) - 2) * 3;
      }
      if (srcMeta) {
        opts.sourceLabel = srcMeta.label;
        opts.sourceRole = srcMeta.role;
        opts.systemKey = srcMeta.systemKey;
        opts.operation = srcMeta.operation;
      }
      const tgt = metaById.get(e.target);
      if (tgt) {
        opts.targetLabel = tgt.label;
        opts.targetSystemKey = tgt.systemKey;
      }
      return styleModelEdge(e, opts);
    });
  }, [graph.edges, graph.nodes, props.layoutMode, props.pulsedEdgeIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(liveNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(styledEdges);
  const { fitView } = useReactFlow();
  const didFit = useRef(false);

  useEffect(() => {
    setNodes(liveNodes);
  }, [liveNodes, setNodes]);

  useEffect(() => {
    setEdges(styledEdges);
  }, [styledEdges, setEdges]);

  // Fit once per layout structure — never on pulse / selection / style ticks.
  useEffect(() => {
    const strip = props.layoutMode === 'stripExpanded';
    const frame = requestAnimationFrame(() => {
      void fitView({
        padding: strip ? 0.05 : 0.18,
        maxZoom: strip ? 1.05 : 0.75,
        minZoom: strip ? 0.28 : 0.12,
        duration: didFit.current ? 180 : 0,
      });
      didFit.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [layoutKey, props.layoutMode, fitView]);

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
          const clusterScreen =
            (data.stageScreenId as MarketPostureStageScreenId | undefined) ??
            'process';
          props.onNavigate?.(node.id, clusterScreen);
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
      edgeTypes={edgeTypes}
      defaultEdgeOptions={{ type: 'postureOrtho' }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnScroll={false}
      minZoom={props.layoutMode === 'stripExpanded' ? 0.28 : 0.12}
      maxZoom={props.layoutMode === 'stripExpanded' ? 1.25 : 1.2}
      proOptions={{ hideAttribution: true }}
      className={
        props.layoutMode === 'stripExpanded'
          ? 'market-posture-pcb bg-[color-mix(in_srgb,#0a1610_70%,var(--color-surface-0))]'
          : 'bg-[var(--color-surface-0)]'
      }
      data-pcb={props.layoutMode === 'stripExpanded' ? 'true' : undefined}
    >
      <Background
        id="pcb-grid"
        variant={
          props.layoutMode === 'stripExpanded'
            ? BackgroundVariant.Lines
            : BackgroundVariant.Dots
        }
        gap={props.layoutMode === 'stripExpanded' ? 8 : 14}
        size={props.layoutMode === 'stripExpanded' ? 0.6 : 1}
        {...(props.layoutMode === 'stripExpanded' ? { lineWidth: 0.4 } : {})}
        color={
          props.layoutMode === 'stripExpanded'
            ? 'color-mix(in srgb, #2f5a44 55%, transparent)'
            : 'var(--color-line)'
        }
      />
      {props.layoutMode === 'stripExpanded' ? (
        <Background
          id="pcb-fine"
          variant={BackgroundVariant.Lines}
          gap={24}
          size={0.5}
          lineWidth={0.55}
          color="color-mix(in srgb, #3d7a58 35%, transparent)"
        />
      ) : null}
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

function NodeInspector(props: {
  nodeId?: string | null;
  node: (PostureAlgoNodeData & { systemKey?: string }) | null;
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
  const sysKey =
    n.systemKey?.trim() ||
    systemKeyForNode({ id: props.nodeId ?? n.stageId ?? n.label, data: n });
  return (
    <div className="space-y-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5">
      <p className="font-mono text-[9px] font-bold tracking-tight text-[var(--color-accent)]">
        {sysKey}
      </p>
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
      {(n.nodeRole === 'process' || n.nodeRole === 'analysis') ? (
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

/** Stable stamp so new object identity from polling does not rebuild the Model. */
function hydrationStamp(h: MarketHubModelHydration | null): string {
  if (!h) return '';
  return [
    h.asOfIso ?? '',
    h.livePatchedAt ?? '',
    h.totals.liveReady,
    h.totals.admittedConcepts,
    h.liveSources.map((s) => `${s.kind}:${s.status}:${s.contributed ? 1 : 0}`).join(','),
    h.librarySources.map((l) => `${l.id}:${l.admittedCount}`).join(','),
    String(h.processingFlows.length),
    String(h.processSteps?.length ?? 0),
    String(h.panelSurfaces?.length ?? 0),
  ].join('|');
}

/** System-facing id for silkscreen / node chrome (kind, step, route). */
function systemKeyForNode(n: { id: string; data: PostureAlgoNodeData }): string {
  const d = n.data;
  if (d.processStepId) return d.processStepId;
  if (d.panelSurfaceId) return d.panelSurfaceId;
  if (d.stageId) return d.stageId;
  if (d.processRoute && d.processFunction) {
    return `${d.processRoute}/${d.processFunction}`;
  }
  if (d.processRoute) return d.processRoute;
  if (n.id.startsWith('live:')) return n.id.slice('live:'.length);
  if (n.id.startsWith('lib:')) return n.id.slice('lib:'.length);
  if (n.id.startsWith('adapter:')) return n.id.slice('adapter:'.length);
  if (n.id.startsWith('analyze:')) return n.id.slice('analyze:'.length);
  if (n.id.startsWith('process:')) return n.id.slice('process:'.length);
  if (n.id.startsWith('cluster:process:')) {
    return d.processRoute ?? n.id.slice('cluster:process:'.length);
  }
  if (n.id.startsWith('group:')) return n.id.slice('group:'.length);
  if (d.sourceDomain) return d.sourceDomain;
  return n.id;
}

function truncateSys(s: string, max = 28): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
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
  const hydrationKey = useMemo(() => hydrationStamp(hydration), [hydration]);
  const runKey = useMemo(() => stageSignature(run), [run]);

  const baselineGraph = useMemo(
    () =>
      buildMarketPostureAlgorithmGraph({
        hydration,
        stages: run?.stages ?? null,
        layoutMode,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrationKey/runKey stabilize polls
    [hydrationKey, runKey, layoutMode],
  );

  const pulseEdgeIds = useMemo(
    () => baselineGraph.edges.map((e) => e.id),
    [baselineGraph.edges],
  );
  const pulseStageIds = useMemo(
    () =>
      baselineGraph.nodes.filter((n) => n.data.nodeRole === 'stage').map((n) => n.id),
    [baselineGraph.nodes],
  );
  const pulsePanelIds = useMemo(
    () =>
      baselineGraph.nodes
        .filter((n) => n.data.nodeRole === 'panel_surface')
        .map((n) => n.id),
    [baselineGraph.nodes],
  );

  useEffect(() => {
    const nextAsOf = hydration?.asOfIso ?? null;
    const nextSig = runKey;
    const nextLive = hydration?.livePatchedAt ?? null;
    const pulse = collectModelPulseIds({
      prevAsOf: prevAsOf.current,
      nextAsOf,
      prevStageSig: prevStageSig.current,
      nextStageSig: nextSig,
      prevLivePatchedAt: prevLivePatched.current,
      nextLivePatchedAt: nextLive,
      edgeIds: pulseEdgeIds,
      stageIds: pulseStageIds,
      panelNodeIds: pulsePanelIds,
    });
    prevAsOf.current = nextAsOf;
    prevStageSig.current = nextSig;
    prevLivePatched.current = nextLive;
    if (pulse.size === 0) return;
    setPulsedEdgeIds(pulse);
    const t = window.setTimeout(() => setPulsedEdgeIds(new Set()), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [
    hydration?.asOfIso,
    hydration?.livePatchedAt,
    runKey,
    pulseEdgeIds,
    pulseStageIds,
    pulsePanelIds,
  ]);

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
          {hydration && (hydration.researchEngines?.length ?? 0) > 0
            ? ` · ${hydration.researchEngines.length} research ENG`
            : ''}
          {hydration?.asOfIso
            ? ` · asOf ${new Date(hydration.asOfIso).toLocaleTimeString()}`
            : ''}
          {hydration?.livePatchedAt
            ? ` · live ${new Date(hydration.livePatchedAt).toLocaleTimeString()}`
            : ''}
        </p>
      </div>
      {!isStrip ? <TrackLegend tracks={baselineGraph.tracks} compact={false} /> : null}
      <div
        data-testid="market-posture-model-canvas"
        className={
          isStrip
            ? 'min-h-0 flex-1 overflow-hidden border border-[color-mix(in_srgb,#2f5a44_50%,var(--color-line))] bg-[color-mix(in_srgb,#0a1610_65%,var(--color-surface-0))]'
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
          <NodeInspector
            nodeId={selectedNodeId}
            node={
              selectedNodeId
                ? {
                    ...selectedNode,
                    systemKey: systemKeyForNode({
                      id: selectedNodeId,
                      data: selectedNode,
                    }),
                  }
                : selectedNode
            }
            stage={selectedStage}
          />
        </div>
      ) : null}
    </div>
  );
});
