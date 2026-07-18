import { z } from 'zod';
import { HandoffEnvelope } from './foundation';

/**
 * Research bus contracts (D-039): typed request/result + evidence + validation
 * for the autonomous gather → validate → synthesize → admit pipeline.
 * Opaque refs and qualitative bands only — never raw money/time literals.
 */

export const ResearchQueryMode = z.enum([
  'manual',
  'module',
  'company',
  'opportunistic',
  'validation',
]);
export type ResearchQueryMode = z.infer<typeof ResearchQueryMode>;

/** Per-module library admission after validation passes. */
export const AdmissionMode = z.enum(['auto_admit_validated', 'require_operator_approval']);
export type AdmissionMode = z.infer<typeof AdmissionMode>;

export const ResearchSourceKind = z.enum([
  'brave_search',
  'sec_edgar',
  'market_news',
  'alpaca_news',
  'alpaca_bars',
  'finnhub_news',
  'polygon_news',
  'fred_macro',
  'frankfurter_fx',
  'coingecko_crypto',
  'alpha_vantage_news',
  'gdelt_news',
  'world_bank_indicator',
  'twelve_data',
  'marketstack',
  'catalog',
  'library',
  'operator',
]);
export type ResearchSourceKind = z.infer<typeof ResearchSourceKind>;

export const LegalUseClass = z.enum(['ALLOWED', 'RESTRICTED', 'REVIEW_REQUIRED']);
export type LegalUseClass = z.infer<typeof LegalUseClass>;

/** Opaque artifact handle — never embeds raw financial digits. */
export const ResearchArtifactRef = z
  .string()
  .min(3)
  .max(200)
  .regex(
    /^(concept|topic|library|evidence|value_ref|request|result|seal):[A-Za-z0-9_.:-]+$/,
    'invalid_artifact_ref',
  );
export type ResearchArtifactRef = z.infer<typeof ResearchArtifactRef>;

export const EvidencePackage = z.object({
  id: z.string().uuid().optional(),
  sourceKind: ResearchSourceKind,
  /** Honest feed/source entitlement label (e.g. brave_search, sec_edgar_free). */
  feedClass: z.string().min(1).max(80),
  /** Qualitative title — leak-linted. */
  title: z.string().min(1).max(300),
  /** Qualitative summary — no raw money/time; digits redacted at normalize. */
  summary: z.string().min(1).max(4000),
  digest: z.string().min(8).max(128),
  legalUseClass: LegalUseClass.default('ALLOWED'),
  /** ISO expiry for freshness gates; null = session-scoped. */
  expiresAt: z.string().datetime().nullable().default(null),
  artifactRefs: z.array(ResearchArtifactRef).max(24).default([]),
  /** Opaque external URL or filing accession — not model-facing body. */
  externalRef: z.string().max(500).nullable().default(null),
  authorityClass: z
    .enum([
      'DETERMINISTIC',
      'PROVIDER_ANALYZED',
      'CURATED_BACKGROUND',
      'TRAINING_DERIVED',
      'OPERATOR_INPUT',
    ])
    .default('DETERMINISTIC'),
});
export type EvidencePackage = z.infer<typeof EvidencePackage>;

export const ValidationGateId = z.enum([
  'relevance',
  'duplicate',
  'source_entitlement',
  'leak_recheck',
  'coherence',
  'freshness',
  'sector_scope',
  'source_credibility',
  'corroboration',
]);
export type ValidationGateId = z.infer<typeof ValidationGateId>;

export const ValidationGateResult = z.object({
  gateId: ValidationGateId,
  passed: z.boolean(),
  /** Qualitative score band — never a raw float for computation. */
  scoreBand: z.enum(['low', 'medium', 'high']).default('medium'),
  reason: z.string().max(300).default(''),
});
export type ValidationGateResult = z.infer<typeof ValidationGateResult>;

export const ConceptValidationResult = z.object({
  overallPass: z.boolean(),
  gates: z.array(ValidationGateResult).min(1).max(12),
  relevanceBand: z.enum(['low', 'medium', 'high']).default('medium'),
  artifactRefs: z.array(ResearchArtifactRef).max(24).default([]),
  /** Band-only librarian repair hints (D-071) — never raw ratios. */
  repairHints: z.array(z.string().max(300)).max(8).default([]),
});
export type ConceptValidationResult = z.infer<typeof ConceptValidationResult>;

export const ResearchRequest = z.object({
  mode: ResearchQueryMode,
  companyId: z.string().uuid(),
  /** Research module that owns the run; null for company_sweep fan-out root. */
  moduleId: z.string().uuid().nullable(),
  /** Freeform operator/module query — qualitative; leak-linted before synthesize. */
  queryText: z.string().max(500).default(''),
  topicId: z.string().uuid().nullable().default(null),
  topicScope: z.string().max(200).default(''),
  sourceModuleId: z.string().uuid().nullable().default(null),
  sourceKinds: z.array(ResearchSourceKind).max(24).default([]),
  maxEvidence: z.number().int().min(1).max(24).default(8),
  envelope: HandoffEnvelope,
});
export type ResearchRequest = z.infer<typeof ResearchRequest>;

