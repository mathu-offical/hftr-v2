import { z } from 'zod';
import { NormalizedViewKind } from './verified-normalize';

/**
 * Research / tactical / compile model-output contracts.
 * Value fields use opaque refs or qualitative descriptors only — never raw money/time.
 */

/** Qualitative evidence digest for synthesize grounding — leak-linted strings only. */
export const EvidenceSummaryForSynth = z.object({
  digest: z.string().min(8).max(128),
  title: z.string().min(1).max(300),
  summary: z.string().min(1).max(4000),
});
export type EvidenceSummaryForSynth = z.infer<typeof EvidenceSummaryForSynth>;

export const SealSummaryForSynth = z.object({
  sealId: z.string().min(8).max(128),
  kind: NormalizedViewKind,
  title: z.string().min(1).max(300),
});
export type SealSummaryForSynth = z.infer<typeof SealSummaryForSynth>;

export const ConceptLinkRelation = z.enum([
  'supports',
  'contradicts',
  'causes',
  'correlates',
  'mentions',
  'derived_from',
]);
export type ConceptLinkRelation = z.infer<typeof ConceptLinkRelation>;

export const ResearchDirective = z.object({
  topicScope: z.string().max(200),
  topicSectors: z.array(z.string().max(64)).max(12).default([]),
  philosophyAxes: z.array(z.string().max(64)).max(16).default([]),
  catalogHints: z
    .array(
      z.object({
        catalog: z.string(),
        entryKey: z.string(),
        title: z.string(),
        tier: z.string().nullable(),
      }),
    )
    .max(24)
    .default([]),
  existingConceptTitles: z.array(z.string().max(200)).max(40).default([]),
  evidenceSummaries: z.array(EvidenceSummaryForSynth).max(24).default([]),
  sealSummaries: z.array(SealSummaryForSynth).max(8).default([]),
});
export type ResearchDirective = z.infer<typeof ResearchDirective>;

export const ConceptDraft = z.object({
  title: z.string().min(1).max(200),
  /** Qualitative body — leak-linted; no raw financial digits. */
  body: z.string().min(1).max(8000),
  tags: z.array(z.string().max(64)).max(16).default([]),
  sourceRef: z.string().max(200).nullable().default(null),
});
export type ConceptDraft = z.infer<typeof ConceptDraft>;

export const ConceptLinkDraft = z.object({
  fromTitle: z.string().min(1).max(200),
  toTitle: z.string().min(1).max(200),
  relation: ConceptLinkRelation,
  /** Qualitative weight band, not a float literal for computation. */
  weightBand: z.enum(['weak', 'typical', 'strong']).default('typical'),
});
export type ConceptLinkDraft = z.infer<typeof ConceptLinkDraft>;

export const ConceptBatch = z.object({
  concepts: z.array(ConceptDraft).max(12),
  links: z.array(ConceptLinkDraft).max(24).default([]),
  escalateToStrategic: z.boolean().default(false),
  escalateReason: z
    .enum(['low_confidence', 'high_stakes', 'ambiguous_regime', 'none'])
    .default('none'),
});
export type ConceptBatch = z.infer<typeof ConceptBatch>;

export const TreeExpandOutput = z.object({
  strategyFamily: z.string().min(1).max(80),
  branchSummaries: z
    .array(
      z.object({
        id: z.string().max(64),
        label: z.string().max(120),
        actionVerb: z.enum(['buy', 'sell', 'hold', 'watch']),
        invalidationNotes: z.array(z.string().max(200)).max(6).default([]),
      }),
    )
    .min(1)
    .max(8),
  leverSelections: z
    .array(
      z.object({
        leverId: z.string().max(80),
        bandPosition: z.enum(['min', 'typical', 'max']),
      }),
    )
    .max(32)
    .default([]),
  escalateToStrategic: z.boolean().default(false),
  escalateReason: z
    .enum(['low_confidence', 'high_stakes', 'ambiguous_regime', 'none'])
    .default('none'),
});
export type TreeExpandOutput = z.infer<typeof TreeExpandOutput>;

export const CompileSelectionOutput = z.object({
  orderShape: z.enum(['market', 'limit']),
  timeInForce: z.enum(['day', 'gtc', 'ioc']),
  sizingBand: z.enum(['min', 'typical', 'max']),
  /** Opaque calc plan id — never a raw quantity. */
  sizingPlanId: z.string().max(80).default('default_risk_bps'),
  blockReasons: z.array(z.string().max(120)).max(8).default([]),
});
export type CompileSelectionOutput = z.infer<typeof CompileSelectionOutput>;
