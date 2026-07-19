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
  | 'process_cluster'
  /** Pre-library analysis module (organize → route → score) on Live (D-186). */
  | 'analysis';

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
  {
    id: 'bridge-narr-hub',
    route: 'narrative_compose',
    source: 'narrative',
    target: 'hub_ready',
    edgeType: 'pipeline',
    track: 'compose',
    baseY: LANE_Y.compose,
  },
];

/** Canonical process-route order for strip clustering (left→right / top→bottom). */
export const ROUTE_PIPELINE_ORDER: readonly string[] = [
  'bars_entitle',
  'providers_entitle',
  'news_headline',
  'web_search',
  'filings',
  'macro_context',
  'fx_context',
  'crypto_context',
  'bars_ohlc',
  'library_jaccard',
  'thresholds_llm',
  'defaults_catalog',
  'universe_build',
  'compound_rank',
  'verify_promote',
  'sector_bulletin',
  'daily_phase',
  'narrative_compose',
] as const;

const SCREEN_FLOW_ORDER: readonly MarketPostureStageScreenId[] = [
  'capital',
  'live',
  'library',
  'process',
  'outlook',
  'day',
];

function screenFlowIndex(id: MarketPostureStageScreenId): number {
  const i = SCREEN_FLOW_ORDER.indexOf(id);
  return i >= 0 ? i : 99;
}
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

    const routeIdx = Math.max(0, ROUTE_PIPELINE_ORDER.indexOf(bridge.route));
    const x0 = processCol0 + (routeIdx % 4) * Math.floor(processColW * 0.5);
    const span = Math.max(90, processColW * 0.85);

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
        label: src.contributed ? 'on board' : 'entitle',
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
      const adapterId = `lib-adapter:${flow.id}`;
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

  // Live → analysis module (organize → route → score) → library seed (D-186).
  // Raw provider packages must be organized/routed/scored before corpus constants.
  const liveNodeIdsForSeed = liveSources
    .filter((s) => s.contributed || s.status === 'ready' || s.status === 'public')
    .map((s) => s.kind);
  const ANALYSIS_STEPS: Array<{
    suffix: 'organize' | 'route' | 'score';
    label: string;
    operation: string;
    processFunction: 'organize' | 'route' | 'score';
  }> = [
    {
      suffix: 'organize',
      label: 'Organize packages',
      operation: 'bag by domain / lane',
      processFunction: 'organize',
    },
    {
      suffix: 'route',
      label: 'Route pipelines',
      operation: 'movers / sector / bars',
      processFunction: 'route',
    },
    {
      suffix: 'score',
      label: 'Score for corpus',
      operation: 'fit → library seed',
      processFunction: 'score',
    },
  ];

  for (const kind of liveNodeIdsForSeed) {
    const liveId = `live:${kind}`;
    if (!nodes.some((n) => n.id === liveId)) continue;
    const kindAdapters = nodes.filter(
      (n) => n.id.startsWith(`adapter:${kind}`) && n.data.nodeRole === 'adapter',
    );
    const kindProcess = nodes.filter(
      (n) =>
        n.id.startsWith(`process:${kind}:`) && n.data.nodeRole === 'process',
    );
    const feedFrom =
      kindProcess[kindProcess.length - 1]?.id ??
      kindAdapters[kindAdapters.length - 1]?.id ??
      liveId;
    const ready =
      liveSources.find((s) => s.kind === kind)?.contributed ||
      liveSources.find((s) => s.kind === kind)?.status === 'ready' ||
      liveSources.find((s) => s.kind === kind)?.status === 'public';
    const y = nextLaneY('compound', LANE_Y.compound + 80);

    let prevId = feedFrom;
    for (let si = 0; si < ANALYSIS_STEPS.length; si++) {
      const step = ANALYSIS_STEPS[si]!;
      const nodeId = `analyze:${kind}:${step.suffix}`;
      if (!nodes.some((n) => n.id === nodeId)) {
        nodes.push({
          id: nodeId,
          type: 'postureAlgo',
          position: { x: processCol0 + si * 100, y },
          data: {
            label: step.label,
            detail: `${kind} · ${step.operation}`,
            kind: 'deterministic',
            nodeRole: 'analysis',
            operation: step.operation,
            amount: ready ? 'armed' : 'idle',
            analysisRoles: [step.suffix, kind],
            processRoute: `analysis_${kind}`,
            processStepId: `${kind}:${step.suffix}`,
            processFunction: step.processFunction,
            layer: 'pipeline',
            track: 'compound',
            activation: ready ? 'armed' : 'idle',
            status: ready ? 'ready' : 'idle',
            updatedAt: asOfIso,
            stageScreenId: 'live',
          },
        });
      }
      const edgeId = `e-${prevId}-${nodeId}`;
      if (!edges.some((e) => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: prevId,
          target: nodeId,
          label: step.suffix,
          data: {
            edgeType: 'pipeline',
            track: 'compound',
            ...resolveModelEdgeState({
              edgeType: 'pipeline',
              sourceReady: Boolean(ready),
              pulsed: pulsed?.has(edgeId) ?? false,
            }),
          },
        });
      }
      prevId = nodeId;
    }

    const scoreId = `analyze:${kind}:score`;
    for (const lib of librarySources) {
      if (lib.admittedCount <= 0) continue;
      const libId = `lib:${lib.id}`;
      if (!nodes.some((n) => n.id === libId)) continue;
      const edgeId = `e-seed-${scoreId}-${libId}`;
      if (edges.some((e) => e.id === edgeId)) continue;
      edges.push({
        id: edgeId,
        source: scoreId,
        target: libId,
        label: 'seed',
        data: {
          edgeType: 'corpus',
          track: 'compound',
          ...resolveModelEdgeState({
            edgeType: 'corpus',
            sourceReady: Boolean(ready),
            pulsed: pulsed?.has(edgeId) ?? false,
          }),
        },
      });
    }
  }

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
    const panelScreen = resolveStageScreenId({
      panelSurfaceId: surf.id,
      nodeId: nodeId,
      nodeRole: 'panel_surface',
    });
    const fromScreen = resolveStageScreenId({
      nodeId: fromStage,
      stageId: fromStage,
      nodeRole: 'stage',
    });
    // Only wire stage→panel when it flows forward (or same screen). Capital
    // panels already hydrate from capital_source nodes — skip day→capital.
    const forwardPanel =
      screenFlowIndex(fromScreen) <= screenFlowIndex(panelScreen) &&
      !(panelScreen === 'capital' && fromScreen === 'day');
    if (forwardPanel) {
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
    }

    // Mid-pipeline metric emissions (dashed) — stages named in emitFromStages.
    const emitStages = surf.emitFromStages ?? [];
    for (const stageId of emitStages) {
      if (!activeStageLayout.some((s) => s.id === stageId)) continue;
      if (stageId === fromStage) continue;
      const emitFromScreen = resolveStageScreenId({
        nodeId: stageId,
        stageId,
        nodeRole: 'stage',
      });
      if (screenFlowIndex(emitFromScreen) > screenFlowIndex(panelScreen)) continue;
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
  analysis: 2,
  process: 2,
  stage: 3,
  panel_surface: 4,
  lane_label: 9,
};

