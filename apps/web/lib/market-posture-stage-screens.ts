/**
 * Market Posture stage screens (D-186).
 * Pipeline-column screens above the fixed Model diagram strip.
 */

import type { MarketHubSynthesisStageId } from '@hftr/contracts';

export const MarketPostureStageScreenId = [
  'capital',
  'library',
  'live',
  'adapt',
  'process',
  'seals',
  'compose',
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
    id: 'library',
    label: 'Library',
    summary: 'Saved library data, open positions, book profile',
    nodeIdPrefixes: ['lib:'],
    nodeRoles: ['library_source'],
    stageIds: [],
    panelSurfaceIds: ['positions'],
  },
  {
    id: 'live',
    label: 'Live APIs',
    summary: 'Entitled live data sources and feed honesty',
    nodeIdPrefixes: ['live:'],
    nodeRoles: ['live_source'],
    stageIds: ['providers'],
    panelSurfaceIds: [],
  },
  {
    id: 'adapt',
    label: 'Adapters',
    summary: 'Normalize / adapt live and library feeds',
    nodeIdPrefixes: ['adapter:'],
    nodeRoles: ['adapter'],
    stageIds: [],
    panelSurfaceIds: [],
  },
  {
    id: 'process',
    label: 'Process',
    summary: 'Link, score, rank, verify — awareness levels',
    nodeIdPrefixes: ['process:'],
    nodeRoles: ['process'],
    stageIds: ['gather', 'thresholds', 'defaults', 'universe', 'rs', 'rank', 'verify'],
    panelSurfaceIds: [
      'awareness_evidence',
      'awareness_links',
      'awareness_trends',
      'awareness_recommendations',
      'watchlists',
    ],
  },
  {
    id: 'seals',
    label: 'Seals',
    summary: 'Stock/news seals and phase daily reports',
    nodeIdPrefixes: [],
    nodeRoles: ['stage'],
    stageIds: ['seal_movers', 'sector', 'daily', 'narrative'],
    panelSurfaceIds: ['movers', 'news', 'reports'],
  },
  {
    id: 'compose',
    label: 'Compose',
    summary: 'Hub projection, charts, recommendations',
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
    return 'compose';
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

  return 'process';
}

export const DEFAULT_STAGE_SCREEN_ID: MarketPostureStageScreenId = 'capital';
