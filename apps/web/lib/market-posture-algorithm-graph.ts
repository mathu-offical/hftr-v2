/**
 * Market posture synthesis Model graph (D-120 / D-147 / D-156 / D-160 / D-162 / D-163).
 * Shows only available provider tracks; data sources (live/library/capital)
 * feed route process chains into synthesis milestones and panel surfaces.
 */

import type {
  MarketHubModelEdgeActivation,
  MarketHubModelEdgeStatus,
  MarketHubModelEdgeType,
  MarketHubModelHydration,
  MarketHubModelLayer,
  MarketHubModelProcessStep,
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
import {
  isAvailableLibrarySource,
  isAvailableLiveSource,
  resolveModelTrackCapabilities,
  tracksFromCapabilities,
} from './market-hub-model-availability';

export type PostureAlgoNodeRole =
  | 'live_source'
  | 'adapter'
  | 'process'
  | 'library_source'
  | 'capital_source'
  | 'stage'
  | 'panel_surface';

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
  /** Process route when nodeRole is process (D-162). */
  processRoute?: string;
  processStepId?: string;
  /** Panel surface id when nodeRole is panel_surface (D-161). */
  panelSurfaceId?: string;
  panelKind?: 'rail' | 'overlay' | 'both';
  /** Emphasize amount as capital readout (D-163). */
  capitalBearing?: boolean;
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
  label?: string | undefined;
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
    label?: string | undefined;
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
  { id: 'providers', x: 1000, y: 40 },
  { id: 'gather', x: 1280, y: 200 },
  { id: 'thresholds', x: 1560, y: 80 },
  { id: 'defaults', x: 1560, y: 320 },
  { id: 'universe', x: 1840, y: 200 },
  { id: 'rs', x: 2020, y: 200 },
  { id: 'rank', x: 2300, y: 200 },
  { id: 'verify', x: 2480, y: 200 },
  { id: 'seal_movers', x: 2760, y: 120 },
  { id: 'sector', x: 2760, y: 280 },
  { id: 'daily', x: 2940, y: 200 },
  { id: 'narrative', x: 3220, y: 200 },
  { id: 'hub_ready', x: 3400, y: 200 },
];

type StageEdgeSpec = {
  id: string;
  source: MarketHubSynthesisStageId;
  target: MarketHubSynthesisStageId;
  label?: string;
  edgeType: MarketHubModelEdgeType;
  track: MarketHubModelTrack;
};

/** Direct stage→stage edges that stay milestone-only (no shared process route). */
const DIRECT_STAGE_EDGE_SPECS: StageEdgeSpec[] = [
  {
    id: 'e-uni-rs',
    source: 'universe',
    target: 'rs',
    label: 'tickers',
    edgeType: 'pipeline',
    track: 'compound',
  },
  {
    id: 'e-narr-hub',
    source: 'narrative',
    target: 'hub_ready',
    label: 'project',
    edgeType: 'pipeline',
    track: 'compose',
  },
];

/**
 * Shared compound bridges — stage → route process steps → stage (D-162).
 * Multiple sources may share one route (universe_build, narrative_compose).
 */
type SharedBridgeSpec = {
  id: string;
  route: string;
  source: MarketHubSynthesisStageId;
  target: MarketHubSynthesisStageId;
  edgeType: MarketHubModelEdgeType;
  track: MarketHubModelTrack;
  baseY: number;
};