/** Pipeline order inside a process-route cluster (fetch → … → board/compose). */
const PROCESS_FN_ORDER: Record<string, number> = {
  fetch: 0,
  entitle: 0,
  load: 0,
  announce: 1,
  normalize: 2,
  extract: 3,
  organize: 3,
  context: 4,
  route: 4,
  corroborate: 5,
  score: 6,
  analyze: 6,
  thresholds: 6,
  defaults: 6,
  rank: 7,
  verify: 8,
  seal: 9,
  compose: 10,
};

const STRIP_CLUSTER_GAP = 10;
const STRIP_CLUSTER_HEADER = 22;

/**
 * Shared phase columns inside every route row (source → adapter → pipeline fns).
 * Empty cells stay so columns align across sequential routes.
 */
const STRIP_PHASE_COLUMNS = [
  'source',
  'adapter',
  'entitle',
  'fetch',
  'normalize',
  'extract',
  'organize',
  'context',
  'route',
  'corroborate',
  'score',
  'analyze',
  'thresholds',
  'defaults',
  'rank',
  'verify',
  'seal',
  'compose',
  'other',
] as const;

function phaseColumnForStep(n: PostureAlgoGraphNode): number {
  switch (n.data.nodeRole) {
    case 'live_source':
    case 'library_source':
    case 'capital_source':
      return STRIP_PHASE_COLUMNS.indexOf('source');
    case 'adapter':
      return STRIP_PHASE_COLUMNS.indexOf('adapter');
    default: {
      const fn = (n.data.processFunction ?? '').toLowerCase();
      if (fn) {
        const idx = STRIP_PHASE_COLUMNS.indexOf(
          fn as (typeof STRIP_PHASE_COLUMNS)[number],
        );
        if (idx >= 0) return idx;
      }
      return STRIP_PHASE_COLUMNS.indexOf('other');
    }
  }
}