export const ResearchResultStatus = z.enum([
  'gathered',
  'validated',
  'validation_failed',
  'synthesized',
  'admitted',
  'proposed',
  'rejected',
  'failed',
]);
export type ResearchResultStatus = z.infer<typeof ResearchResultStatus>;

export const ResearchResult = z.object({
  requestId: z.string().uuid(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  status: ResearchResultStatus,
  evidenceIds: z.array(z.string().uuid()).max(48).default([]),
  conceptIds: z.array(z.string().uuid()).max(24).default([]),
  artifactRefs: z.array(ResearchArtifactRef).max(48).default([]),
  validation: ConceptValidationResult.nullable().default(null),
  admissionMode: AdmissionMode.nullable().default(null),
  summaryBand: z.enum(['low', 'medium', 'high']).default('medium'),
  failureReason: z.string().max(300).nullable().default(null),
  envelope: HandoffEnvelope,
});
export type ResearchResult = z.infer<typeof ResearchResult>;

/** External research gather providers (operator-supplied API keys). */
export const ResearchKeyProvider = z.enum([
  'brave',
  'market_news',
  'finnhub',
  'polygon',
  'fred',
  'alpha_vantage',
  'twelve_data',
  'marketstack',
]);
export type ResearchKeyProvider = z.infer<typeof ResearchKeyProvider>;

export const ResearchKeyVerifyResult = z.object({
  ok: z.boolean(),
  failure: z.string().nullable(),
});
export type ResearchKeyVerifyResult = z.infer<typeof ResearchKeyVerifyResult>;

export const CreateResearchQueryInput = z.object({
  mode: ResearchQueryMode.default('manual'),
  moduleId: z.string().uuid().optional(),
  queryText: z.string().min(1).max(500),
  topicId: z.string().uuid().optional(),
  topicScope: z.string().max(200).optional(),
  sourceKinds: z.array(ResearchSourceKind).max(24).optional(),
});
export type CreateResearchQueryInput = z.infer<typeof CreateResearchQueryInput>;

/**
 * Initiate library-lane research for one or more research topics (D-098).
 * Omitting topicIds (with all=true) queues every active company topic.
 */
export const InitiateTopicResearchInput = z
  .object({
    /** When true, enqueue every active research topic for the company. */
    all: z.boolean().optional(),
    topicIds: z.array(z.string().uuid()).max(200).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.all === true) return;
    if (!val.topicIds || val.topicIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'topicIds_or_all_required',
        path: ['topicIds'],
      });
    }
  });
export type InitiateTopicResearchInput = z.infer<typeof InitiateTopicResearchInput>;

export const InitiateTopicResearchResult = z.object({
  queued: z.number().int().nonnegative(),
  topicIds: z.array(z.string().uuid()),
  queueClass: z.literal('LIBRARY_RESEARCH'),
});
export type InitiateTopicResearchResult = z.infer<typeof InitiateTopicResearchResult>;

/**
 * Operator article ingest (D-079 / D-127) — link URL and/or raw text.
 * Model-free; concepts get sourceClass `operator` + `hftr:article` marker.
 * Must save into a company library; 1–3 display tags become chips in Articles.
 */
export const SubmitResearchArticleInput = z
  .object({
    moduleId: z.string().uuid(),
    kind: z.enum(['link', 'text']),
    /** URL when kind=link; article markdown/text when kind=text. */
    content: z.string().min(1).max(50_000),
    title: z.string().min(1).max(200).optional(),
    /** Optional notes when kind=link (stored as concept body prefix). */
    notes: z.string().max(20_000).optional(),
    /** Required target library for the article (D-127). */
    libraryId: z.string().uuid(),
    topicId: z.string().uuid().optional(),
    /** 1–3 display tags shown as chips on the Articles line. */
    tags: z.array(z.string().trim().min(1).max(64)).max(3).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'link') {
      try {
        const u = new URL(val.content.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'link_must_be_http_https',
            path: ['content'],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'invalid_url',
          path: ['content'],
        });
      }
    }
  });
export type SubmitResearchArticleInput = z.infer<typeof SubmitResearchArticleInput>;

export const SubmitResearchArticleResult = z.object({
  requestId: z.string().uuid(),
  conceptId: z.string().uuid(),
  libraryId: z.string().uuid().nullable(),
  topicId: z.string().uuid().nullable(),
});
export type SubmitResearchArticleResult = z.infer<typeof SubmitResearchArticleResult>;

export const RESEARCH_SOURCE_FEED_CLASS: Record<ResearchSourceKind, string> = {
  brave_search: 'brave_search',
  sec_edgar: 'sec_edgar_free',
  market_news: 'market_news_public',
  alpaca_news: 'alpaca_benzinga_news',
  alpaca_bars: 'alpaca_iex_paper',
  finnhub_news: 'finnhub_company_news',
  polygon_news: 'polygon_reference_news',
  fred_macro: 'fred_series_search',
  frankfurter_fx: 'frankfurter_reference_rates',
  coingecko_crypto: 'coingecko_markets_ranked',
  alpha_vantage_news: 'alpha_vantage_news_sentiment',
  gdelt_news: 'gdelt_event_feed',
  world_bank_indicator: 'world_bank_indicators',
  twelve_data: 'twelve_data_timeseries',
  marketstack: 'marketstack_eod',
  catalog: 'seed_catalog',
  library: 'company_library',
  operator: 'operator_input',
};
