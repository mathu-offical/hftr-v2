/**
 * Market posture synthesis Model graph (D-120 … D-169 / D-179).
 * Available providers only; track-banded layout with clear lane spacing;
 * data sources (live/library/capital) feed route process chains.
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
  primaryTrackForLiveKind,
  resolveModelTrackCapabilities,
  tracksFromCapabilities,
} from './market-hub-model-availability';
import { primaryFeedStage } from './market-hub-process-routes';
import {
  MARKET_POSTURE_STAGE_SCREENS,
  resolveStageScreenId,
  type MarketPostureStageScreenId,
} from './market-posture-stage-screens';

export { resolveStageScreenId };
export type { MarketPostureStageScreenId };

export type PostureAlgoNodeRole =
  | 'live_source'
  | 'adapter'
  | 'process'
  | 'library_source'
  | 'capital_source'
  | 'stage'
  | 'panel_surface'
  | 'lane_label'
  /** Strip layout section frame (D-186). */
  | 'screen_group'
  /** Nested process-route cluster inside the Process screen (D-186). */
  | 'process_cluster';

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
  /** Function class for process chrome (D-169). */
  processFunction?: string;
  /** Live/library source domain for SRC chrome (D-169). */
  sourceDomain?: string;
  /** Panel surface id when nodeRole is panel_surface (D-161). */
  panelSurfaceId?: string;
  panelKind?: 'rail' | 'overlay' | 'both';
  /** Emphasize amount as capital readout (D-163). */
  capitalBearing?: boolean;
  /** Owning stage screen when nodeRole is screen_group / process_cluster (D-186). */
  stageScreenId?: string;
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

export type PostureAlgoTrackBand = {
  id: MarketHubModelTrack;
  label: string;
  summary: string;
  y: number;
};

export type PostureAlgoGraphNode = {
  id: string;
  type: 'postureAlgo' | 'postureGroup';
  position: { x: number; y: number };
  data: PostureAlgoNodeData;
  parentId?: string;
  extent?: 'parent';
  style?: { width: number; height: number };
  draggable?: boolean;
  selectable?: boolean;
};

export type PostureAlgoGraph = {
  nodes: PostureAlgoGraphNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string | undefined;
    data: PostureAlgoEdgeData;
  }>;
  tracks: Array<{ id: MarketHubModelTrack; label: string; summary: string }>;
  /** Vertical lane anchors for track separation (D-165). */
  trackBands: PostureAlgoTrackBand[];
  asOfIso: string | null;
};

/** Column / lane spacing — roomy tracks for source→process→stage→emit→panel (D-165 / D-179). */
const COL = {
  laneLabel: -60,
  live: 80,
  adapter: 380,
  process0: 680,
  processW: 240,
  stage0: 1780,
  stageW: 300,
} as const;

/** Track lane Y baselines — wider vertical separation between data tracks. */
const LANE_Y: Record<MarketHubModelTrack, number> = {
  entitle: 40,
  compound: 360,
  daily: 680,
  sector: 960,
  compose: 360,
};

const CAPITAL_LANE_Y = 1240;
const SOURCE_ROW_GAP = 148;
const ADAPTER_STACK = 88;