/** Map live/analysis kind tokens onto canonical ROUTE_PIPELINE_ORDER ids. */
function kindToPipelineRoute(kind: string): string | null {
  const k = kind.toLowerCase().replace(/-/g, '_');
  if (
    k.includes('news') ||
    k.includes('gdelt') ||
    k.includes('headline') ||
    k.includes('alpha_vantage')
  ) {
    return 'news_headline';
  }
  if (k.includes('web') || k.includes('search') || k.includes('tavily')) {
    return 'web_search';
  }
  if (k.includes('filing') || k.includes('sec')) return 'filings';
  if (k.includes('macro')) return 'macro_context';
  if (k.includes('fx') || k.includes('forex')) return 'fx_context';
  if (k.includes('crypto')) return 'crypto_context';
  if (
    k.includes('bar') ||
    k.includes('ohlc') ||
    k.includes('alpaca') ||
    k.includes('twelve') ||
    k.includes('quote')
  ) {
    return 'bars_ohlc';
  }
  if (k.includes('provider')) return 'providers_entitle';
  if (k.includes('library') || k.includes('jaccard') || k.includes('shelf')) {
    return 'library_jaccard';
  }
  if (k.includes('threshold')) return 'thresholds_llm';
  if (k.includes('default')) return 'defaults_catalog';
  if (k.includes('universe')) return 'universe_build';
  if (k.includes('compound') || k.includes('rank')) return 'compound_rank';
  if (k.includes('verify') || k.includes('promote')) return 'verify_promote';
  if (k.includes('sector')) return 'sector_bulletin';
  if (k.includes('daily')) return 'daily_phase';
  if (k.includes('narrat')) return 'narrative_compose';
  const direct = ROUTE_PIPELINE_ORDER.find((r) => r === k || k.includes(r));
  return direct ?? null;
}

/**
 * Pipeline major + subtype so routes read sequentially:
 * entitle → news → … → bars → library → ranks → compose.
 * Same major: ingest → analysis → named process → shelf.
 */
function routeClusterSortIndex(route: string): number {
  let major = 50;
  let subtype = 2;
  if (route.startsWith('analysis_')) {
    const mapped = kindToPipelineRoute(route.slice('analysis_'.length));
    major = mapped
      ? ROUTE_PIPELINE_ORDER.indexOf(mapped)
      : ROUTE_PIPELINE_ORDER.indexOf('bars_ohlc');
    subtype = 1;
  } else if (route.startsWith('ingest_')) {
    const mapped = kindToPipelineRoute(route.slice('ingest_'.length));
    major = mapped
      ? ROUTE_PIPELINE_ORDER.indexOf(mapped)
      : ROUTE_PIPELINE_ORDER.indexOf('bars_ohlc');
    subtype = 0;
  } else if (route.startsWith('shelf_')) {
    major = ROUTE_PIPELINE_ORDER.indexOf('library_jaccard');
    subtype = 3;
  } else {
    const direct = ROUTE_PIPELINE_ORDER.indexOf(route);
    major = direct >= 0 ? direct : 50;
    subtype = 2;
  }
  if (major < 0) major = 50;
  return major + subtype * 0.1;
}

function processClusterKey(n: PostureAlgoGraphNode): string {
  if (n.data.nodeRole === 'analysis') {
    const kind = n.id.replace(/^analyze:/, '').split(':')[0];
    return kind ? `analysis_${kind}` : 'analysis';
  }
  // Per-shelf library chains (process:library:{uuid}:…).
  const libMatch = n.id.match(/^process:library:([^:]+)/);
  if (libMatch?.[1]) return `shelf_${libMatch[1]}`;
  const route = n.data.processRoute?.trim();
  if (route === 'library_jaccard') {
    const fromId = n.id.match(/^process:library:([^:]+)/);
    if (fromId?.[1]) return `shelf_${fromId[1]}`;
  }
  if (route) return route;
  const kind = n.id.replace(/^process:/, '').split(':')[0];
  return kind || 'shared';
}

