import { z } from 'zod';
import { MarketAwarenessLink } from './market-awareness-links';
import { ResearchSourceKind, ValidationGateResult } from './research-bus';
import { QualitativeBand } from './system-libraries';
import { CompoundSymbolScore } from './watchlist-suggestions';

/**
 * Verified multi-source normalize seals (D-072).
 * Qualitative view surfaces only — raw metrics live in private metricRefs.
 */

export const NormalizedViewKind = z.enum([
  'movers_board',
  'sector_bulletin',
  'daily_summary_phase',
]);
export type NormalizedViewKind = z.infer<typeof NormalizedViewKind>;

export const SystemNormalizedViewItem = z.object({
  /** Symbol or sector label — qualitative, not a price. */
  symbolOrSector: z.string().max(64).optional(),
  directionBand: QualitativeBand.optional(),
  strengthBand: QualitativeBand.optional(),
  /** Headline cluster — leak-linted qualitative text. */
  headline: z.string().max(300).optional(),
});
export type SystemNormalizedViewItem = z.infer<typeof SystemNormalizedViewItem>;

export const SystemNormalizedView = z.object({
  kind: NormalizedViewKind,
  /** Stable subject key for seal lookup (e.g. sector slug, phase tag). */
  subjectKey: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  items: z.array(SystemNormalizedViewItem).max(48).default([]),
  sourceDigests: z.array(z.string().min(8).max(128)).max(24).default([]),
  /** Opaque ValueRef handles — never model-facing raw numbers. */
  metricRefs: z.array(z.string().max(200)).max(24).default([]),
});
export type SystemNormalizedView = z.infer<typeof SystemNormalizedView>;

export const VerifiedNormalizedBundle = z.object({
  sealId: z.string().min(8).max(128),
  view: SystemNormalizedView,
  corroborationBand: QualitativeBand,
  sourceDigests: z.array(z.string().min(8).max(128)).max(24),
  verifiedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  gatesSnapshot: z.array(ValidationGateResult).max(12),
  reportConceptId: z.string().uuid().nullable().optional(),
  /**
   * Evidence source kinds that contributed to this seal (operator-visible provenance).
   * Optional for seals persisted before D-103.
   */
  contributingSourceKinds: z.array(ResearchSourceKind).max(24).optional(),
  /**
   * Linkage-first awareness edges for Posture multi-level analysis (D-175).
   * Optional for seals persisted before D-175.
   */
  awarenessLinks: z.array(MarketAwarenessLink).max(128).optional(),
  /** D-243: stable revision for hub cache invalidation / engine feed ETag. */
  hubRevision: z.string().min(1).max(128).optional(),
  /** D-243: symbol → view.items index for O(1) engine lookup. */
  symbolIndex: z.record(z.string(), z.number().int().nonnegative()).optional(),
  /** D-243: symbol → awareness link ids. */
  linksBySymbol: z.record(z.string(), z.array(z.string())).optional(),
  /** D-243: qualitative digest summaries for synthesize (no raw numbers). */
  sourceDigestSummaries: z
    .array(
      z.object({
        digest: z.string().min(8).max(128),
        sourceKind: ResearchSourceKind.optional(),
        title: z.string().max(200).optional(),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .max(24)
    .optional(),
  /**
   * D-243: capped compound rank for engines (bands + flags).
   * `relStrengthAbsBps` stays internal to ranking — never LLM-facing (D-008).
   */
  compoundRank: z.array(CompoundSymbolScore).max(24).optional(),
});
export type VerifiedNormalizedBundle = z.infer<typeof VerifiedNormalizedBundle>;

export const ResearchQueryPlanEntry = z.object({
  /** Provider query string — deterministic, model-free. */
  query: z.string().min(1).max(500),
  params: z.record(z.string(), z.string()).optional(),
});
export type ResearchQueryPlanEntry = z.infer<typeof ResearchQueryPlanEntry>;

export const ResearchQueryPlan = z.object({
  topicScope: z.string().min(1).max(200),
  /** Cadence token (e.g. `every:1440`, phase tag). */
  cadence: z.string().min(1).max(80),
  bySource: z.record(ResearchSourceKind, ResearchQueryPlanEntry).default({}),
});
export type ResearchQueryPlan = z.infer<typeof ResearchQueryPlan>;
