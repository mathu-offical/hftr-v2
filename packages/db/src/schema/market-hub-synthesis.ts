import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Operator Analyze synthesis runs (D-120) — live Model canvas progress. */
export const marketHubSynthesisRuns = pgTable(
  'market_hub_synthesis_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'partial'],
    }).notNull(),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('market_hub_synthesis_runs_company_started_idx').on(t.companyId, t.startedAt)],
);

/** Per-stage progress for a synthesis run (upsert by run_id + stage_id). */
export const marketHubSynthesisStages = pgTable(
  'market_hub_synthesis_stages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runId: uuid('run_id')
      .notNull()
      .references(() => marketHubSynthesisRuns.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    stageId: text('stage_id').notNull(),
    label: text('label').notNull(),
    kind: text('kind', {
      enum: ['data', 'llm', 'deterministic', 'output'],
    }).notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'skipped'],
    }).notNull(),
    sortOrder: integer('sort_order').notNull(),
    summary: text('summary'),
    justificationLines: jsonb('justification_lines').notNull().default([]),
    jobId: uuid('job_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('market_hub_synthesis_stages_run_stage_unique').on(t.runId, t.stageId),
    index('market_hub_synthesis_stages_company_run_idx').on(t.companyId, t.runId),
  ],
);
