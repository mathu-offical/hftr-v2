/**
 * Availability helpers for Market Posture Model graph (D-163).
 * Diagram shows only providers that can actually feed synthesis tracks.
 */

import type {
  MarketHubModelLibrarySource,
  MarketHubModelLiveSource,
  MarketHubModelTrack,
} from '@hftr/contracts';

const SECTOR_SOURCE_KINDS = new Set([
  'gdelt_news',
  'market_news',
  'alpha_vantage_news',
  'alpaca_news',
  'finnhub_news',
  'polygon_news',
  'brave_search',
]);

const ENTITLE_SOURCE_KINDS = new Set(['alpaca_bars', 'twelve_data', 'marketstack']);

/** Live kinds that participate in the compound movers path. */
const COMPOUND_SOURCE_KINDS = new Set([
  ...SECTOR_SOURCE_KINDS,
  ...ENTITLE_SOURCE_KINDS,
  'sec_edgar',
  'fred_macro',
  'world_bank_indicator',
  'frankfurter_fx',
  'coingecko_crypto',
]);

/**
 * Provider is diagram-eligible only when actively provisioned (D-169):
 * ready/public credentials, or a prior seal contribution (not stub/researched).
 * Canvas-bound alone does not light the Model.
 */
export function isAvailableLiveSource(src: MarketHubModelLiveSource): boolean {
  if (src.status === 'ready' || src.status === 'public') return true;
  if (src.contributed && src.status !== 'stub' && src.status !== 'researched') return true;
  return false;
}

export function isAvailableLibrarySource(lib: MarketHubModelLibrarySource): boolean {
  return lib.admittedCount > 0;
}

export type ModelTrackCapabilities = {
  hasEntitle: boolean;
  hasCompound: boolean;
  hasSector: boolean;
  hasDaily: boolean;
  hasCompose: boolean;
};

export function resolveModelTrackCapabilities(opts: {
  liveSources: MarketHubModelLiveSource[];
  librarySources: MarketHubModelLibrarySource[];
  hasCapitalSources?: boolean;
  hasPanelSurfaces?: boolean;
}): ModelTrackCapabilities {
  const available = opts.liveSources.filter(isAvailableLiveSource);
  const kinds = new Set(available.map((s) => s.kind));
  const hasLibrary = opts.librarySources.some(isAvailableLibrarySource);
  const hasSector = [...kinds].some((k) => SECTOR_SOURCE_KINDS.has(k));
  const hasEntitle = [...kinds].some((k) => ENTITLE_SOURCE_KINDS.has(k));
  const hasCompound =
    hasLibrary ||
    hasEntitle ||
    hasSector ||
    [...kinds].some((k) => COMPOUND_SOURCE_KINDS.has(k));
  /** Daily is calendar-phase alongside compound Analyze — keep when compound runs. */
  const hasDaily = hasCompound;
  const hasCompose =
    hasCompound ||
    hasSector ||
    hasDaily ||
    (opts.hasCapitalSources ?? false) ||
    (opts.hasPanelSurfaces ?? false);

  return { hasEntitle, hasCompound, hasSector, hasDaily, hasCompose };
}

export function tracksFromCapabilities(
  caps: ModelTrackCapabilities,
): MarketHubModelTrack[] {
  const out: MarketHubModelTrack[] = [];
  if (caps.hasEntitle) out.push('entitle');
  if (caps.hasCompound) out.push('compound');
  if (caps.hasSector) out.push('sector');
  if (caps.hasDaily) out.push('daily');
  if (caps.hasCompose) out.push('compose');
  return out;
}

export function isSectorCapableKind(kind: string): boolean {
  return SECTOR_SOURCE_KINDS.has(kind);
}

export function isEntitleCapableKind(kind: string): boolean {
  return ENTITLE_SOURCE_KINDS.has(kind);
}

/** Primary Model track lane for a live source kind (D-165). */
export function primaryTrackForLiveKind(kind: string): MarketHubModelTrack {
  if (isEntitleCapableKind(kind)) return 'entitle';
  if (isSectorCapableKind(kind)) return 'sector';
  return 'compound';
}
