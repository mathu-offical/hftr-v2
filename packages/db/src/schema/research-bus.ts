import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Research bus (D-039): typed requests, append-only evidence, and result
 * projections for gather → validate → synthesize → admit.
 */

export const researchRequests = pgTable(
  'research_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    mode: text('mode', {
      enum: ['manual', 'module', 'company', 'opportunistic', 'validation'],
    }).notNull(),
    queryText: text('query_text').notNull().default(''),
    topicId: uuid('topic_id'),
    topicScope: text('topic_scope').notNull().default(''),
    sourceModuleId: uuid('source_module_id').references(() => modules.id),
    sourceKinds: jsonb('source_kinds').notNull().default([]),
    maxEvidence: integer('max_evidence').notNull().default(8),
    status: text('status', {
      enum: [
        'queued',
        'gathering',
        'validating',
        'synthesizing',
        'admitting',
        'completed',
        'failed',
        'cancelled',
      ],
    })
      .notNull()
      .default('queued'),
    envelope: jsonb('envelope').notNull().default({}),
    causationRefs: jsonb('causation_refs').notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index('research_requests_company_idx').on(t.companyId, t.createdAt),
    index('research_requests_module_idx').on(t.moduleId, t.status),
  ],
);

/** Append-only evidence packages from model-free gather adapters. */
export const researchEvidence = pgTable(
  'research_evidence',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    requestId: uuid('request_id')
      .notNull()
      .references(() => researchRequests.id),
    sourceKind: text('source_kind', {
      enum: [
        'brave_search',
        'sec_edgar',
        'market_news',
        'alpaca_bars',
        'catalog',
        'library',
        'operator',
      ],
    }).notNull(),
    feedClass: text('feed_class').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    digest: text('digest').notNull(),
    legalUseClass: text('legal_use_class', {
      enum: ['ALLOWED', 'RESTRICTED', 'REVIEW_REQUIRED'],
    })
      .notNull()
      .default('ALLOWED'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    artifactRefs: jsonb('artifact_refs').notNull().default([]),
    externalRef: text('external_ref'),
    authorityClass: text('authority_class').notNull().default('DETERMINISTIC'),
    package: jsonb('package').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('research_evidence_request_idx').on(t.requestId, t.createdAt),
    index('research_evidence_company_idx').on(t.companyId, t.createdAt),
    uniqueIndex('research_evidence_digest_unique').on(t.companyId, t.digest),
  ],
);

export const researchResults = pgTable(
  'research_results',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    requestId: uuid('request_id')
      .notNull()
      .references(() => researchRequests.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    status: text('status', {
      enum: [
        'gathered',
        'validated',
        'validation_failed',
        'synthesized',
        'admitted',
        'proposed',
        'rejected',
        'failed',
      ],
    }).notNull(),
    evidenceIds: jsonb('evidence_ids').notNull().default([]),
    conceptIds: jsonb('concept_ids').notNull().default([]),
    artifactRefs: jsonb('artifact_refs').notNull().default([]),
    validation: jsonb('validation'),
    admissionMode: text('admission_mode', {
      enum: ['auto_admit_validated', 'require_operator_approval'],
    }),
    summaryBand: text('summary_band', { enum: ['low', 'medium', 'high'] })
      .notNull()
      .default('medium'),
    failureReason: text('failure_reason'),
    envelope: jsonb('envelope').notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('research_results_request_unique').on(t.requestId),
    index('research_results_company_idx').on(t.companyId, t.createdAt),
  ],
);

/** Operator-visible research run projection (one row per request). */
export const researchRuns = pgTable(
  'research_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    requestId: uuid('request_id')
      .notNull()
      .references(() => researchRequests.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    phase: text('phase', {
      enum: ['gather', 'validate', 'synthesize', 'admit', 'done', 'failed'],
    })
      .notNull()
      .default('gather'),
    evidenceCount: integer('evidence_count').notNull().default(0),
    conceptCount: integer('concept_count').notNull().default(0),
    validationPassed: boolean('validation_passed'),
    admissionApplied: text('admission_applied'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('research_runs_request_unique').on(t.requestId),
    index('research_runs_company_idx').on(t.companyId, t.createdAt),
  ],
);
