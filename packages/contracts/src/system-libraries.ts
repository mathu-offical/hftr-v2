import { z } from 'zod';

/**
 * System-curated library document shapes (D-069).
 * Rigid markdown section requirements for operator/LLM-readable reports.
 * Qualitative bands only — no raw financial digits on shape results.
 */

export const SystemDocKind = z.enum([
  'movers_lens',
  'movers_report',
  'execution_log',
  'daily_summary',
  'runtime_policy',
  'trend_list',
  'sector_bulletin',
]);
export type SystemDocKind = z.infer<typeof SystemDocKind>;

/** Canonical topic scopes for system-curated library folders. */
export const SystemTopicScope = {
  MOVERS: 'system:movers',
  EXECUTION_LOGS: 'system:execution_logs',
  DAILY_SUMMARIES: 'system:daily_summaries',
  RUNTIME_POLICIES: 'system:runtime_policies',
  TREND_LISTS: 'system:trend_lists',
  SECTOR_NEWS: 'system:sector_news',
} as const;
export type SystemTopicScope = (typeof SystemTopicScope)[keyof typeof SystemTopicScope];

export const SystemTopicScopeValue = z.enum([
  SystemTopicScope.MOVERS,
  SystemTopicScope.EXECUTION_LOGS,
  SystemTopicScope.DAILY_SUMMARIES,
  SystemTopicScope.RUNTIME_POLICIES,
  SystemTopicScope.TREND_LISTS,
  SystemTopicScope.SECTOR_NEWS,
]);
export type SystemTopicScopeValue = z.infer<typeof SystemTopicScopeValue>;

export const DocumentShapeSpec = z.object({
  kind: SystemDocKind,
  /** `##` heading titles required (case-insensitive); H1 is always required at validate time. */
  requiredSectionHeadings: z.array(z.string().min(1).max(120)),
  /** Reports, bulletins, and summaries require ≥1 wikilink. */
  requireWikilink: z.boolean(),
  /** Tags that must be present on the concept (includes `system_curated`). */
  requiredTags: z.array(z.string().min(1).max(64)),
  /** Kind-specific tag suffix (`movers`, `sector_news`, …). */
  kindTag: z.string().min(1).max(64),
});
export type DocumentShapeSpec = z.infer<typeof DocumentShapeSpec>;

/** Per-kind rigid shape registry — aligned with `research-document-shapes.md`. */
export const SYSTEM_DOC_SHAPE_SPECS: Record<SystemDocKind, DocumentShapeSpec> = {
  movers_lens: {
    kind: 'movers_lens',
    requiredSectionHeadings: [],
    requireWikilink: false,
    requiredTags: ['system_curated', 'movers'],
    kindTag: 'movers',
  },
  movers_report: {
    kind: 'movers_report',
    requiredSectionHeadings: ['Scan window', 'Leadership notes', 'Related lenses'],
    requireWikilink: true,
    requiredTags: ['system_curated', 'movers'],
    kindTag: 'movers',
  },
  execution_log: {
    kind: 'execution_log',
    requiredSectionHeadings: ['Session', 'Actions', 'Outcomes'],
    requireWikilink: false,
    requiredTags: ['system_curated', 'execution_logs'],
    kindTag: 'execution_logs',
  },
  daily_summary: {
    kind: 'daily_summary',
    /** D-183 ten-slot analyze cadence (ET wall + session). */
    requiredSectionHeadings: [
      'Overnight',
      'Wake-up',
      'Pre-market',
      'Open bell',
      'Mid-morning',
      'Midday',
      'Afternoon',
      'Power hour',
      'Market close',
      'Evening',
    ],
    requireWikilink: true,
    requiredTags: ['system_curated', 'daily_summaries'],
    kindTag: 'daily_summaries',
  },
  runtime_policy: {
    kind: 'runtime_policy',
    requiredSectionHeadings: ['Scope', 'Constraints', 'Escalation'],
    requireWikilink: false,
    requiredTags: ['system_curated', 'runtime_policies'],
    kindTag: 'runtime_policies',
  },
  trend_list: {
    kind: 'trend_list',
    requiredSectionHeadings: ['Active trends', 'Watch', 'Deferred'],
    requireWikilink: false,
    requiredTags: ['system_curated', 'trend_lists'],
    kindTag: 'trend_lists',
  },
  sector_bulletin: {
    kind: 'sector_bulletin',
    requiredSectionHeadings: ['Sector focus', 'Headlines', 'Cross-links'],
    requireWikilink: true,
    requiredTags: ['system_curated', 'sector_news'],
    kindTag: 'sector_news',
  },
};

/** Topic scope lookup per document kind. */
export const SYSTEM_DOC_TOPIC_SCOPE: Record<SystemDocKind, SystemTopicScope> = {
  movers_lens: SystemTopicScope.MOVERS,
  movers_report: SystemTopicScope.MOVERS,
  execution_log: SystemTopicScope.EXECUTION_LOGS,
  daily_summary: SystemTopicScope.DAILY_SUMMARIES,
  runtime_policy: SystemTopicScope.RUNTIME_POLICIES,
  trend_list: SystemTopicScope.TREND_LISTS,
  sector_bulletin: SystemTopicScope.SECTOR_NEWS,
};

export const DocumentShapeResult = z.object({
  ok: z.boolean(),
  kind: SystemDocKind,
  repairHints: z.array(z.string().max(300)),
  failedChecks: z.array(z.string().max(120)),
});
export type DocumentShapeResult = z.infer<typeof DocumentShapeResult>;

export const QualitativeBand = z.enum(['low', 'medium', 'high']);
export type QualitativeBand = z.infer<typeof QualitativeBand>;

export const DocumentCurationScore = z.object({
  structureBand: QualitativeBand,
  linkBand: QualitativeBand,
  freshnessBand: QualitativeBand,
  overallBand: QualitativeBand,
  repairHints: z.array(z.string().max(300)),
});
export type DocumentCurationScore = z.infer<typeof DocumentCurationScore>;
