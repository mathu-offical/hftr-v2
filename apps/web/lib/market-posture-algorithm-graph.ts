/**
 * Market posture synthesis Model graph (D-120 / D-147 / D-156 / D-160).
 * Per-service adapters feed specific analysis stages; edges carry type,
 * activation, status, and track for live refresh/update styling.
 */

import type {
  MarketHubModelEdgeActivation,
  MarketHubModelEdgeStatus,
  MarketHubModelEdgeType,
  MarketHubModelHydration,
  MarketHubModelLayer,
  MarketHubModelProcessingFlow,
  MarketHubModelTrack,
  MarketHubSynthesisStage,
  MarketHubSynthesisStageId,
  MarketHubSynthesisStageKind,
  MarketHubSynthesisStageStatus,
} from '@hftr/contracts';
import {
  MARKET_HUB_MODEL_TRACK_META,
  MARKET_HUB_SYNTHESIS_STAGE_META,
} from '@hftr/contracts';

export type PostureAlgoNodeRole =
  | 'live_source'
  | 'adapter'
  | 'library_source'
  | 'stage';

export type PostureAlgoNodeData = {
  label: string;
  detail: string;
  kind: MarketHubSynthesisStageKind;
  nodeRole: PostureAlgoNodeRole;
  stageId?: MarketHubSynthesisStageId;
  operation: string;
  amount: string;
  analysisRoles?: string[];
  pipelines?: Array<'movers' | 'sector'>;
  layer: MarketHubModelLayer;
  track: MarketHubModelTrack;
  activation: MarketHubModelEdgeActivation;
  status: MarketHubModelEdgeStatus;
  /** ISO when this node last changed (stage finished / hydration asOf). */
  updatedAt: string | null;
};

export type PostureAlgoEdgeData = {
  edgeType: MarketHubModelEdgeType;
  activation: MarketHubModelEdgeActivation;
  status: MarketHubModelEdgeStatus;
  track: MarketHubModelTrack;
  label?: string;
};

export type PostureAlgoGraph = {
  nodes: Array<{
    id: string;
    type: 'postureAlgo';
    position: { x: number; y: number };
    data: PostureAlgoNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    data: PostureAlgoEdgeData;
  }>;
  tracks: Array<{ id: MarketHubModelTrack; label: string; summary: string }>;
  asOfIso: string | null;
};

const STAGE_LAYOUT: Array<{
  id: MarketHubSynthesisStageId;
  x: number;
  y: number;
}> = [
  { id: 'providers', x: 520, y: 40 },
  { id: 'gather', x: 700, y: 200 },
  { id: 'thresholds', x: 880, y: 80 },
  { id: 'defaults', x: 880, y: 320 },
  { id: 'universe', x: 1060, y: 200 },
  { id: 'rs', x: 1240, y: 200 },
  { id: 'rank', x: 1420, y: 200 },
  { id: 'verify', x: 1600, y: 200 },
  { id: 'seal_movers', x: 1780, y: 120 },
  { id: 'sector', x: 1780, y: 280 },
  { id: 'daily', x: 1960, y: 200 },
  { id: 'narrative', x: 2140, y: 200 },
  { id: 'hub_ready', x: 2320, y: 200 },
];

type StageEdgeSpec = {
  id: string;
  source: MarketHubSynthesisStageId;
  target: MarketHubSynthesisStageId;
  label?: string;
  edgeType: MarketHubModelEdgeType;
  track: MarketHubModelTrack;
};

