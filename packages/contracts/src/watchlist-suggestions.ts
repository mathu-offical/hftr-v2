import { z } from 'zod';
import { QualitativeBand } from './system-libraries';

/**
 * Watchlist admission tiers (D-092) — search → verified → operator watching.
 * Filterable across Market posture and bottom-panel watch lists.
 */
export const WatchlistItemStatus = z.enum([
  'suggested_search',
  'suggested_verified',
  'watching',
  'triggered',
  'archived',
]);
export type WatchlistItemStatus = z.infer<typeof WatchlistItemStatus>;

export const WatchlistSourceClass = z.enum([
  'operator',
  'trend_promotion',
  'movers_rank',
  'library_relevance',
]);
export type WatchlistSourceClass = z.infer<typeof WatchlistSourceClass>;

/** LLM-facing presets only — never free-form financial floats. */
export const ThresholdPreset = z.enum(['tight', 'typical', 'wide']);
export type ThresholdPreset = z.infer<typeof ThresholdPreset>;

export const CapPreset = z.enum(['narrow', 'typical', 'broad']);
export type CapPreset = z.infer<typeof CapPreset>;

export const CorroborationFloor = z.enum(['single', 'dual', 'multi']);
export type CorroborationFloor = z.infer<typeof CorroborationFloor>;

export const FreshnessPreset = z.enum(['strict_12h', 'default_24h']);
export type FreshnessPreset = z.infer<typeof FreshnessPreset>;

/**
 * Envelope-bound threshold profile proposed by orchestration-tier LLM.
 * Resolver maps presets into philosophy lever envelopes → concrete ints.
 */
export const SuggestionThresholdProfile = z.object({
  driftFlatPreset: ThresholdPreset.default('typical'),
  driftStrongPreset: ThresholdPreset.default('typical'),
  universeCapPreset: CapPreset.default('typical'),
  suggestionCapPreset: CapPreset.default('typical'),
  libraryFitFloor: QualitativeBand.default('medium'),
  corroborationFloor: CorroborationFloor.default('dual'),
  freshnessPreset: FreshnessPreset.default('default_24h'),
  rationaleLines: z.array(z.string().max(240)).max(8).default([]),
});
export type SuggestionThresholdProfile = z.infer<typeof SuggestionThresholdProfile>;

/** Deterministic materialized thresholds (never from LLM digits). */
export const ResolvedSuggestionThresholds = z.object({
  flatBps: z.number().int().nonnegative(),
  strongBps: z.number().int().positive(),
  universeCap: z.number().int().min(4).max(32),
  suggestionCap: z.number().int().min(1).max(40),
  libraryFitMinBand: QualitativeBand,
  corroborationMinDomains: z.number().int().min(1).max(4),
  freshnessWindowMs: z.number().int().positive(),
  lookbackMinutes: z.number().int().min(5).max(390),
  volumeMediumMin: z.number().positive(),
  volumeHighMin: z.number().positive(),
  profile: SuggestionThresholdProfile,
  sourceClass: z.enum(['llm_profile', 'typical_defaults']),
});
export type ResolvedSuggestionThresholds = z.infer<typeof ResolvedSuggestionThresholds>;

export const CompoundLaneBand = QualitativeBand;
export type CompoundLaneBand = QualitativeBand;

export const CompoundSymbolScore = z.object({
  symbol: z.string().min(1).max(12),
  leadershipBand: QualitativeBand,
  volumeBand: QualitativeBand,
  libraryFitBand: QualitativeBand,
  newsFitBand: QualitativeBand,
  macroAlignBand: QualitativeBand,
  bookFitBand: QualitativeBand,
  corroborationBand: QualitativeBand,
  corroborationDomains: z.number().int().nonnegative(),
  /** Strongest explicit news→symbol awareness link (D-175). */
  newsLinkBand: QualitativeBand,
  /** Strongest macro→symbol awareness link (D-182). */
  macroLinkBand: QualitativeBand,
  /** Strongest library_concept→symbol awareness link (D-175). */
  libraryLinkBand: QualitativeBand,
  /** Strongest trend→symbol awareness link (D-175). */
  trendLinkBand: QualitativeBand,
  /** Coverage across distinct link fromKinds for this symbol (D-175). */
  linkCoverageBand: QualitativeBand,
  relStrengthAbsBps: z.number().int().nonnegative(),
  direction: z.enum(['up', 'down', 'flat']),
  admitsSearch: z.boolean(),
});
export type CompoundSymbolScore = z.infer<typeof CompoundSymbolScore>;
