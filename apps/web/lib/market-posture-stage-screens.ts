/**
 * Market Posture stage screens (D-186).
 * Pipeline-column screens above the fixed Model diagram strip.
 *
 * Order: capital → live → library → process → outlook → day
 * Live precedes library so API hydrate feeds corpus/constants.
 */

import type { MarketHubSynthesisStageId } from '@hftr/contracts';
import {
  classifyLiveApiSource,
  isQueryProcessRoute,
} from './market-hub-live-source-class';

export const MarketPostureStageScreenId = [
  'capital',
  'live',
  'library',
  'process',
  'outlook',
  'day',
] as const;
export type MarketPostureStageScreenId = (typeof MarketPostureStageScreenId)[number];

export type MarketPostureStageScreenMeta = {
  id: MarketPostureStageScreenId;
  label: string;
  summary: string;
  /** Diagram node-id prefixes that navigate here. */
  nodeIdPrefixes: readonly string[];
  /** Exact node roles that default here when prefix alone is ambiguous. */
  nodeRoles?: readonly string[];
  /** Synthesis stage ids owned by this screen. */
  stageIds: readonly MarketHubSynthesisStageId[];
  /** Panel surface ids that emit into this screen. */
  panelSurfaceIds: readonly string[];
};

export const MARKET_POSTURE_STAGE_SCREENS: readonly MarketPostureStageScreenMeta[] = [
  {
    id: 'capital',
    label: 'Capital',
    summary: 'Root user funds, engine allocations, equity & position values',
    nodeIdPrefixes: ['capital:'],
    nodeRoles: ['capital_source'],
    stageIds: [],
    panelSurfaceIds: ['capital', 'equity'],
  },
  {
    id: 'live',
    label: 'Live ingest',
    summary:
      'Market/news stream APIs → adapters → analysis → library seed (not search queries)',
    nodeIdPrefixes: ['live:', 'adapter:', 'analyze:'],
    nodeRoles: ['live_source', 'adapter', 'analysis'],
    stageIds: [],
    panelSurfaceIds: [],
  },
  {
    id: 'library',
    label: 'Library',
    summary: 'Scored seed + research ENGINEs → articles → shelf constants',
    nodeIdPrefixes: [
      'lib:',
      'lib-adapter:',
      'process:library:',
      'engine:research:',
      'process:engine:',
      'articles:engine:',
    ],
    nodeRoles: ['library_source', 'research_engine', 'research_articles'],
    stageIds: [],
    panelSurfaceIds: [],
  },
  {
    id: 'process',
    label: 'Process',
    summary:
      'Link streams + library; query/search APIs (Brave, EDGAR) as research extensions → trends',
    nodeIdPrefixes: ['process:shared:', 'cluster:'],
    nodeRoles: ['process_cluster', 'query_source'],
    stageIds: [
      'providers',
      'gather',
      'thresholds',
      'defaults',
      'universe',
      'rs',
      'rank',
      'verify',
    ],
    panelSurfaceIds: [
      'awareness_evidence',
      'awareness_links',
      'awareness_trends',
      'awareness_recommendations',
    ],
  },
  {
    id: 'outlook',
    label: 'Outlook',
    summary: 'Watched symbols, open positions, and recommendation-linked growth outlook',
    nodeIdPrefixes: [],
    nodeRoles: ['stage'],
    stageIds: ['seal_movers', 'sector', 'daily', 'narrative'],
    panelSurfaceIds: ['movers', 'news', 'reports', 'watchlists', 'positions'],
  },
  {
    id: 'day',
    label: 'Day plan',
    summary: 'Actionable day plan, research topics, and daily trends',
    nodeIdPrefixes: ['panel:'],
    nodeRoles: ['panel_surface'],
    stageIds: ['hub_ready'],
    panelSurfaceIds: ['charts'],
  },
] as const;

const SCREEN_BY_ID = new Map(MARKET_POSTURE_STAGE_SCREENS.map((s) => [s.id, s]));

export function getStageScreenMeta(
  id: MarketPostureStageScreenId,
): MarketPostureStageScreenMeta {
  return SCREEN_BY_ID.get(id)!;
}

