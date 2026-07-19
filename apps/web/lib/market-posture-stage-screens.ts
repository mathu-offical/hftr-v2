/**
 * Market Posture stage screens (D-186).
 * Pipeline-column screens above the fixed Model diagram strip.
 *
 * Order: capital → live → library → process → outlook → day
 * Live precedes library so API hydrate feeds corpus/constants.
 */

import type { MarketHubSynthesisStageId } from '@hftr/contracts';

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
    summary: 'Active APIs → queries/filters → normalize → system variables',
    nodeIdPrefixes: ['live:', 'adapter:'],
    nodeRoles: ['live_source', 'adapter'],
    stageIds: ['providers'],
    panelSurfaceIds: [],
  },
  {
    id: 'library',
    label: 'Library',
    summary: 'Sector/company constants → numerical ranges + positioning context',
    nodeIdPrefixes: ['lib:'],
    nodeRoles: ['library_source'],
    stageIds: [],
    panelSurfaceIds: ['positions'],
  },
  {
    id: 'process',
    label: 'Process',
    summary: 'Link market + news + library → tagged trend lists',
    nodeIdPrefixes: ['process:'],
    nodeRoles: ['process'],
    stageIds: ['gather', 'thresholds', 'defaults', 'universe', 'rs', 'rank', 'verify'],
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
    summary: 'Watched symbols, marks, and recommendation-linked growth outlook',
    nodeIdPrefixes: [],
    nodeRoles: ['stage'],
    stageIds: ['seal_movers', 'sector', 'daily', 'narrative'],
    panelSurfaceIds: ['movers', 'news', 'reports', 'watchlists'],
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
  if (role) {
    for (const screen of MARKET_POSTURE_STAGE_SCREENS) {
      if (screen.nodeRoles?.includes(role)) return screen.id;
    }
  }

  // Legacy ids from earlier D-186 drafts.
  if (nodeId.startsWith('group:adapt') || role === 'adapter') return 'live';
  if (nodeId.startsWith('group:compose')) return 'day';
  if (nodeId.startsWith('group:seals') || nodeId.startsWith('group:seal')) return 'outlook';

  return 'process';
}

export const DEFAULT_STAGE_SCREEN_ID: MarketPostureStageScreenId = 'capital';