const SHARED_BRIDGE_SPECS: SharedBridgeSpec[] = [
  {
    id: 'bridge-prov-gather',
    route: 'providers_entitle',
    source: 'providers',
    target: 'gather',
    edgeType: 'entitle',
    track: 'entitle',
    baseY: 40,
  },
  {
    id: 'bridge-gather-llm',
    route: 'thresholds_llm',
    source: 'gather',
    target: 'thresholds',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: 72,
  },
  {
    id: 'bridge-gather-def',
    route: 'defaults_catalog',
    source: 'gather',
    target: 'defaults',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: 320,
  },
  {
    id: 'bridge-llm-uni',
    route: 'universe_build',
    source: 'thresholds',
    target: 'universe',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: 120,
  },
  {
    id: 'bridge-def-uni',
    route: 'universe_build',
    source: 'defaults',
    target: 'universe',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: 280,
  },
  {
    id: 'bridge-rs-rank',
    route: 'compound_rank',
    source: 'rs',
    target: 'rank',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: 200,
  },
  {
    id: 'bridge-rank-seal',
    route: 'verify_promote',
    source: 'rank',
    target: 'seal_movers',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: 160,
  },
  {
    id: 'bridge-seal-sector',
    route: 'sector_bulletin',
    source: 'seal_movers',
    target: 'sector',
    edgeType: 'parallel',
    track: 'sector',
    baseY: 280,
  },
  {
    id: 'bridge-seal-daily',
    route: 'daily_phase',
    source: 'seal_movers',
    target: 'daily',
    edgeType: 'parallel',
    track: 'daily',
    baseY: 200,
  },
  {
    id: 'bridge-sector-narr',
    route: 'narrative_compose',
    source: 'sector',
    target: 'narrative',
    edgeType: 'pipeline',
    track: 'compose',
    baseY: 260,
  },
  {
    id: 'bridge-daily-narr',
    route: 'narrative_compose',
    source: 'daily',
    target: 'narrative',
    edgeType: 'pipeline',
    track: 'compose',
    baseY: 200,
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
  sourceStageStatus?: MarketHubSynthesisStageStatus | undefined;
  targetStageStatus?: MarketHubSynthesisStageStatus | undefined;
  sourceReady?: boolean | undefined;
  sourceBlocked?: boolean | undefined;
  targetStale?: boolean | undefined;
  pulsed?: boolean | undefined;
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
  if (flow.route) {
    switch (flow.route) {
      case 'providers_entitle':
      case 'bars_entitle':
        return 'entitle';
      case 'sector_bulletin':
        return 'sector';
      case 'daily_phase':
        return 'daily';
      case 'narrative_compose':
        return 'compose';
      case 'news_headline':
      case 'web_search':
        return flow.pipelines.includes('sector') && !flow.pipelines.includes('movers')
          ? 'sector'
          : 'compound';
      default:
        return 'compound';
    }
  }
  if (flow.analysisRoles.includes('relative_strength')) return 'compound';
  if (flow.pipelines.includes('sector') && !flow.pipelines.includes('movers')) return 'sector';
  if (flow.pipelines.includes('sector') && flow.analysisRoles.includes('news_corpus')) {
    return 'sector';
  }
  if (flow.kind.startsWith('library:')) return 'compound';
  if (flow.analysisRoles.includes('bars_entitlement')) return 'entitle';
  return 'compound';
}

function processNodeState(
  step: MarketHubModelProcessStep,
): { activation: MarketHubModelEdgeActivation; status: MarketHubModelEdgeStatus } {
  if (step.status === 'missing_key' || step.status === 'stub') {
    return { activation: 'blocked', status: 'blocked' };
  }
  if (step.status === 'ready' || step.status === 'public') {
    return { activation: 'armed', status: 'ready' };
  }
  return { activation: 'idle', status: 'idle' };
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

  const allLiveSources = hydration?.liveSources ?? [];
  const allLibrarySources = hydration?.librarySources ?? [];
  const capitalSources = hydration?.capitalSources ?? [];
  const panelSurfacesEarly = hydration?.panelSurfaces ?? [];

  /** D-163: diagram shows only available providers / admitted libraries. */
  const liveSources = allLiveSources.filter(isAvailableLiveSource);
  const librarySources = allLibrarySources.filter(isAvailableLibrarySource);
  const availableKinds = new Set(liveSources.map((s) => s.kind));

  const caps = resolveModelTrackCapabilities({
    liveSources: allLiveSources,
    librarySources: allLibrarySources,
    hasCapitalSources: capitalSources.length > 0,
    hasPanelSurfaces: panelSurfacesEarly.length > 0,
  });

  const flows = (hydration?.processingFlows ?? []).filter((f) => {
    if (f.kind.startsWith('library:')) {
      return librarySources.some((lib) => f.kind === `library:${lib.id}`);
    }
    return availableKinds.has(f.kind);
  });

  const processSteps = (hydration?.processSteps ?? []).filter((s) => {
    if (s.kind === 'shared') {
      if (s.route === 'sector_bulletin' && !caps.hasSector) return false;
      if (s.route === 'daily_phase' && !caps.hasDaily) return false;
      if (s.route === 'providers_entitle' && !caps.hasEntitle) return false;
      if (
        (s.route === 'thresholds_llm' ||
          s.route === 'defaults_catalog' ||
          s.route === 'universe_build' ||
          s.route === 'compound_rank' ||
          s.route === 'verify_promote') &&
        !caps.hasCompound
      ) {
        return false;
      }
      if (s.route === 'narrative_compose' && !caps.hasCompose) return false;
      return true;
    }
    if (s.kind.startsWith('library:')) {
      return librarySources.some((lib) => s.kind === `library:${lib.id}`);
    }
    return availableKinds.has(s.kind);
  });
  const stepsById = new Map(processSteps.map((s) => [s.id, s]));
  const asOfIso = hydration?.asOfIso ?? null;

  const activeStageLayout = STAGE_LAYOUT.filter((s) => {
    if (s.id === 'sector' && !caps.hasSector) return false;
    if (s.id === 'daily' && !caps.hasDaily) return false;
    if (
      (s.id === 'providers' || s.id === 'gather') &&
      !caps.hasCompound &&
      !caps.hasEntitle
    ) {
      return false;
    }
    if (
      ['thresholds', 'defaults', 'universe', 'rs', 'rank', 'verify', 'seal_movers'].includes(
        s.id,
      ) &&
      !caps.hasCompound
    ) {
      return false;
    }
    if ((s.id === 'narrative' || s.id === 'hub_ready') && !caps.hasCompose) return false;
    return true;
  });

  const activeBridges = SHARED_BRIDGE_SPECS.filter((b) => {
    if (b.track === 'sector' || b.route === 'sector_bulletin') return caps.hasSector;
    if (b.track === 'daily' || b.route === 'daily_phase') return caps.hasDaily;
    if (b.route === 'providers_entitle') return caps.hasEntitle;
    if (b.track === 'compose' || b.route === 'narrative_compose') return caps.hasCompose;
    if (b.track === 'compound') return caps.hasCompound;
    if (b.track === 'entitle') return caps.hasEntitle;
    return true;
  });

  const gap = 72;
  const liveX = 0;
  const adapterX = 220;
  const processCol0 = 400;
  const processColW = 150;

  /** Ensure process nodes exist; return node id. */
  const ensureProcessNode = (
    step: MarketHubModelProcessStep,
    pos: { x: number; y: number },
  ): string => {
    const nodeId = `process:${step.id}`;
    if (nodes.some((n) => n.id === nodeId)) return nodeId;
    const st = processNodeState(step);
    nodes.push({
      id: nodeId,
      type: 'postureAlgo',
      position: pos,
      data: {
        label: step.label,
        detail: `${step.route} · ${step.analysisRole}`,
        kind: 'deterministic',
        nodeRole: 'process',
        operation: step.operation,
        amount: step.amount,
        analysisRoles: [step.analysisRole],
        processRoute: step.route,
        processStepId: step.id,
        layer: 'pipeline',
        track: trackForFlow({
          id: step.id,
          kind: step.kind,
          adapterLabel: step.label,
          analysisRoles: [step.analysisRole],
          operation: step.operation,
          amount: step.amount,
          route: step.route,
          processStepIds: [],
          targetStages: step.feedStages,
          pipelines: step.pipelines.filter((p): p is 'movers' | 'sector' =>
            p === 'movers' || p === 'sector',
          ),
          status: step.status,
          contributed: false,
        }),
        activation: pulsed?.has(nodeId) ? 'pulsing' : st.activation,
        status: st.status,
        updatedAt: asOfIso,
      },
    });
    return nodeId;
  };

  /** Wire adapter → ordered process steps → feed stages. */
  const wireFlowProcessChain = (opts: {
    adapterId: string;
    flow: MarketHubModelProcessingFlow;
    baseY: number;
    track: MarketHubModelTrack;
    blocked: boolean;
    ready: boolean;
  }) => {
    const stepIds = opts.flow.processStepIds ?? [];
    if (stepIds.length === 0) {
      for (const stageId of diagramTargetStages(opts.flow)) {
        const edgeId = `e-${opts.adapterId}-${stageId}`;
        edges.push({
          id: edgeId,
          source: opts.adapterId,
          target: stageId,
          label: (opts.flow.route ?? opts.flow.analysisRoles[0] ?? 'adapt').slice(0, 24),
          data: {
            edgeType: 'adapt',
            track: opts.track,
            ...resolveModelEdgeState({
              edgeType: 'adapt',
              sourceBlocked: opts.blocked,
              sourceReady: opts.ready,
              targetStageStatus: byStage.get(stageId)?.status,
              pulsed: pulsed?.has(edgeId) ?? false,
            }),
          },
        });
      }
      return;
    }

    let prevId = opts.adapterId;
    stepIds.forEach((sid, si) => {
      const step = stepsById.get(sid);
      if (!step) return;
      const nodeId = ensureProcessNode(step, {
        x: processCol0 + si * processColW,
        y: opts.baseY,
      });
      const edgeId = `e-${prevId}-${nodeId}`;
      edges.push({
        id: edgeId,
        source: prevId,
        target: nodeId,
        label: step.analysisRole.slice(0, 20),
        data: {
          edgeType: si === 0 ? 'adapt' : 'pipeline',
          track: opts.track,
          ...resolveModelEdgeState({
            edgeType: si === 0 ? 'adapt' : 'pipeline',
            sourceBlocked: opts.blocked,
            sourceReady: opts.ready,
            pulsed: pulsed?.has(edgeId) ?? false,
          }),
        },
      });
      prevId = nodeId;
    });

    for (const stageId of diagramTargetStages(opts.flow)) {
      const edgeId = `e-${prevId}-${stageId}`;
      edges.push({
        id: edgeId,
        source: prevId,
        target: stageId,
        label: stageId.slice(0, 16),
        data: {
          edgeType: 'pipeline',
          track: opts.track,
          ...resolveModelEdgeState({
            edgeType: 'pipeline',
            sourceBlocked: opts.blocked,
            sourceReady: opts.ready,
            targetStageStatus: byStage.get(stageId)?.status,
            pulsed: pulsed?.has(edgeId) ?? false,
          }),
        },
      });
    }
  };

  /** Wire stage → shared route process steps → stage (D-162). Dedupes shared nodes. */
  const wireSharedRouteChain = (bridge: SharedBridgeSpec) => {
    const steps = processSteps
      .filter((s) => s.kind === 'shared' && s.route === bridge.route)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (steps.length === 0) {
      const edgeId = bridge.id;
      if (!edges.some((e) => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: bridge.source,
          target: bridge.target,
          label: bridge.route.slice(0, 24),
          data: {
            edgeType: bridge.edgeType,
            track: bridge.track,
            ...resolveModelEdgeState({
              edgeType: bridge.edgeType,
              sourceStageStatus: byStage.get(bridge.source)?.status,
              targetStageStatus: byStage.get(bridge.target)?.status,
              pulsed: pulsed?.has(edgeId) ?? false,
            }),
          },
        });
      }
      return;
    }

    const srcLayout = STAGE_LAYOUT.find((s) => s.id === bridge.source);
    const tgtLayout = STAGE_LAYOUT.find((s) => s.id === bridge.target);
    const x0 = (srcLayout?.x ?? 1000) + 60;
    const xEnd = (tgtLayout?.x ?? x0 + 200) - 40;
    const span = Math.max(90, (xEnd - x0) / Math.max(1, steps.length));

    const nodeIds = steps.map((step, si) =>
      ensureProcessNode(step, { x: x0 + si * span, y: bridge.baseY }),
    );

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const edgeId = `e-shared:${bridge.route}:${i}`;
      if (edges.some((e) => e.id === edgeId)) continue;
      edges.push({
        id: edgeId,
        source: nodeIds[i]!,
        target: nodeIds[i + 1]!,
        ...(steps[i + 1]?.analysisRole
          ? { label: steps[i + 1]!.analysisRole.slice(0, 20) }
          : {}),
        data: {
          edgeType: 'pipeline',
          track: bridge.track,
          ...resolveModelEdgeState({
            edgeType: 'pipeline',
            sourceStageStatus: byStage.get(bridge.source)?.status,
            targetStageStatus: byStage.get(bridge.target)?.status,
            pulsed: pulsed?.has(edgeId) ?? false,
          }),
        },
      });
    }

    const inId = `e-${bridge.source}-${nodeIds[0]}`;
    if (!edges.some((e) => e.id === inId)) {
      edges.push({
        id: inId,
        source: bridge.source,
        target: nodeIds[0]!,
        label: bridge.route.slice(0, 20),
        data: {
          edgeType: bridge.edgeType,
          track: bridge.track,
          ...resolveModelEdgeState({
            edgeType: bridge.edgeType,
            sourceStageStatus: byStage.get(bridge.source)?.status,
            pulsed: pulsed?.has(inId) ?? false,
          }),
        },
      });
    }

    const lastId = nodeIds[nodeIds.length - 1]!;
    const outId = `e-${lastId}-${bridge.target}`;
    if (!edges.some((e) => e.id === outId)) {
      edges.push({
        id: outId,
        source: lastId,
        target: bridge.target,
        label: bridge.target.slice(0, 16),
        data: {
          edgeType: bridge.edgeType,
          track: bridge.track,
          ...resolveModelEdgeState({
            edgeType: bridge.edgeType,
            sourceStageStatus: byStage.get(bridge.source)?.status,
            targetStageStatus: byStage.get(bridge.target)?.status,
            pulsed: pulsed?.has(outId) ?? false,
          }),
        },
      });
    }

    if (bridge.route === 'verify_promote') {
      const gates = steps.find((s) => s.id.endsWith(':gates'));
      if (gates) {
        const gid = `process:${gates.id}`;
        const verId = `e-${gid}-verify`;
        if (!edges.some((e) => e.id === verId)) {
          edges.push({
            id: verId,
            source: gid,
            target: 'verify',
            label: 'gates',
            data: {
              edgeType: 'pipeline',
              track: bridge.track,
              ...resolveModelEdgeState({
                edgeType: 'pipeline',
                sourceStageStatus: byStage.get(bridge.source)?.status,
                targetStageStatus: byStage.get('verify')?.status,
                pulsed: pulsed?.has(verId) ?? false,
              }),
            },
          });
        }
      }
    }
  };

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

      wireFlowProcessChain({
        adapterId,
        flow,
        baseY: ay,
        track,
        blocked: aBlocked,
        ready: aReady,
      });
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
      wireFlowProcessChain({
        adapterId,
        flow,
        baseY: y,
        track: 'compound',
        blocked: false,
        ready,
      });
    } else {
      const edgeId = `e-${liveId}-gather`;
      edges.push({
        id: edgeId,
        source: liveId,
        target: 'gather',
        ...(ready ? { label: 'corpus' } : {}),
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

  for (const s of activeStageLayout) {
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

  for (const bridge of activeBridges) {
    wireSharedRouteChain(bridge);
  }

  for (const spec of DIRECT_STAGE_EDGE_SPECS) {
    if (!activeStageLayout.some((s) => s.id === spec.source)) continue;
    if (!activeStageLayout.some((s) => s.id === spec.target)) continue;
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
      ...(spec.label ? { label: spec.label } : {}),
      data: {
        edgeType: spec.edgeType,
        track: spec.track,
        ...state,
      },
    });
  }

  // Capital data sources (D-163) — fund rows with inline amount readouts.
  const capitalStartY =
    librarySources.length > 0
      ? libStartY + librarySources.length * gap + 24
      : row * gap + 48;
  capitalSources.forEach((cap, i) => {
    const nodeId = `capital:${cap.id}`;
    const ready = cap.status === 'configured';
    nodes.push({
      id: nodeId,
      type: 'postureAlgo',
      position: { x: liveX, y: capitalStartY + i * gap },
      data: {
        label: cap.name,
        detail: `${cap.tier} · ${cap.kind}`,
        kind: 'data',
        nodeRole: 'capital_source',
        operation: cap.operation,
        amount: cap.amount,
        capitalBearing: true,
        layer: 'sources',
        track: 'compose',
        activation: ready ? 'armed' : 'idle',
        status: ready ? 'ready' : 'idle',
        updatedAt: asOfIso,
      },
    });
    const edgeId = `e-${nodeId}-panel:capital`;
    edges.push({
      id: edgeId,
      source: nodeId,
      target: 'panel:capital',
      label: 'funds',
      data: {
        edgeType: 'hydrate',
        track: 'compose',
        ...resolveModelEdgeState({
          edgeType: 'hydrate',
          sourceReady: ready,
          pulsed: pulsed?.has(edgeId) ?? false,
        }),
      },
    });
  });

  // Panel surfaces — hub_ready hydrates into operator rail/overlay boards (D-161).
  const panelSurfaces = (hydration?.panelSurfaces ?? []).filter((surf) => {
    if (surf.id === 'news' && !caps.hasSector) return false;
    return true;
  });
  const panelX = 3600;
  const panelGap = 56;
  const panelStartY = 40;
  panelSurfaces.forEach((surf, i) => {
    const nodeId = `panel:${surf.id}`;
    const ready = surf.status !== 'empty' && surf.status !== 'missing' && surf.status !== 'unavailable';
    const activation: MarketHubModelEdgeActivation = pulsed?.has(nodeId)
      ? 'pulsing'
      : ready
        ? 'armed'
        : 'idle';
    const capitalBearing = surf.capitalBearing === true;
    nodes.push({
      id: nodeId,
      type: 'postureAlgo',
      position: { x: panelX, y: panelStartY + i * panelGap },
      data: {
        label: surf.label,
        detail: `${surf.panel} · ${surf.status}`,
        kind: 'output',
        nodeRole: 'panel_surface',
        operation: surf.operation,
        amount: surf.amount,
        panelSurfaceId: surf.id,
        panelKind: surf.panel,
        capitalBearing,
        layer: 'output',
        track: 'compose',
        activation,
        status: ready ? 'ready' : 'idle',
        updatedAt: surf.updatedAt ?? hydration?.livePatchedAt ?? asOfIso,
      },
    });
    const edgeId = `e-hub_ready-${nodeId}`;
    const fromStageRaw = surf.sourceStageId ?? 'hub_ready';
    const fromStage = activeStageLayout.some((s) => s.id === fromStageRaw)
      ? fromStageRaw
      : activeStageLayout.some((s) => s.id === 'hub_ready')
        ? 'hub_ready'
        : (activeStageLayout[activeStageLayout.length - 1]?.id ?? 'hub_ready');
    edges.push({
      id: edgeId,
      source: fromStage,
      target: nodeId,
      label: surf.panel,
      data: {
        edgeType: 'panel',
        track: 'compose',
        ...resolveModelEdgeState({
          edgeType: 'panel',
          sourceStageStatus: byStage.get(fromStage)?.status,
          sourceReady: ready,
          pulsed: pulsed?.has(edgeId) ?? false,
        }),
      },
    });
  });

  // Only list tracks that actually appear after availability filtering (D-163).
  const trackIds = new Set<MarketHubModelTrack>(tracksFromCapabilities(caps));
  for (const e of edges) trackIds.add(e.data.track);
  for (const n of nodes) trackIds.add(n.data.track);
  const tracks = (Object.keys(MARKET_HUB_MODEL_TRACK_META) as MarketHubModelTrack[])
    .filter((id) => trackIds.has(id))
    .map((id) => ({
      id,
      label: MARKET_HUB_MODEL_TRACK_META[id].label,
      summary: MARKET_HUB_MODEL_TRACK_META[id].summary,
    }));

  return { nodes, edges, tracks, asOfIso };
}

/**
 * Collect edge/node ids that changed since the previous snapshot (D-160 / D-161).
 * livePatchedAt pulses panel surfaces only — not full Sync hydrate storm.
 */
export function collectModelPulseIds(opts: {
  prevAsOf: string | null;
  nextAsOf: string | null;
  prevStageSig: string;
  nextStageSig: string;
  prevLivePatchedAt?: string | null;
  nextLivePatchedAt?: string | null;
  edgeIds: string[];
  stageIds: string[];
  panelNodeIds?: string[];
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
  if (
    opts.nextLivePatchedAt &&
    opts.nextLivePatchedAt !== (opts.prevLivePatchedAt ?? null)
  ) {
    for (const id of opts.panelNodeIds ?? []) out.add(id);
    for (const id of opts.edgeIds) {
      if (id.includes('panel:') || id.startsWith('e-hub_ready-panel:')) out.add(id);
    }
  }
  return out;
}
