import {
  SuggestionThresholdProfile,
  type CapPreset,
  type CorroborationFloor,
  type QualitativeBand,
  type ResolvedSuggestionThresholds,
  type SuggestionThresholdProfile as Profile,
  type ThresholdPreset,
} from '@hftr/contracts';

/** Catalog anchors (typical envelope) — not immutable runtime law. */
export const TYPICAL_FLAT_BPS = 20;
export const TYPICAL_STRONG_BPS = 60;
export const TYPICAL_UNIVERSE_CAP = 12;
export const TYPICAL_SUGGESTION_CAP = 15;
export const TYPICAL_LOOKBACK_MINUTES = 60;
export const DEFAULT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const STRICT_FRESHNESS_MS = 12 * 60 * 60 * 1000;

const FLAT_BPS: Record<ThresholdPreset, number> = {
  tight: 12,
  typical: TYPICAL_FLAT_BPS,
  wide: 35,
};

const STRONG_BPS: Record<ThresholdPreset, number> = {
  tight: 40,
  typical: TYPICAL_STRONG_BPS,
  wide: 100,
};

const UNIVERSE_CAP: Record<CapPreset, number> = {
  narrow: 8,
  typical: TYPICAL_UNIVERSE_CAP,
  broad: 16,
};

const SUGGESTION_CAP: Record<CapPreset, number> = {
  narrow: 8,
  typical: TYPICAL_SUGGESTION_CAP,
  broad: 24,
};

const CORROBORATION_DOMAINS: Record<CorroborationFloor, number> = {
  single: 1,
  dual: 2,
  multi: 3,
};

export type ResolveSuggestionThresholdsInput = {
  profile?: Partial<Profile> | null;
  /** When evidence_bar is max, force strict freshness even if profile says default. */
  evidenceBarMax?: boolean;
  /** research_breadth / diversification can nudge caps toward narrow when min. */
  breadthBias?: 'min' | 'typical' | 'max';
  /** Override provenance label (default: llm_profile when profile set, else typical). */
  sourceClass?: 'llm_profile' | 'typical_defaults';
};

/**
 * Map envelope-bound LLM presets → concrete thresholds.
 * Never reads free-form floats from the model.
 */
export function resolveSuggestionThresholds(
  input: ResolveSuggestionThresholdsInput = {},
): ResolvedSuggestionThresholds {
  const profile = SuggestionThresholdProfile.parse(input.profile ?? {});
  let universeCap = UNIVERSE_CAP[profile.universeCapPreset];
  let suggestionCap = SUGGESTION_CAP[profile.suggestionCapPreset];
  if (input.breadthBias === 'min') {
    universeCap = Math.min(universeCap, UNIVERSE_CAP.narrow);
    suggestionCap = Math.min(suggestionCap, SUGGESTION_CAP.narrow);
  } else if (input.breadthBias === 'max') {
    universeCap = Math.max(universeCap, UNIVERSE_CAP.broad);
    suggestionCap = Math.max(suggestionCap, SUGGESTION_CAP.broad);
  }

  let freshnessWindowMs =
    profile.freshnessPreset === 'strict_12h' ? STRICT_FRESHNESS_MS : DEFAULT_FRESHNESS_MS;
  if (input.evidenceBarMax) {
    freshnessWindowMs = STRICT_FRESHNESS_MS;
  }

  const flatBps = FLAT_BPS[profile.driftFlatPreset];
  let strongBps = STRONG_BPS[profile.driftStrongPreset];
  if (strongBps <= flatBps) strongBps = flatBps + 20;

  const sourceClass =
    input.sourceClass ?? (input.profile ? 'llm_profile' : 'typical_defaults');

  return {
    flatBps,
    strongBps,
    universeCap,
    suggestionCap,
    libraryFitMinBand: profile.libraryFitFloor,
    corroborationMinDomains: CORROBORATION_DOMAINS[profile.corroborationFloor],
    freshnessWindowMs,
    lookbackMinutes: TYPICAL_LOOKBACK_MINUTES,
    volumeMediumMin: 1,
    volumeHighMin: 1.5,
    profile,
    sourceClass,
  };
}

export function bandRank(band: QualitativeBand): number {
  switch (band) {
    case 'high':
      return 2;
    case 'medium':
      return 1;
    case 'low':
      return 0;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function bandAtLeast(band: QualitativeBand, floor: QualitativeBand): boolean {
  return bandRank(band) >= bandRank(floor);
}

export function leadershipBandFromAbsBps(
  absBps: number,
  thresholds: Pick<ResolvedSuggestionThresholds, 'flatBps' | 'strongBps'>,
): QualitativeBand {
  if (absBps < thresholds.flatBps) return 'low';
  if (absBps < thresholds.strongBps) return 'medium';
  return 'high';
}

export function volumeBandFromRatio(
  ratio: number,
  thresholds: Pick<ResolvedSuggestionThresholds, 'volumeMediumMin' | 'volumeHighMin'>,
): QualitativeBand {
  if (ratio < thresholds.volumeMediumMin) return 'low';
  if (ratio < thresholds.volumeHighMin) return 'medium';
  return 'high';
}

export function corroborationBandFromDomains(domains: number): QualitativeBand {
  if (domains >= 3) return 'high';
  if (domains >= 2) return 'medium';
  if (domains >= 1) return 'low';
  return 'low';
}