const STAGE_LAYOUT: Array<{
  id: MarketHubSynthesisStageId;
  x: number;
  y: number;
}> = [
  { id: 'providers', x: COL.stage0, y: LANE_Y.entitle },
  { id: 'gather', x: COL.stage0 + COL.stageW, y: LANE_Y.compound },
  { id: 'thresholds', x: COL.stage0 + COL.stageW * 2, y: LANE_Y.compound - 160 },
  { id: 'defaults', x: COL.stage0 + COL.stageW * 2, y: LANE_Y.compound + 160 },
  { id: 'universe', x: COL.stage0 + COL.stageW * 3, y: LANE_Y.compound },
  { id: 'rs', x: COL.stage0 + COL.stageW * 4, y: LANE_Y.compound },
  { id: 'rank', x: COL.stage0 + COL.stageW * 5, y: LANE_Y.compound },
  { id: 'verify', x: COL.stage0 + COL.stageW * 6, y: LANE_Y.compound },
  { id: 'seal_movers', x: COL.stage0 + COL.stageW * 7, y: LANE_Y.compound - 120 },
  { id: 'sector', x: COL.stage0 + COL.stageW * 7, y: LANE_Y.sector },
  { id: 'daily', x: COL.stage0 + COL.stageW * 8, y: LANE_Y.daily },
  { id: 'narrative', x: COL.stage0 + COL.stageW * 9, y: LANE_Y.compose },
  { id: 'hub_ready', x: COL.stage0 + COL.stageW * 10, y: LANE_Y.compose },
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
    baseY: LANE_Y.entitle,
  },
  {
    id: 'bridge-gather-llm',
    route: 'thresholds_llm',
    source: 'gather',
    target: 'thresholds',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: LANE_Y.compound - 80,
  },
  {
    id: 'bridge-gather-def',
    route: 'defaults_catalog',
    source: 'gather',
    target: 'defaults',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: LANE_Y.compound + 140,
  },
  {
    id: 'bridge-llm-uni',
    route: 'universe_build',
    source: 'thresholds',
    target: 'universe',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: LANE_Y.compound - 40,
  },
  {
    id: 'bridge-def-uni',
    route: 'universe_build',
    source: 'defaults',
    target: 'universe',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: LANE_Y.compound + 100,
  },
  {
    id: 'bridge-rs-rank',
    route: 'compound_rank',
    source: 'rs',
    target: 'rank',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: LANE_Y.compound,
  },
  {
    id: 'bridge-rank-seal',
    route: 'verify_promote',
    source: 'rank',
    target: 'seal_movers',
    edgeType: 'pipeline',
    track: 'compound',
    baseY: LANE_Y.compound - 60,
  },
  {
    id: 'bridge-seal-sector',
    route: 'sector_bulletin',
    source: 'seal_movers',
    target: 'sector',
    edgeType: 'parallel',
    track: 'sector',
    baseY: LANE_Y.sector,
  },
  {
    id: 'bridge-seal-daily',
    route: 'daily_phase',
    source: 'seal_movers',
    target: 'daily',
    edgeType: 'parallel',
    track: 'daily',
    baseY: LANE_Y.daily,
  },
  {
    id: 'bridge-sector-narr',
    route: 'narrative_compose',
    source: 'sector',
    target: 'narrative',
    edgeType: 'pipeline',
    track: 'compose',
    baseY: LANE_Y.sector - 40,
  },
  {
    id: 'bridge-daily-narr',
    route: 'narrative_compose',
    source: 'daily',
    target: 'narrative',
    edgeType: 'pipeline',
    track: 'compose',
    baseY: LANE_Y.daily,
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

/** Primary milestone only — shared bridges carry stage→stage (D-169). */
function diagramTargetStages(flow: MarketHubModelProcessingFlow): MarketHubSynthesisStageId[] {
  const primary = primaryFeedStage(flow);
  return primary ? [primary] : [];
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
  /**
   * Bottom Model strip uses wider spacing for readability (D-186).
   * Positions are scaled after layout; edge geometry follows nodes.
   */
  layoutMode?: 'default' | 'stripExpanded';
}): PostureAlgoGraph {
  const hydration = opts?.hydration ?? null;
  const pulsed = opts?.pulsedEdgeIds ?? null;
  const nowMs = opts?.nowMs ?? Date.now();
  const layoutMode = opts?.layoutMode ?? 'default';
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

  const gap = SOURCE_ROW_GAP;
  const liveX = COL.live;
  const adapterX = COL.adapter;
  const processCol0 = COL.process0;
  const processColW = COL.processW;

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
        processFunction: step.processFunction,
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
        label: (step.processFunction || step.analysisRole).slice(0, 20),
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

  /** Stack sources inside each track lane (D-165). */
  const laneRow = new Map<MarketHubModelTrack, number>();
  const nextLaneY = (track: MarketHubModelTrack, baseY: number): number => {
    const i = laneRow.get(track) ?? 0;
    laneRow.set(track, i + 1);
    return baseY + i * gap;
  };

  // Lane labels — left rail markers for track separation
  for (const trackId of tracksFromCapabilities(caps)) {
    const meta = MARKET_HUB_MODEL_TRACK_META[trackId];
    nodes.push({
      id: `lane:${trackId}`,
      type: 'postureAlgo',
      position: { x: COL.laneLabel, y: LANE_Y[trackId] },
      data: {
        label: meta.label,
        detail: meta.summary,
        kind: 'deterministic',
        nodeRole: 'lane_label',
        operation: 'track',
        amount: trackId,
        layer: 'sources',
        track: trackId,
        activation: 'armed',
        status: 'ready',
        updatedAt: asOfIso,
      },
    });
  }

  for (const src of liveSources) {
    const liveId = `live:${src.kind}`;
    const srcTrack = primaryTrackForLiveKind(src.kind);
    const y = nextLaneY(srcTrack, LANE_Y[srcTrack]);
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
        sourceDomain: src.domain,
        layer: 'sources',
        track: srcTrack,
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
      continue;
    }

    kindFlows.forEach((flow, fi) => {
      const adapterId = `adapter:${flow.id}`;
      const ay = y + fi * ADAPTER_STACK;
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
  }

  const libFlows = flows.filter((f) => f.kind.startsWith('library:'));
  librarySources.forEach((lib) => {
    const liveId = `lib:${lib.id}`;
    const y = nextLaneY('compound', LANE_Y.compound + 40);
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
  capitalSources.forEach((cap, i) => {
    const nodeId = `capital:${cap.id}`;
    const ready = cap.status === 'configured';
    const y = CAPITAL_LANE_Y + i * gap;
    nodes.push({
      id: nodeId,
      type: 'postureAlgo',
      position: { x: liveX, y },
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

  if (capitalSources.length > 0 && caps.hasCompose) {
    nodes.push({
      id: 'lane:capital',
      type: 'postureAlgo',
      position: { x: COL.laneLabel, y: CAPITAL_LANE_Y },
      data: {
        label: 'Capital',
        detail: 'Fund rows · allocation readouts',
        kind: 'data',
        nodeRole: 'lane_label',
        operation: 'funds',
        amount: 'compose',
        layer: 'sources',
        track: 'compose',
        activation: 'armed',
        status: 'ready',
        updatedAt: asOfIso,
      },
    });
  }

  // Panel surfaces — primary stage hydrate + mid-pipeline metric emits (D-161 / D-179).
  const panelSurfaces = (hydration?.panelSurfaces ?? []).filter((surf) => {
    if (surf.id === 'news' && !caps.hasSector) return false;
    if (surf.id.startsWith('awareness_') && !caps.hasCompound && !caps.hasSector) return false;
    return true;
  });
  const hubX =
    activeStageLayout.find((s) => s.id === 'hub_ready')?.x ??
    COL.stage0 + COL.stageW * 10;
  const panelX = hubX + 420;
  const panelGap = 96;
  const panelStartY = LANE_Y.entitle;
  const processNodes = nodes.filter((n) => n.data.nodeRole === 'process');

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

    const fromStageRaw = surf.sourceStageId ?? 'hub_ready';
    const fromStage = activeStageLayout.some((s) => s.id === fromStageRaw)
      ? fromStageRaw
      : activeStageLayout.some((s) => s.id === 'hub_ready')
        ? 'hub_ready'
        : (activeStageLayout[activeStageLayout.length - 1]?.id ?? 'hub_ready');
    const panelEdgeId = `e-panel-${fromStage}-${nodeId}`;
    edges.push({
      id: panelEdgeId,
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
          pulsed: pulsed?.has(panelEdgeId) ?? false,
        }),
      },
    });

    // Mid-pipeline metric emissions (dashed) — stages named in emitFromStages.
    const emitStages = surf.emitFromStages ?? [];
    for (const stageId of emitStages) {
      if (!activeStageLayout.some((s) => s.id === stageId)) continue;
      if (stageId === fromStage) continue;
      const emitId = `e-emit-${stageId}-${nodeId}`;
      if (edges.some((e) => e.id === emitId)) continue;
      edges.push({
        id: emitId,
        source: stageId,
        target: nodeId,
        label: 'emit',
        data: {
          edgeType: 'emit',
          track: 'compose',
          ...resolveModelEdgeState({
            edgeType: 'emit',
            sourceStageStatus: byStage.get(stageId)?.status,
            sourceReady: ready,
            pulsed: pulsed?.has(emitId) ?? false,
          }),
        },
      });
    }

    // Process-function emissions — one representative process node per function class.
    const emitFns = new Set<string>(surf.emitFromFunctions ?? []);
    if (emitFns.size > 0) {
      const seenFn = new Set<string>();
      for (const pn of processNodes) {
        const fn = pn.data.processFunction;
        if (!fn || !emitFns.has(fn) || seenFn.has(fn)) continue;
        seenFn.add(fn);
        const emitId = `e-emit-fn-${fn}-${nodeId}`;
        if (edges.some((e) => e.id === emitId)) continue;
        edges.push({
          id: emitId,
          source: pn.id,
          target: nodeId,
          label: fn,
          data: {
            edgeType: 'emit',
            track: pn.data.track,
            ...resolveModelEdgeState({
              edgeType: 'emit',
              sourceReady: pn.data.status === 'ready' || ready,
              pulsed: pulsed?.has(emitId) ?? false,
            }),
          },
        });
      }
    }
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

  const trackBands: PostureAlgoTrackBand[] = tracks.map((t) => ({
    id: t.id,
    label: t.label,
    summary: t.summary,
    y: LANE_Y[t.id],
  }));

  if (layoutMode === 'stripExpanded') {
    const packed = applyStripScreenGroups(nodes, edges);
    return {
      nodes: packed,
      edges: finalizeStripEdges(edges, packed),
      tracks,
      trackBands,
      asOfIso,
    };
  }

  return { nodes, edges, tracks, trackBands, asOfIso };
}

/** Outer screen-column pitch (must fit inner role lanes). */
const STRIP_NODE_H = 58;
const STRIP_NODE_W = 148;
const STRIP_PAD = 8;
const STRIP_HEADER = 26;
const STRIP_INNER_GAP = 10;
/** Max role lanes inside a screen group (src → adapt → process → stage → emit). */
const STRIP_INNER_LANES = 5;
const STRIP_INNER_LANE_W = STRIP_NODE_W + STRIP_INNER_GAP;
const STRIP_COL_W =
  STRIP_PAD * 2 + STRIP_INNER_LANES * STRIP_INNER_LANE_W + 12;

const STRIP_ROLE_ORDER: Record<PostureAlgoNodeRole, number> = {
  screen_group: -1,
  process_cluster: -1,
  capital_source: 0,
  library_source: 0,
  live_source: 0,
  adapter: 1,
  process: 2,
  stage: 3,
  panel_surface: 4,
  lane_label: 9,
};

/** Pipeline order inside a process-route cluster (fetch → … → seal/compose). */
const PROCESS_FN_ORDER: Record<string, number> = {
  fetch: 0,
  entitle: 0,
  load: 0,
  announce: 1,
  normalize: 2,
  extract: 3,
  context: 4,
  corroborate: 5,
  score: 6,
  thresholds: 6,
  defaults: 6,
  rank: 7,
  verify: 8,
  seal: 9,
  compose: 10,
};

const STRIP_CLUSTER_GAP = 10;
const STRIP_CLUSTER_HEADER = 22;

function processClusterKey(n: PostureAlgoGraphNode): string {
  const route = n.data.processRoute?.trim();
  if (route) return route;
  const kind = n.id.replace(/^process:/, '').split(':')[0];
  return kind || 'shared';
}

function formatRouteLabel(route: string): string {
  return route.replace(/_/g, ' ');
}

function sortProcessStepsInCluster(a: PostureAlgoGraphNode, b: PostureAlgoGraphNode): number {
  const fa = PROCESS_FN_ORDER[a.data.processFunction ?? ''] ?? 50;
  const fb = PROCESS_FN_ORDER[b.data.processFunction ?? ''] ?? 50;
  if (fa !== fb) return fa - fb;
  return a.data.label.localeCompare(b.data.label);
}

/**
 * Pack the Process screen: nest route clusters (fetch→… chains) and park
 * stages/panels in a side column ordered by connectivity.
 */
function packProcessScreenColumn(opts: {
  children: PostureAlgoGraphNode[];
  edges: Array<{ source: string; target: string }>;
  colIdx: number;
  globalRank: Map<string, number>;
  intraEdges: number;
  interEdges: number;
  screenSummary: string;
}): PostureAlgoGraphNode[] {
  const { children, edges, colIdx, globalRank, intraEdges, interEdges, screenSummary } =
    opts;
  const processNodes = children.filter((n) => n.data.nodeRole === 'process');
  const otherNodes = children.filter((n) => n.data.nodeRole !== 'process');

  const byRoute = new Map<string, PostureAlgoGraphNode[]>();
  for (const n of processNodes) {
    const key = processClusterKey(n);
    const list = byRoute.get(key) ?? [];
    list.push(n);
    byRoute.set(key, list);
  }

  const routeKeys = [...byRoute.keys()].sort((a, b) => {
    const membersA = byRoute.get(a) ?? [];
    const membersB = byRoute.get(b) ?? [];
    const rankA = median(membersA.map((n) => globalRank.get(n.id) ?? 0));
    const rankB = median(membersB.map((n) => globalRank.get(n.id) ?? 0));
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });

  // Prefer routes that share edges with the same upstream adapters (cluster cohesion).
  routeKeys.sort((a, b) => {
    const score = (route: string) => {
      const members = byRoute.get(route) ?? [];
      const ids = new Set(members.map((m) => m.id));
      let shared = 0;
      for (const e of edges) {
        if (ids.has(e.target) || ids.has(e.source)) shared += 1;
      }
      return shared;
    };
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sb - sa;
    return a.localeCompare(b);
  });

  const groupId = `group:process`;
  const out: PostureAlgoGraphNode[] = [];
  let cursorY = STRIP_HEADER + STRIP_PAD;
  let maxClusterW = STRIP_PAD * 2 + STRIP_INNER_LANE_W;

  for (const route of routeKeys) {
    const steps = [...(byRoute.get(route) ?? [])].sort(sortProcessStepsInCluster);
    if (steps.length === 0) continue;
    const clusterId = `cluster:process:${route}`;
    const clusterW =
      STRIP_PAD * 2 + Math.max(steps.length, 1) * STRIP_INNER_LANE_W;
    const clusterH = STRIP_CLUSTER_HEADER + STRIP_PAD * 2 + STRIP_NODE_H;
    maxClusterW = Math.max(maxClusterW, clusterW);

    const fnSummary = [
      ...new Set(steps.map((s) => s.data.processFunction).filter(Boolean)),
    ]
      .slice(0, 4)
      .join(' → ');

    out.push({
      id: clusterId,
      type: 'postureGroup',
      parentId: groupId,
      extent: 'parent',
      position: { x: STRIP_PAD, y: cursorY },
      style: { width: clusterW, height: clusterH },
      draggable: false,
      selectable: true,
      data: {
        label: formatRouteLabel(route),
        detail: fnSummary || 'process chain',
        kind: 'data',
        nodeRole: 'process_cluster',
        stageScreenId: 'process',
        processRoute: route,
        operation: 'route cluster',
        amount: String(steps.length),
        layer: 'pipeline',
        track: steps[0]?.data.track ?? 'compound',
        activation: 'armed',
        status: 'ready',
        updatedAt: null,
      },
    });

    steps.forEach((step, si) => {
      out.push({
        ...step,
        parentId: clusterId,
        extent: 'parent',
        position: {
          x: STRIP_PAD + si * STRIP_INNER_LANE_W,
          y: STRIP_CLUSTER_HEADER + STRIP_PAD,
        },
        draggable: false,
        data: {
          ...step.data,
          stageScreenId: 'process',
        },
      });
      globalRank.set(step.id, si);
    });

    cursorY += clusterH + STRIP_CLUSTER_GAP;
  }

  const otherX = maxClusterW + STRIP_PAD * 2;
  const orderedOther = orderLaneByConnections(otherNodes, edges, globalRank);
  orderedOther.forEach((child, rowIdx) => {
    out.push({
      ...child,
      parentId: groupId,
      extent: 'parent',
      position: {
        x: otherX,
        y: STRIP_HEADER + STRIP_PAD + rowIdx * STRIP_NODE_H,
      },
      draggable: false,
      data: {
        ...child.data,
        stageScreenId: 'process',
      },
    });
  });

  const otherBlockH =
    orderedOther.length > 0
      ? STRIP_PAD + orderedOther.length * STRIP_NODE_H
      : 0;
  const clustersH = Math.max(cursorY - STRIP_CLUSTER_GAP, STRIP_HEADER + STRIP_PAD);
  const height = Math.max(
    clustersH,
    STRIP_HEADER + STRIP_PAD + otherBlockH,
  ) + STRIP_PAD;
  const width = Math.max(
    otherX + STRIP_INNER_LANE_W + STRIP_PAD,
    STRIP_COL_W - 12,
  );

  out.unshift({
    id: groupId,
    type: 'postureGroup',
    position: { x: colIdx * STRIP_COL_W, y: 0 },
    style: { width, height },
    draggable: false,
    selectable: true,
    data: {
      label: 'Process',
      detail: `${routeKeys.length} routes · ${intraEdges} in · ${interEdges} out · ${screenSummary}`,
      kind: 'data',
      nodeRole: 'screen_group',
      stageScreenId: 'process',
      operation: 'section',
      amount: String(children.length),
      layer: 'sources',
      track: 'compose',
      activation: 'armed',
      status: 'ready',
      updatedAt: null,
    },
  });

  return out;
}

function screenIdForNode(n: PostureAlgoGraphNode): MarketPostureStageScreenId {
  return resolveStageScreenId({
    nodeId: n.id,
    nodeRole: n.data.nodeRole,
    stageId: n.data.stageId ?? null,
    panelSurfaceId: n.data.panelSurfaceId ?? null,
  });
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/**
 * Order nodes in a role lane by connectivity (barycenter of neighbor ranks)
 * with role/label tie-breaks. Spreads related nodes near each other.
 */
function orderLaneByConnections(
  laneNodes: PostureAlgoGraphNode[],
  edges: Array<{ source: string; target: string }>,
  rankById: Map<string, number>,
): PostureAlgoGraphNode[] {
  if (laneNodes.length <= 1) return laneNodes;
  const idSet = new Set(laneNodes.map((n) => n.id));
  const neighborRanks = (id: string): number[] => {
    const ranks: number[] = [];
    for (const e of edges) {
      if (e.source === id && !idSet.has(e.target)) {
        const r = rankById.get(e.target);
        if (r != null) ranks.push(r);
      } else if (e.target === id && !idSet.has(e.source)) {
        const r = rankById.get(e.source);
        if (r != null) ranks.push(r);
      }
    }
    return ranks;
  };

  let ordered = [...laneNodes].sort((a, b) => {
    const ma = median(neighborRanks(a.id));
    const mb = median(neighborRanks(b.id));
    if (ma !== mb) return ma - mb;
    return a.data.label.localeCompare(b.data.label);
  });

  // Second pass: refine with updated ranks inside the lane.
  const localRank = new Map(ordered.map((n, i) => [n.id, i]));
  ordered = [...ordered].sort((a, b) => {
    const extA = neighborRanks(a.id);
    const extB = neighborRanks(b.id);
    const scoreA =
      extA.length > 0
        ? median(extA)
        : (localRank.get(a.id) ?? 0);
    const scoreB =
      extB.length > 0
        ? median(extB)
        : (localRank.get(b.id) ?? 0);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.data.label.localeCompare(b.data.label);
  });
  return ordered;
}

/**
 * Pack Model nodes into screen-aligned group columns for the bottom strip (D-186).
 * Children spread by role lane (x) and connection relevance (y). No overflow cap —
 * every content node stays so intra- and inter-screen edges remain drawable.
 */
export function applyStripScreenGroups(
  nodes: PostureAlgoGraphNode[],
  edges: Array<{ source: string; target: string }> = [],
): PostureAlgoGraphNode[] {
  const content = nodes.filter((n) => n.data.nodeRole !== 'lane_label');
  const byScreen = new Map<MarketPostureStageScreenId, PostureAlgoGraphNode[]>();
  for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
    byScreen.set(screen.id, []);
  }
  for (const n of content) {
    byScreen.get(screenIdForNode(n))!.push(n);
  }

  // Global connectivity ranks (topo-ish: role then label) for barycenter seeds.
  const globalRank = new Map<string, number>();
  let rank = 0;
  for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
    const kids = [...(byScreen.get(screen.id) ?? [])].sort((a, b) => {
      const ra = STRIP_ROLE_ORDER[a.data.nodeRole] ?? 5;
      const rb = STRIP_ROLE_ORDER[b.data.nodeRole] ?? 5;
      if (ra !== rb) return ra - rb;
      return a.data.label.localeCompare(b.data.label);
    });
    for (const k of kids) globalRank.set(k.id, rank++);
  }

  const out: PostureAlgoGraphNode[] = [];
  const innerLaneW = STRIP_INNER_LANE_W;
  const groupInnerW = STRIP_PAD * 2 + STRIP_INNER_LANES * innerLaneW;
  let cursorX = 0;

  MARKET_POSTURE_STAGE_SCREENS.forEach((screen, colIdx) => {
    const children = byScreen.get(screen.id) ?? [];
    const intraEdges = edges.filter((e) => {
      const a = children.some((c) => c.id === e.source);
      const b = children.some((c) => c.id === e.target);
      return a && b;
    }).length;
    const interEdges = edges.filter((e) => {
      const a = children.some((c) => c.id === e.source);
      const b = children.some((c) => c.id === e.target);
      return (a || b) && !(a && b);
    }).length;

    if (screen.id === 'process') {
      const packed = packProcessScreenColumn({
        children,
        edges,
        colIdx,
        globalRank,
        intraEdges,
        interEdges,
        screenSummary: screen.summary,
      });
      // Reposition process group to cumulative X (wider than default pitch).
      const group = packed.find((n) => n.id === 'group:process');
      if (group) {
        group.position = { x: cursorX, y: 0 };
        cursorX += (group.style?.width ?? STRIP_COL_W) + 12;
      } else {
        cursorX += STRIP_COL_W;
      }
      out.push(...packed);
      return;
    }

    const lanes: PostureAlgoGraphNode[][] = Array.from(
      { length: STRIP_INNER_LANES },
      () => [],
    );
    for (const child of children) {
      const lane = Math.min(
        STRIP_INNER_LANES - 1,
        Math.max(0, STRIP_ROLE_ORDER[child.data.nodeRole] ?? 2),
      );
      lanes[lane]!.push(child);
    }

    const orderedLanes = lanes.map((lane) =>
      orderLaneByConnections(lane, edges, globalRank),
    );
    for (const lane of orderedLanes) {
      lane.forEach((n, i) => globalRank.set(n.id, i));
    }
    const alignedLanes = orderedLanes.map((lane) =>
      orderLaneByConnections(lane, edges, globalRank),
    );

    const maxRows = Math.max(1, ...alignedLanes.map((l) => l.length));
    const height =
      STRIP_HEADER + STRIP_PAD * 2 + maxRows * STRIP_NODE_H;
    const groupId = `group:${screen.id}`;
    const width = Math.max(STRIP_COL_W - 12, groupInnerW);

    out.push({
      id: groupId,
      type: 'postureGroup',
      position: { x: cursorX, y: 0 },
      style: { width, height },
      draggable: false,
      selectable: true,
      data: {
        label: screen.label,
        detail: `${intraEdges} in · ${interEdges} out · ${screen.summary}`,
        kind: 'data',
        nodeRole: 'screen_group',
        stageScreenId: screen.id,
        operation: 'section',
        amount: String(children.length),
        layer: 'sources',
        track: 'compose',
        activation: 'armed',
        status: 'ready',
        updatedAt: null,
      },
    });

    alignedLanes.forEach((lane, laneIdx) => {
      lane.forEach((child, rowIdx) => {
        out.push({
          ...child,
          parentId: groupId,
          extent: 'parent',
          position: {
            x: STRIP_PAD + laneIdx * innerLaneW,
            y: STRIP_HEADER + STRIP_PAD + rowIdx * STRIP_NODE_H,
          },
          draggable: false,
          data: {
            ...child.data,
            stageScreenId: screen.id,
          },
        });
      });
    });

    cursorX += width + 12;
    void colIdx;
  });
  return out;
}

/**
 * Keep every edge whose endpoints survived packing, and add screen-group
 * backbone edges for between-screen flows (D-186).
 */
export function finalizeStripEdges(
  edges: PostureAlgoGraph['edges'],
  packed: PostureAlgoGraphNode[],
): PostureAlgoGraph['edges'] {
  const contentIds = new Set(
    packed
      .filter(
        (n) =>
          n.data.nodeRole !== 'screen_group' &&
          n.data.nodeRole !== 'process_cluster' &&
          n.data.nodeRole !== 'lane_label',
      )
      .map((n) => n.id),
  );
  const screenByNode = new Map<string, MarketPostureStageScreenId>();
  for (const n of packed) {
    if (n.data.nodeRole === 'screen_group' && n.data.stageScreenId) {
      continue;
    }
    if (n.data.stageScreenId) {
      screenByNode.set(n.id, n.data.stageScreenId as MarketPostureStageScreenId);
    }
  }

  const kept = edges.filter(
    (e) => contentIds.has(e.source) && contentIds.has(e.target),
  );

  const pairCounts = new Map<
    string,
    { from: MarketPostureStageScreenId; to: MarketPostureStageScreenId; n: number; track: MarketHubModelTrack }
  >();
  for (const e of kept) {
    const from = screenByNode.get(e.source);
    const to = screenByNode.get(e.target);
    if (!from || !to || from === to) continue;
    const key = `${from}->${to}`;
    const prev = pairCounts.get(key);
    if (prev) prev.n += 1;
    else
      pairCounts.set(key, {
        from,
        to,
        n: 1,
        track: e.data.track,
      });
  }

  const backbone: PostureAlgoGraph['edges'] = [];
  for (const { from, to, n, track } of pairCounts.values()) {
    backbone.push({
      id: `e-group:${from}->${to}`,
      source: `group:${from}`,
      target: `group:${to}`,
      label: `${n} flows`,
      data: {
        edgeType: 'emit',
        activation: 'armed',
        status: 'ready',
        track,
        label: `${n} flows`,
      },
    });
  }

  return [...kept, ...backbone];
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