function formatRouteLabel(route: string): string {
  if (route.startsWith('analysis_')) {
    return `Analyze · ${route.slice('analysis_'.length).replace(/_/g, ' ')}`;
  }
  if (route.startsWith('shelf_')) {
    return 'Shelf chain';
  }
  if (route.startsWith('ingest_')) {
    return `Ingest · ${route.slice('ingest_'.length).replace(/_/g, ' ')}`;
  }
  return route.replace(/_/g, ' ');
}

function sortProcessStepsInCluster(a: PostureAlgoGraphNode, b: PostureAlgoGraphNode): number {
  const pa = phaseColumnForStep(a);
  const pb = phaseColumnForStep(b);
  if (pa !== pb) return pa - pb;
  // Prefer source → adapter → analysis/process function order inside a phase.
  const roleRank = (n: PostureAlgoGraphNode): number => {
    switch (n.data.nodeRole) {
      case 'live_source':
      case 'library_source':
      case 'capital_source':
        return 0;
      case 'adapter':
        return 1;
      case 'analysis':
        return 2;
      case 'process':
        return 3;
      default:
        return 4;
    }
  };
  const ra = roleRank(a);
  const rb = roleRank(b);
  if (ra !== rb) return ra - rb;
  const fa = PROCESS_FN_ORDER[a.data.processFunction ?? ''] ?? 50;
  const fb = PROCESS_FN_ORDER[b.data.processFunction ?? ''] ?? 50;
  if (fa !== fb) return fa - fb;
  return a.data.label.localeCompare(b.data.label);
}

/**
 * Pull live/library peers into a route cluster so ingest→analyze or shelf→adapter
 * chains read as one visual group.
 */
function pullClusterPeers(opts: {
  route: string;
  steps: PostureAlgoGraphNode[];
  otherNodes: PostureAlgoGraphNode[];
  screenId: MarketPostureStageScreenId;
}): { steps: PostureAlgoGraphNode[]; remaining: PostureAlgoGraphNode[] } {
  const { route, steps, otherNodes, screenId } = opts;
  if (screenId === 'live') {
    let kind: string | null = null;
    if (route.startsWith('analysis_')) kind = route.slice('analysis_'.length);
    else {
      const fromStep = steps.find((s) => s.id.startsWith('process:') || s.id.startsWith('analyze:'));
      if (fromStep?.id.startsWith('analyze:')) {
        kind = fromStep.id.split(':')[1] ?? null;
      } else if (fromStep?.id.startsWith('process:')) {
        const seg = fromStep.id.split(':')[1] ?? null;
        if (seg && seg !== 'shared') kind = seg;
      }
    }
    if (!kind) return { steps, remaining: otherNodes };
    const peers: PostureAlgoGraphNode[] = [];
    const remaining: PostureAlgoGraphNode[] = [];
    for (const n of otherNodes) {
      if (n.id === `live:${kind}` || n.id.startsWith(`adapter:${kind}`)) {
        peers.push(n);
      } else {
        remaining.push(n);
      }
    }
    return { steps: [...peers, ...steps], remaining };
  }
  if (screenId === 'library') {
    const shelfId = route.startsWith('shelf_')
      ? route.slice('shelf_'.length)
      : (steps[0]?.id.match(/^process:library:([^:]+)/)?.[1] ?? null);
    if (!shelfId) return { steps, remaining: otherNodes };
    const peers: PostureAlgoGraphNode[] = [];
    const remaining: PostureAlgoGraphNode[] = [];
    for (const n of otherNodes) {
      const isShelf =
        n.id === `lib:${shelfId}` ||
        n.id.includes(`library:${shelfId}`) ||
        (n.id.startsWith('lib-adapter:') && n.id.includes(shelfId));
      if (isShelf) peers.push(n);
      else remaining.push(n);
    }
    return { steps: [...peers, ...steps], remaining };
  }
  return { steps, remaining: otherNodes };
}

