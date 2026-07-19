import { z } from 'zod';
import { QualitativeBand } from './system-libraries';

/**
 * Durable awareness pre-links for movers hybrid (D-175).
 * Model-free edges: news/library/trend → symbol/watchlist/recommendation.
 */

export const MarketAwarenessFromKind = z.enum([
  'news',
  'library_concept',
  'trend',
  'macro',
]);
export type MarketAwarenessFromKind = z.infer<typeof MarketAwarenessFromKind>;

export const MarketAwarenessToKind = z.enum([
  'symbol',
  'watchlist',
  'recommendation',
]);
export type MarketAwarenessToKind = z.infer<typeof MarketAwarenessToKind>;

export const MarketAwarenessLink = z.object({
  id: z.string().min(1).max(120),
  fromKind: MarketAwarenessFromKind,
  fromId: z.string().min(1).max(128),
  fromLabel: z.string().min(1).max(300),
  toKind: MarketAwarenessToKind,
  toId: z.string().min(1).max(64),
  strengthBand: QualitativeBand,
  asOfIso: z.string().datetime(),
});
export type MarketAwarenessLink = z.infer<typeof MarketAwarenessLink>;

/** Evidence row for Posture level 1 (packages that produced links). */
export const MarketAwarenessEvidenceRow = z.object({
  id: z.string().min(1).max(128),
  kind: MarketAwarenessFromKind,
  label: z.string().min(1).max(300),
  linkedSymbolCount: z.number().int().nonnegative(),
  strengthBand: QualitativeBand,
});
export type MarketAwarenessEvidenceRow = z.infer<typeof MarketAwarenessEvidenceRow>;

/** Trend row grounded by links (Posture level 3). */
export const MarketAwarenessTrendRow = z.object({
  id: z.string().min(1).max(128),
  symbol: z.string().min(1).max(12),
  status: z.string().max(40),
  linkStrengthBand: QualitativeBand,
  label: z.string().max(200).optional(),
});
export type MarketAwarenessTrendRow = z.infer<typeof MarketAwarenessTrendRow>;

/** Recommendation row (Posture level 4). */
export const MarketAwarenessRecommendationRow = z.object({
  id: z.string().min(1).max(128),
  symbol: z.string().min(1).max(12),
  tier: z.enum(['suggested_search', 'suggested_verified', 'watching']),
  leadershipBand: QualitativeBand.optional(),
  newsLinkBand: QualitativeBand.optional(),
  macroLinkBand: QualitativeBand.optional(),
  libraryLinkBand: QualitativeBand.optional(),
  trendLinkBand: QualitativeBand.optional(),
  note: z.string().max(300).optional(),
});
export type MarketAwarenessRecommendationRow = z.infer<
  typeof MarketAwarenessRecommendationRow
>;

/**
 * Multi-level Market Posture analysis projection (D-175).
 * Primary emit surface — Model canvas is secondary summary only.
 */
export const MarketHubAwarenessAnalysis = z.object({
  asOfIso: z.string().datetime().nullable(),
  evidence: z.array(MarketAwarenessEvidenceRow).max(48).default([]),
  links: z.array(MarketAwarenessLink).max(128).default([]),
  trends: z.array(MarketAwarenessTrendRow).max(48).default([]),
  recommendations: z.array(MarketAwarenessRecommendationRow).max(48).default([]),
  /** Text-first coverage summary for readouts. */
  coverageSummary: z.string().max(240).default(''),
});
export type MarketHubAwarenessAnalysis = z.infer<typeof MarketHubAwarenessAnalysis>;