const STAGE_EDGE_SPECS: StageEdgeSpec[] = [
  {
    id: 'e-gather-llm',
    source: 'gather',
    target: 'thresholds',
    label: 'lane presence',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-gather-def',
    source: 'gather',
    target: 'defaults',
    label: 'fail-closed',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-llm-uni',
    source: 'thresholds',
    target: 'universe',
    label: 'presets',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-def-uni',
    source: 'defaults',
    target: 'universe',
    label: 'bands',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-uni-rs',
    source: 'universe',
    target: 'rs',
    label: 'tickers',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-rs-rank',
    source: 'rs',
    target: 'rank',
    label: 'scores',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-rank-ver',
    source: 'rank',
    target: 'verify',
    label: 'board',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-ver-seal',
    source: 'verify',
    target: 'seal_movers',
    label: 'gates',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-seal-sector',
    source: 'seal_movers',
    target: 'sector',
    label: '∥',
    edgeType: 'parallel',
    track: 'sector',
  },
  {
    id: 'e-seal-daily',
    source: 'seal_movers',
    target: 'daily',
    label: '∥',
    edgeType: 'parallel',
    track: 'daily',
  },
  {
    id: 'e-sector-narr',
    source: 'sector',
    target: 'narrative',
    label: 'news seal',
    edgeType: 'pipeline',
    track: 'compose',
  },
  {
    id: 'e-daily-narr',
    source: 'daily',
    target: 'narrative',
    label: 'daily seal',
    edgeType: 'pipeline',
    track: 'compose',
  },
  {
    id: 'e-narr-hub',
    source: 'narrative',
    target: 'hub_ready',
    label: 'project',
    edgeType: 'pipeline',
    track: 'compose',
  },
  {
    id: 'e-prov-gather',
    source: 'providers',
    target: 'gather',
    label: 'ready lanes',
    edgeType: 'entitle',
    track: 'entitle',
  },
];

function parseStageAmountFromSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const m = summary.match(/(\d+)\s+([a-zA-Z][\w-]*)/);
  if (!m) return null;
  return `${m[1]} ${m[2]}`.slice(0, 40);
}

function stageOpFromHydration(
  hydration: MarketHubModelHydration | null | undefined,
  stageId: MarketHubSynthesisStageId,
): { operation: string; amount: string } | null {
  const row = hydration?.stageOps.find((s) => s.stageId === stageId);
  if (!row) return null;
  return { operation: row.operation, amount: row.amount };
}