/** Stage track → lane for Process side-column (entitle/compound/sector/daily/compose). */
function stageTrackLane(n: PostureAlgoGraphNode): number {
  const track = n.data.track;
  switch (track) {
    case 'entitle':
      return 0;
    case 'compound':
      return 1;
    case 'sector':
      return 2;
    case 'daily':
      return 3;
    case 'compose':
      return 4;
    default:
      return Math.min(
        STRIP_INNER_LANES - 1,
        Math.max(0, STRIP_ROLE_ORDER[n.data.nodeRole] ?? 2),
      );
  }
}

function capitalTierLane(n: PostureAlgoGraphNode): number {
  const detail = `${n.data.detail} ${n.id}`.toLowerCase();
  if (detail.includes('execution_split') || detail.includes('trading_desk')) return 1;
  if (detail.includes('company_root') || detail.includes('pool') || detail.includes('holding')) {
    return 0;
  }
  return 0;
}

function outlookStageLane(n: PostureAlgoGraphNode): number {
  const order =
    MARKET_POSTURE_STAGE_SCREENS.find((s) => s.id === 'outlook')?.stageIds ?? [];
  const sid = n.data.stageId ?? (order.includes(n.id as (typeof order)[number]) ? n.id : null);
  if (!sid) return 3;
  const idx = order.indexOf(sid as (typeof order)[number]);
  if (idx < 0) return 3;
  return Math.min(STRIP_INNER_LANES - 1, idx);
}

function dayPanelLane(n: PostureAlgoGraphNode): number {
  if (n.data.nodeRole === 'stage') return 0;
  const id = n.data.panelSurfaceId ?? n.id.replace(/^panel:/, '');
  if (id.startsWith('awareness_')) return 1;
  if (id === 'charts' || id === 'reports') return 2;
  if (id === 'capital' || id === 'equity' || id === 'positions') return 3;
  return 4;
}

/**
 * Pack a screen that nests route/analysis clusters (Live adapter chains + Process shared).
 */
