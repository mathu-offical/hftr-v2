import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';

/**
 * Dynamic safety foundation tables (D-028): control snapshots, append-only
 * guardrail/limit/live-gate evaluations.
 */

export const controlSnapshots = pgTable(
  'control_snapshots',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    snapshot: jsonb('snapshot').notNull(),
    schemaVersion: text('schema_version').notNull().default('1'),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('control_snapshots_company_idx').on(t.companyId, t.createdAt)],
);

/** Append-only guardrail evaluation record. */
export const guardrailEvaluations = pgTable(
  'guardrail_evaluations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    packageId: text('package_id').notNull(),
    evaluation: jsonb('evaluation').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guardrail_evaluations_company_idx').on(t.companyId, t.createdAt)],
);

/** Append-only live-gate checklist evidence. */
export const liveGateEvidence = pgTable(
  'live_gate_evidence',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    evidence: jsonb('evidence').notNull(),
    catalogVersion: text('catalog_version').notNull(),
    overallPass: boolean('overall_pass').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('live_gate_evidence_company_idx').on(t.companyId, t.createdAt)],
);

/** Append-only operating-limit evaluation snapshot. */
export const operatingLimitEvaluations = pgTable(
  'operating_limit_evaluations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    limitsSnapshot: jsonb('limits_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('operating_limit_evaluations_company_idx').on(t.companyId, t.createdAt)],
);