function stageStatusToEdgeStatus(
  status: MarketHubSynthesisStageStatus | undefined,
): MarketHubModelEdgeStatus {
  switch (status) {
    case 'queued':
      return 'ready';
    case 'running':
      return 'running';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case undefined:
      return 'idle';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function isExpired(expiresAt: string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t < nowMs;
}

function isFresh(verifiedAt: string | null | undefined, nowMs: number, windowMs: number): boolean {
  if (!verifiedAt) return false;
  const t = Date.parse(verifiedAt);
  return Number.isFinite(t) && nowMs - t < windowMs;
}

/**
 * Derive edge activation/status from endpoint stage run state + readiness.
 */
export function resolveModelEdgeState(opts: {
  edgeType: MarketHubModelEdgeType;
  sourceStageStatus?: MarketHubSynthesisStageStatus;
  targetStageStatus?: MarketHubSynthesisStageStatus;
  sourceReady?: boolean;
  sourceBlocked?: boolean;
  targetStale?: boolean;
  pulsed?: boolean;
}): Pick<PostureAlgoEdgeData, 'activation' | 'status'> {
  if (opts.sourceBlocked) {
    return { activation: 'blocked', status: 'blocked' };
  }
  if (opts.pulsed) {
    return { activation: 'pulsing', status: stageStatusToEdgeStatus(opts.targetStageStatus) };
  }
  if (opts.targetStale) {
    return { activation: 'stale', status: stageStatusToEdgeStatus(opts.targetStageStatus) };
  }

  const src = opts.sourceStageStatus;
  const tgt = opts.targetStageStatus;

  if (tgt === 'running' || src === 'running') {
    return { activation: 'active', status: 'running' };
  }
  if (tgt === 'failed' || src === 'failed') {
    return { activation: 'idle', status: 'failed' };
  }
  if (tgt === 'succeeded' && (src === 'succeeded' || src === 'skipped' || !src)) {
    return { activation: 'armed', status: 'succeeded' };
  }
  if (tgt === 'queued' || src === 'queued') {
    return { activation: 'armed', status: 'ready' };
  }
  if (opts.sourceReady) {
    return { activation: 'armed', status: 'ready' };
  }
  void opts.edgeType;
  return { activation: 'idle', status: 'idle' };
}

function diagramTargetStages(flow: MarketHubModelProcessingFlow): MarketHubSynthesisStageId[] {
  const roles = new Set(flow.analysisRoles);
  const out = new Set<MarketHubSynthesisStageId>();
  const first = flow.targetStages[0];
  if (first) out.add(first);

  if (roles.has('relative_strength') || roles.has('volume_expansion')) {
    for (const s of ['rs', 'rank'] as const) {
      if (flow.targetStages.includes(s)) out.add(s);
    }
  }
  if (roles.has('news_corpus') || roles.has('web_corpus') || roles.has('filings_corpus')) {
    if (flow.targetStages.includes('gather')) out.add('gather');
    if (flow.targetStages.includes('universe')) out.add('universe');
    if (flow.targetStages.includes('sector') && flow.pipelines.includes('sector')) {
      out.add('sector');
    }
    if (flow.targetStages.includes('seal_movers') && flow.pipelines.includes('movers')) {
      out.add('seal_movers');
    }
  }
  if (roles.has('macro_context') || roles.has('bars_entitlement')) {
    if (flow.targetStages.includes('gather')) out.add('gather');
    if (flow.targetStages.includes('providers')) out.add('providers');
    if (flow.targetStages.includes('verify')) out.add('verify');
  }
  if (roles.has('library_jaccard')) {
    for (const s of flow.targetStages) out.add(s);
  }
  if (roles.has('bars_entitlement') && !roles.has('relative_strength')) {
    out.add('providers');
  }
  if (out.size === 0) {
    for (const s of flow.targetStages.slice(0, 3)) out.add(s);
  }
  return [...out];
}

function trackForFlow(flow: MarketHubModelProcessingFlow): MarketHubModelTrack {
  if (flow.analysisRoles.includes('relative_strength')) return 'compound';
  if (flow.pipelines.includes('sector') && !flow.pipelines.includes('movers')) return 'sector';
  if (flow.pipelines.includes('sector') && flow.analysisRoles.includes('news_corpus')) {
    return 'sector';
  }
  if (flow.kind.startsWith('library:')) return 'compound';
  if (flow.analysisRoles.includes('bars_entitlement')) return 'entitle';
  return 'compound';
}

function flowBlocked(flow: MarketHubModelProcessingFlow): boolean {
  return flow.status === 'missing_key' || flow.status === 'stub';
}

function flowReady(flow: MarketHubModelProcessingFlow): boolean {
  return (
    flow.status === 'ready' ||
    flow.status === 'public' ||
    flow.contributed ||
    (flow.status !== 'missing_key' && flow.status !== 'stub' && flow.status !== 'idle')
  );
}

/**
 * Build Model graph with typed, activation-aware edges (D-160).
 */
export function buildMarketPostureAlgorithmGraph(opts?: {
  hydration?: MarketHubModelHydration | null;
  stages?: MarketHubSynthesisStage[] | null;
  /** Edge ids that should pulse (client refresh/update signal). */
  pulsedEdgeIds?: ReadonlySet<string> | null;
  nowMs?: number;
}): PostureAlgoGraph {
  const hydration = opts?.hydration ?? null;
  const pulsed = opts?.pulsedEdgeIds ?? null;
  const nowMs = opts?.nowMs ?? Date.now();
  const byStage = new Map<string, MarketHubSynthesisStage>();
  for (const s of opts?.stages ?? []) byStage.set(s.stageId, s);

  const stamps = hydration?.sealStamps;
  const moversStale = isExpired(stamps?.moversExpiresAt, nowMs);
  const newsStale = isExpired(stamps?.newsExpiresAt, nowMs);
  const dailyStale = isExpired(stamps?.dailyExpiresAt, nowMs);
  const moversFresh = isFresh(stamps?.moversVerifiedAt, nowMs, 120_000);
  const newsFresh = isFresh(stamps?.newsVerifiedAt, nowMs, 120_000);

  const nodes: PostureAlgoGraph['nodes'] = [];
  const edges: PostureAlgoGraph['edges'] = [];

  const liveSources = hydration?.liveSources ?? [];
  const librarySources = hydration?.librarySources ?? [];
  const flows = hydration?.processingFlows ?? [];
  const asOfIso = hydration?.asOfIso ?? null;

  const gap = 72;
  const liveX = 0;
  const adapterX = 240;

  const flowsByKind = new Map<string, MarketHubModelProcessingFlow[]>();
  for (const f of flows) {
    if (f.kind.startsWith('library:')) continue;
    const list = flowsByKind.get(f.kind) ?? [];
    list.push(f);
    flowsByKind.set(f.kind, list);
  }

  let row = 0;
  for (const src of liveSources) {
    const liveId = `live:${src.kind}`;
    const y = row * gap;
    const blocked = src.status === 'missing_key' || src.status === 'stub';
    const ready = src.status === 'ready' || src.status === 'public' || src.contributed;
    const liveActivation: MarketHubModelEdgeActivation = blocked
      ? 'blocked'
      : src.contributed || moversFresh
        ? 'armed'
        : ready
          ? 'armed'
          : 'idle';
    const liveStatus: MarketHubModelEdgeStatus = blocked
      ? 'blocked'
      : ready
        ? 'ready'
        : 'idle';

    nodes.push({
      id: liveId,
      type: 'postureAlgo',
      position: { x: liveX, y },
      data: {
        label: src.label,
        detail: `${src.domain} · ${src.status}`,
        kind: 'data',
        nodeRole: 'live_source',
        operation: src.operation,
        amount: src.amount,
        layer: 'sources',
        track: 'entitle',
        activation: liveActivation,
        status: liveStatus,
        updatedAt: asOfIso,
      },
    });

    const kindFlows = flowsByKind.get(src.kind) ?? [];
    if (kindFlows.length === 0) {
      const edgeId = `e-${liveId}-providers`;
      const state = resolveModelEdgeState({
        edgeType: 'entitle',
        sourceBlocked: blocked,
        sourceReady: ready,
        targetStageStatus: byStage.get('providers')?.status,
        pulsed: pulsed?.has(edgeId) ?? false,
      });
      edges.push({
        id: edgeId,
        source: liveId,
        target: 'providers',
        label: src.contributed ? 'sealed' : 'entitle',
        data: {
          edgeType: 'entitle',
          track: 'entitle',
          ...state,
        },
      });
      row += 1;
      continue;
    }

    kindFlows.forEach((flow, fi) => {
      const adapterId = `adapter:${flow.id}`;
      const ay = y + fi * Math.min(40, gap / Math.max(kindFlows.length, 1));
      const track = trackForFlow(flow);
      const aBlocked = flowBlocked(flow);
      const aReady = flowReady(flow);
      nodes.push({
        id: adapterId,
        type: 'postureAlgo',
        position: { x: adapterX, y: ay },
        data: {
          label: flow.adapterLabel,
          detail: flow.analysisRoles.join(' · ') || flow.pipelines.join('+'),
          kind: 'deterministic',
          nodeRole: 'adapter',
          operation: flow.operation,
          amount: flow.amount,
          analysisRoles: [...flow.analysisRoles],
          pipelines: [...flow.pipelines],
          layer: 'adapters',
          track,
          activation: aBlocked ? 'blocked' : aReady ? 'armed' : 'idle',
          status: aBlocked ? 'blocked' : aReady ? 'ready' : 'idle',
          updatedAt: asOfIso,
        },
      });

      const hydrateId = `e-${liveId}-${adapterId}`;
      const hydrateState = resolveModelEdgeState({
        edgeType: 'hydrate',
        sourceBlocked: blocked || aBlocked,
        sourceReady: ready && aReady,
        pulsed: pulsed?.has(hydrateId) ?? false,
      });
      edges.push({
        id: hydrateId,
        source: liveId,
        target: adapterId,
        label: 'hydrate',
        data: { edgeType: 'hydrate', track, ...hydrateState },
      });

      for (const stageId of diagramTargetStages(flow)) {
        const edgeId = `e-${adapterId}-${stageId}`;
        const tgt = byStage.get(stageId);
        const targetStale =
          (stageId === 'seal_movers' && moversStale) ||
          (stageId === 'sector' && newsStale) ||
          (stageId === 'daily' && dailyStale);
        const state = resolveModelEdgeState({
          edgeType: 'adapt',
          sourceBlocked: aBlocked,
          sourceReady: aReady,
          targetStageStatus: tgt?.status,
          targetStale,
          pulsed: pulsed?.has(edgeId) ?? false,
        });
        const activation =
          pulsed?.has(edgeId)
            ? 'pulsing'
            : state.activation === 'idle' && aReady && (moversFresh || newsFresh)
              ? 'armed'
              : state.activation;
        edges.push({
          id: edgeId,
          source: adapterId,
          target: stageId,
          label: (flow.analysisRoles[0] ?? flow.pipelines[0] ?? 'adapt').slice(0, 24),
          data: {
            edgeType: 'adapt',
            track,
            activation,
            status: state.status,
          },
        });
      }
    });
    row += Math.max(1, kindFlows.length);
  }

  const libFlows = flows.filter((f) => f.kind.startsWith('library:'));
  const libStartY = row * gap + 48;
  librarySources.forEach((lib, i) => {
    const liveId = `lib:${lib.id}`;
    const y = libStartY + i * gap;
    const ready = lib.admittedCount > 0;
    nodes.push({
      id: liveId,
      type: 'postureAlgo',
      position: { x: liveX, y },
      data: {
        label: lib.name,
        detail: `${lib.shelf} · ${lib.topicScope || 'untagged'}`,
        kind: 'data',
        nodeRole: 'library_source',
        operation: lib.operation,
        amount: lib.amount,
        layer: 'sources',
        track: 'compound',
        activation: ready ? 'armed' : 'idle',
        status: ready ? 'ready' : 'idle',
        updatedAt: asOfIso,
      },
    });
    const flow = libFlows.find((f) => f.kind === `library:${lib.id}`);
    if (flow) {
      const adapterId = `adapter:${flow.id}`;
      nodes.push({
        id: adapterId,
        type: 'postureAlgo',
        position: { x: adapterX, y },
        data: {
          label: flow.adapterLabel,
          detail: flow.analysisRoles.join(' · '),
          kind: 'deterministic',
          nodeRole: 'adapter',
          operation: flow.operation,
          amount: flow.amount,
          analysisRoles: [...flow.analysisRoles],
          pipelines: [...flow.pipelines],
          layer: 'adapters',
          track: 'compound',
          activation: ready ? 'armed' : 'idle',
          status: ready ? 'ready' : 'idle',
          updatedAt: asOfIso,
        },
      });
      const hydrateId = `e-${liveId}-${adapterId}`;
      edges.push({
        id: hydrateId,
        source: liveId,
        target: adapterId,
        label: 'corpus',
        data: {
          edgeType: 'hydrate',
          track: 'compound',
          ...resolveModelEdgeState({
            edgeType: 'hydrate',
            sourceReady: ready,
            pulsed: pulsed?.has(hydrateId) ?? false,
          }),
        },
      });
      for (const stageId of diagramTargetStages(flow)) {
        const edgeId = `e-${adapterId}-${stageId}`;
        edges.push({
          id: edgeId,
          source: adapterId,
          target: stageId,
          label: 'corpus',
          data: {
            edgeType: 'corpus',
            track: 'compound',
            ...resolveModelEdgeState({
              edgeType: 'corpus',
              sourceReady: ready,
              targetStageStatus: byStage.get(stageId)?.status,
              pulsed: pulsed?.has(edgeId) ?? false,
            }),
          },
        });
      }
    } else {
      const edgeId = `e-${liveId}-gather`;
      edges.push({
        id: edgeId,
        source: liveId,
        target: 'gather',
        label: ready ? 'corpus' : undefined,
        data: {
          edgeType: 'corpus',
          track: 'compound',
          ...resolveModelEdgeState({
            edgeType: 'corpus',
            sourceReady: ready,
            targetStageStatus: byStage.get('gather')?.status,
            pulsed: pulsed?.has(edgeId) ?? false,
          }),
        },
      });
    }
  });

  for (const s of STAGE_LAYOUT) {
    const meta = MARKET_HUB_SYNTHESIS_STAGE_META[s.id];
    const stageRow = byStage.get(s.id);
    const baseline = stageOpFromHydration(hydration, s.id);
    const fromSummary = parseStageAmountFromSummary(stageRow?.summary);
    const operation =
      stageRow?.status === 'running'
        ? 'running'
        : stageRow?.status === 'succeeded'
          ? (baseline?.operation ?? 'done')
          : (baseline?.operation ?? meta.label.toLowerCase());
    const amount = fromSummary ?? baseline?.amount ?? (hydration ? '—' : 'pending');

    let activation: MarketHubModelEdgeActivation = 'idle';
    let status: MarketHubModelEdgeStatus = 'idle';
    if (stageRow) {
      status = stageStatusToEdgeStatus(stageRow.status);
      if (stageRow.status === 'running') activation = 'active';
      else if (stageRow.status === 'queued') activation = 'armed';
      else if (stageRow.status === 'succeeded') activation = 'armed';
      else if (stageRow.status === 'failed') activation = 'blocked';
    } else if (s.id === 'seal_movers' && moversStale) {
      activation = 'stale';
    } else if (s.id === 'sector' && newsStale) {
      activation = 'stale';
    } else if (s.id === 'daily' && dailyStale) {
      activation = 'stale';
    } else if (
      (s.id === 'seal_movers' && moversFresh) ||
      (s.id === 'sector' && newsFresh)
    ) {
      activation = 'armed';
      status = 'succeeded';
    }

    if (pulsed?.has(s.id)) activation = 'pulsing';

    nodes.push({
      id: s.id,
      type: 'postureAlgo',
      position: { x: s.x, y: s.y },
      data: {
        label: meta.label,
        detail: stageRow?.summary?.slice(0, 120) ?? meta.dataRole,
        kind: meta.kind,
        nodeRole: 'stage',
        stageId: s.id,
        operation,
        amount,
        layer: meta.layer,
        track: meta.track,
        activation,
        status,
        updatedAt: stageRow?.finishedAt ?? stageRow?.startedAt ?? asOfIso,
      },
    });
  }

  for (const spec of STAGE_EDGE_SPECS) {
    const src = byStage.get(spec.source);
    const tgt = byStage.get(spec.target);
    const targetStale =
      (spec.target === 'seal_movers' && moversStale) ||
      (spec.target === 'sector' && newsStale) ||
      (spec.target === 'daily' && dailyStale) ||
      (spec.target === 'hub_ready' && (moversStale || newsStale));
    const state = resolveModelEdgeState({
      edgeType: spec.edgeType,
      sourceStageStatus: src?.status,
      targetStageStatus: tgt?.status,
      targetStale,
      pulsed: pulsed?.has(spec.id) ?? false,
    });
    edges.push({
      id: spec.id,
      source: spec.source,
      target: spec.target,
      label: spec.label,
      data: {
        edgeType: spec.edgeType,
        track: spec.track,
        ...state,
      },
    });
  }

  const tracks = (Object.keys(MARKET_HUB_MODEL_TRACK_META) as MarketHubModelTrack[]).map(
    (id) => ({
      id,
      label: MARKET_HUB_MODEL_TRACK_META[id].label,
      summary: MARKET_HUB_MODEL_TRACK_META[id].summary,
    }),
  );

  return { nodes, edges, tracks, asOfIso };
}

/**
 * Collect edge/node ids that changed since the previous snapshot (D-160 pulse).
 */
export function collectModelPulseIds(opts: {
  prevAsOf: string | null;
  nextAsOf: string | null;
  prevStageSig: string;
  nextStageSig: string;
  edgeIds: string[];
  stageIds: string[];
}): Set<string> {
  const out = new Set<string>();
  if (opts.nextAsOf && opts.nextAsOf !== opts.prevAsOf) {
    for (const id of opts.edgeIds) {
      if (id.includes('hydrate') || id.includes('adapter:') || id.startsWith('e-live:')) {
        out.add(id);
      }
    }
  }
  if (opts.nextStageSig !== opts.prevStageSig) {
    for (const id of opts.stageIds) out.add(id);
    for (const id of opts.edgeIds) {
      if (id.startsWith('e-') && !id.includes('adapter:') && !id.includes('live:')) {
        out.add(id);
      }
    }
  }
  return out;
}