function packProcessScreenColumn(opts: {
  children: PostureAlgoGraphNode[];
  edges: Array<{ source: string; target: string }>;
  colIdx: number;
  globalRank: Map<string, number>;
  intraEdges: number;
  interEdges: number;
  screenSummary: string;
  screenId?: MarketPostureStageScreenId;
  screenLabel?: string;
}): PostureAlgoGraphNode[] {
  const {
    children,
    edges,
    colIdx,
    globalRank,
    intraEdges,
    interEdges,
    screenSummary,
    screenId = 'process',
    screenLabel = 'Process',
  } = opts;
  const processNodes = children.filter(
    (n) => n.data.nodeRole === 'process' || n.data.nodeRole === 'analysis',
  );
  const otherNodes = children.filter(
    (n) => n.data.nodeRole !== 'process' && n.data.nodeRole !== 'analysis',
  );

  const byRoute = new Map<string, PostureAlgoGraphNode[]>();
  for (const n of processNodes) {
    const key = processClusterKey(n);
    const list = byRoute.get(key) ?? [];
    list.push(n);
    byRoute.set(key, list);
  }

  const routeKeys = [...byRoute.keys()].sort((a, b) => {
    const oa = routeClusterSortIndex(a);
    const ob = routeClusterSortIndex(b);
    if (oa !== ob) return oa - ob;
    const membersA = byRoute.get(a) ?? [];
    const membersB = byRoute.get(b) ?? [];
    const rankA = median(membersA.map((n) => globalRank.get(n.id) ?? 0));
    const rankB = median(membersB.map((n) => globalRank.get(n.id) ?? 0));
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });

  const groupId = `group:${screenId}`;
  const out: PostureAlgoGraphNode[] = [];
  let remainingOther = [...otherNodes];

  type RouteCluster = { route: string; steps: PostureAlgoGraphNode[] };
  const pendingClusters: RouteCluster[] = [];

  const enqueueCluster = (route: string, steps: PostureAlgoGraphNode[]): void => {
    if (steps.length === 0) return;
    pendingClusters.push({
      route,
      steps: [...steps].sort(sortProcessStepsInCluster),
    });
  };

  for (const route of routeKeys) {
    const base = [...(byRoute.get(route) ?? [])].sort(sortProcessStepsInCluster);
    const pulled = pullClusterPeers({
      route,
      steps: base,
      otherNodes: remainingOther,
      screenId,
    });
    remainingOther = pulled.remaining;
    enqueueCluster(route, pulled.steps);
  }

  // Orphan live ingest bundles (source + adapter without process/analysis).
  if (screenId === 'live') {
    const byKind = new Map<string, PostureAlgoGraphNode[]>();
    const leftover: PostureAlgoGraphNode[] = [];
    for (const n of remainingOther) {
      let kind: string | null = null;
      if (n.id.startsWith('live:')) kind = n.id.slice('live:'.length);
      else if (n.id.startsWith('adapter:')) {
        kind = n.id.slice('adapter:'.length).split(':')[0] ?? null;
      }
      if (!kind) {
        leftover.push(n);
        continue;
      }
      const list = byKind.get(kind) ?? [];
      list.push(n);
      byKind.set(kind, list);
    }
    remainingOther = leftover;
    const kindKeys = [...byKind.keys()].sort(
      (a, b) =>
        routeClusterSortIndex(`ingest_${a}`) - routeClusterSortIndex(`ingest_${b}`) ||
        a.localeCompare(b),
    );
    for (const kind of kindKeys) {
      const members = (byKind.get(kind) ?? []).sort(sortProcessStepsInCluster);
      if (members.length === 0) continue;
      const hasSource = members.some((m) => m.data.nodeRole === 'live_source');
      const hasAdapter = members.some((m) => m.data.nodeRole === 'adapter');
      // Only bundle when source+adapter share a kind; lone sources stay in role lanes.
      if (hasSource && hasAdapter) enqueueCluster(`ingest_${kind}`, members);
      else remainingOther.push(...members);
    }
  }

  // Orphan library shelf bundles (shelf ± adapter without process steps).
  if (screenId === 'library') {
    const byShelf = new Map<string, PostureAlgoGraphNode[]>();
    const leftover: PostureAlgoGraphNode[] = [];
    for (const n of remainingOther) {
      let shelf: string | null = null;
      if (n.id.startsWith('lib:') && !n.id.startsWith('lib-adapter:')) {
        shelf = n.id.slice('lib:'.length);
      } else if (n.id.startsWith('lib-adapter:')) {
        const m =
          n.id.match(/library:([^:]+)/) ??
          n.id.match(/^lib-adapter:(.+)$/);
        shelf = m?.[1] ?? null;
      }
      if (!shelf) {
        leftover.push(n);
        continue;
      }
      const list = byShelf.get(shelf) ?? [];
      list.push(n);
      byShelf.set(shelf, list);
    }
    remainingOther = leftover;
    const shelfKeys = [...byShelf.keys()].sort((a, b) => a.localeCompare(b));
    for (const shelf of shelfKeys) {
      const members = (byShelf.get(shelf) ?? []).sort(sortProcessStepsInCluster);
      if (members.length === 0) continue;
      enqueueCluster(`shelf_${shelf}`, members);
    }
  }

  // Sequential pipeline order across all clusters (ingest → analyze → process).
  pendingClusters.sort(
    (a, b) =>
      routeClusterSortIndex(a.route) - routeClusterSortIndex(b.route) ||
      a.route.localeCompare(b.route),
  );

  // Shared phase span so every route row uses the same columns.
  let minPhase = STRIP_PHASE_COLUMNS.length;
  let maxPhase = 0;
  for (const c of pendingClusters) {
    for (const s of c.steps) {
      const p = phaseColumnForStep(s);
      minPhase = Math.min(minPhase, p);
      maxPhase = Math.max(maxPhase, p);
    }
  }
  if (pendingClusters.length === 0) {
    minPhase = 0;
    maxPhase = 0;
  } else {
    // Keep source/adapter columns even when a route starts mid-chain.
    minPhase = Math.min(minPhase, STRIP_PHASE_COLUMNS.indexOf('source'));
  }
  const phaseStart = minPhase;
  const phaseEnd = maxPhase;
  const phaseCount = Math.max(1, phaseEnd - phaseStart + 1);
  const clusterInnerW = phaseCount * STRIP_INNER_LANE_W;
  const clusterW = STRIP_PAD * 2 + clusterInnerW;

  let cursorY = STRIP_HEADER + STRIP_PAD;
  pendingClusters.forEach((cluster, routeIdx) => {
    const { route, steps } = cluster;
    const clusterId = `cluster:process:${route}`;
    const byPhase = new Map<number, PostureAlgoGraphNode[]>();
    for (const step of steps) {
      const p = phaseColumnForStep(step);
      const list = byPhase.get(p) ?? [];
      list.push(step);
      byPhase.set(p, list);
    }
    const maxStack = Math.max(
      1,
      ...[...byPhase.values()].map((list) => list.length),
    );
    const clusterH =
      STRIP_CLUSTER_HEADER + STRIP_PAD * 2 + maxStack * STRIP_NODE_H;

    const fnSummary = [
      ...new Set(
        steps
          .map((s) => s.data.processFunction)
          .filter((fn): fn is string => Boolean(fn)),
      ),
    ]
      .slice(0, 4)
      .join(' → ');
    const roleBits = [
      ...new Set(steps.map((s) => s.data.nodeRole).filter(Boolean)),
    ];
    const detail =
      fnSummary ||
      (roleBits.length > 1 ? roleBits.join(' → ') : 'process chain');

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
        detail,
        kind: 'data',
        nodeRole: 'process_cluster',
        stageScreenId: screenId,
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

    byPhase.forEach((phaseSteps, phaseIdx) => {
      const col = phaseIdx - phaseStart;
      phaseSteps.forEach((step, stackIdx) => {
        out.push({
          ...step,
          parentId: clusterId,
          extent: 'parent',
          position: {
            x: STRIP_PAD + col * STRIP_INNER_LANE_W,
            y: STRIP_CLUSTER_HEADER + STRIP_PAD + stackIdx * STRIP_NODE_H,
          },
          draggable: false,
          data: {
            ...step.data,
            stageScreenId: screenId,
          },
        });
        globalRank.set(step.id, routeIdx * 100 + phaseIdx * 10 + stackIdx);
      });
    });

    cursorY += clusterH + STRIP_CLUSTER_GAP;
  });

  // Side content sits BELOW route rows (same column grid), not beside them.
  const processStageOrder =
    MARKET_POSTURE_STAGE_SCREENS.find((s) => s.id === 'process')?.stageIds ?? [];
  const orderedOther = [...remainingOther].sort((a, b) => {
    const ia = a.data.stageId
      ? processStageOrder.indexOf(a.data.stageId)
      : a.id && processStageOrder.includes(a.id as (typeof processStageOrder)[number])
        ? processStageOrder.indexOf(a.id as (typeof processStageOrder)[number])
        : -1;
    const ib = b.data.stageId
      ? processStageOrder.indexOf(b.data.stageId)
      : b.id && processStageOrder.includes(b.id as (typeof processStageOrder)[number])
        ? processStageOrder.indexOf(b.id as (typeof processStageOrder)[number])
        : -1;
    const oa = ia >= 0 ? ia : 50;
    const ob = ib >= 0 ? ib : 50;
    if (oa !== ob) return oa - ob;
    return a.data.label.localeCompare(b.data.label);
  });
  const refinedOther = orderLaneByConnections(orderedOther, edges, globalRank);

  const otherColCount = Math.max(phaseCount, STRIP_INNER_LANES);
  const otherLanes: PostureAlgoGraphNode[][] = Array.from(
    { length: otherColCount },
    () => [],
  );
  for (const child of refinedOther) {
    const lane =
      screenId === 'process' && child.data.nodeRole === 'stage'
        ? Math.min(otherColCount - 1, stageTrackLane(child))
        : Math.min(
            otherColCount - 1,
            Math.max(0, STRIP_ROLE_ORDER[child.data.nodeRole] ?? 2),
          );
    otherLanes[lane]!.push(child);
  }
  const otherBlockY =
    pendingClusters.length > 0
      ? cursorY
      : STRIP_HEADER + STRIP_PAD;
  const maxOtherRows = Math.max(0, ...otherLanes.map((l) => l.length));
  otherLanes.forEach((lane, laneIdx) => {
    lane.forEach((child, rowIdx) => {
      out.push({
        ...child,
        parentId: groupId,
        extent: 'parent',
        position: {
          x: STRIP_PAD + laneIdx * STRIP_INNER_LANE_W,
          y: otherBlockY + rowIdx * STRIP_NODE_H,
        },
        draggable: false,
        data: {
          ...child.data,
          stageScreenId: screenId,
        },
      });
    });
  });

  const otherBlockH = maxOtherRows > 0 ? maxOtherRows * STRIP_NODE_H + STRIP_PAD : 0;
  const clustersH =
    pendingClusters.length > 0
      ? cursorY - STRIP_CLUSTER_GAP
      : STRIP_HEADER + STRIP_PAD;
  const height = Math.max(clustersH, otherBlockY) + otherBlockH + STRIP_PAD;
  const width = Math.max(
    STRIP_PAD * 2 + otherColCount * STRIP_INNER_LANE_W,
    clusterW + STRIP_PAD,
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
      label: screenLabel,
      detail: `${pendingClusters.length} routes · ${intraEdges} in · ${interEdges} out · ${screenSummary}`,
      kind: 'data',
      nodeRole: 'screen_group',
      stageScreenId: screenId,
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

    if (
      screen.id === 'process' ||
      screen.id === 'live' ||
      screen.id === 'library'
    ) {
      const needsClusters =
        screen.id === 'process' ||
        children.some(
          (n) =>
            n.data.nodeRole === 'process' ||
            n.data.nodeRole === 'analysis' ||
            n.data.nodeRole === 'adapter' ||
            n.data.nodeRole === 'library_source' ||
            n.data.nodeRole === 'live_source',
        );
      if (needsClusters) {
        const packed = packProcessScreenColumn({
          children,
          edges,
          colIdx,
          globalRank,
          intraEdges,
          interEdges,
          screenSummary: screen.summary,
          screenId: screen.id,
          screenLabel: screen.label,
        });
        const group = packed.find((n) => n.id === `group:${screen.id}`);
        if (group) {
          group.position = { x: cursorX, y: 0 };
          cursorX += (group.style?.width ?? STRIP_COL_W) + 12;
        } else {
          cursorX += STRIP_COL_W;
        }
        out.push(...packed);
        return;
      }
    }

    const lanes: PostureAlgoGraphNode[][] = Array.from(
      { length: STRIP_INNER_LANES },
      () => [],
    );

    // Outlook / capital / day: sequential columns (pipeline order), not sparse role lanes.
    if (
      screen.id === 'outlook' ||
      screen.id === 'capital' ||
      screen.id === 'day'
    ) {
      const sorted = [...children].sort((a, b) => {
        const la =
          screen.id === 'capital'
            ? capitalTierLane(a)
            : screen.id === 'outlook'
              ? outlookStageLane(a)
              : dayPanelLane(a);
        const lb =
          screen.id === 'capital'
            ? capitalTierLane(b)
            : screen.id === 'outlook'
              ? outlookStageLane(b)
              : dayPanelLane(b);
        if (la !== lb) return la - lb;
        return a.data.label.localeCompare(b.data.label);
      });
      // Keep semantic column order stable — do not barycenter-reorder across tiers.
      const refined = sorted;
      const cols =
        refined.length <= 8
          ? Math.max(refined.length, 1)
          : STRIP_INNER_LANES;
      const height =
        STRIP_HEADER +
        STRIP_PAD * 2 +
        Math.ceil(Math.max(refined.length, 1) / cols) * STRIP_NODE_H;
      const width = Math.max(
        STRIP_COL_W - 12,
        STRIP_PAD * 2 + cols * innerLaneW,
      );
      const groupId = `group:${screen.id}`;
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
      refined.forEach((child, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        globalRank.set(child.id, i);
        out.push({
          ...child,
          parentId: groupId,
          extent: 'parent',
          position: {
            x: STRIP_PAD + col * innerLaneW,
            y: STRIP_HEADER + STRIP_PAD + row * STRIP_NODE_H,
          },
          draggable: false,
          data: {
            ...child.data,
            stageScreenId: screen.id,
          },
        });
      });
      cursorX += width + 12;
      void colIdx;
      return;
    }

    for (const child of children) {
      let lane = Math.min(
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
    // Backbone only for forward L→R flow (capital→…→day).
    if (screenFlowIndex(from) >= screenFlowIndex(to)) continue;
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