/**
 * Resolve which horizontal screen a diagram node / stage / panel surface owns.
 */
export function resolveStageScreenId(input: {
  nodeId?: string | null;
  nodeRole?: string | null;
  stageId?: string | null;
  panelSurfaceId?: string | null;
}): MarketPostureStageScreenId {
  const panelId = input.panelSurfaceId?.trim();
  if (panelId) {
    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      if (screen.panelSurfaceIds.includes(panelId)) return screen.id;
    }
  }

  const stageId = input.stageId?.trim();
  if (stageId) {
    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      if ((screen.stageIds as readonly string[]).includes(stageId)) return screen.id;
    }
  }

  const nodeId = input.nodeId?.trim() ?? '';
  // Pre-library analysis module (organize → route → score) — stream ingest only.
  if (nodeId.startsWith('analyze:') || nodeId.startsWith('cluster:analysis:')) {
    const analyzeClass = classifyLiveApiSource({ nodeId });
    return analyzeClass === 'query' ? 'process' : 'live';
  }
  // Kind-specific adapter / process chains: query APIs → Process research lane.
  if (nodeId.startsWith('process:library:')) return 'library';
  if (nodeId.startsWith('process:engine:')) return 'library';
  if (nodeId.startsWith('engine:research:') || nodeId.startsWith('articles:engine:')) {
    return 'library';
  }
  if (nodeId.startsWith('process:shared:')) return 'process';
  if (nodeId.startsWith('live:') || nodeId.startsWith('adapter:')) {
    return classifyLiveApiSource({ nodeId }) === 'query' ? 'process' : 'live';
  }
  if (nodeId.startsWith('process:') && !nodeId.startsWith('process:shared:')) {
    return classifyLiveApiSource({ nodeId }) === 'query' ? 'process' : 'live';
  }
  if (nodeId.startsWith('cluster:process:')) {
    const route = nodeId.slice('cluster:process:'.length);
    if (route.startsWith('engine_') || route.startsWith('shelf_')) return 'library';
    if (isQueryProcessRoute(route)) return 'process';
    if (
      route.startsWith('shared') ||
      route.includes('providers_entitle') ||
      route.includes('universe') ||
      route.includes('compound') ||
      route.includes('verify') ||
      route.includes('thresholds') ||
      route.includes('defaults') ||
      route.includes('narrative') ||
      route.includes('sector_bulletin') ||
      route.includes('daily_phase')
    ) {
      return 'process';
    }
    return 'live';
  }
  if (nodeId.startsWith('cluster:')) {
    return 'process';
  }
  if (nodeId.startsWith('panel:')) {
    const surface = nodeId.slice('panel:'.length);
    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      if (screen.panelSurfaceIds.includes(surface)) return screen.id;
    }
    return 'day';
  }

  for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
    for (const prefix of screen.nodeIdPrefixes) {
      if (prefix && nodeId.startsWith(prefix)) return screen.id;
    }
  }

  // Bare stage node ids are the stageId itself.
  if (nodeId && !nodeId.includes(':')) {
    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      if ((screen.stageIds as readonly string[]).includes(nodeId)) return screen.id;
    }
  }

  const role = input.nodeRole?.trim();
  if (role === 'query_source') return 'process';
  if (role === 'analysis') return 'live';
  if (role === 'process') {
    // Fallback when id missing — prefer Live for adapter analysis chrome.
    return 'live';
  }
  if (role) {
    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      if (screen.nodeRoles?.includes(role)) return screen.id;
    }
  }

  // Legacy ids from earlier D-186 drafts.
  if (nodeId.startsWith('lib-adapter:') || nodeId.startsWith('adapter:library')) {
    return 'library';
  }
  if (nodeId.startsWith('group:adapt') || role === 'adapter') return 'live';
  if (nodeId.startsWith('group:compose')) return 'day';
  if (nodeId.startsWith('group:seals') || nodeId.startsWith('group:seal')) return 'outlook';

  return 'process';
}

export const DEFAULT_STAGE_SCREEN_ID: MarketPostureStageScreenId = 'capital';
