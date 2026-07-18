import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { concepts } from './knowledge';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Verified multi-source normalized views (D-072). */
export const systemNormalizedViews = pgTable(
  'system_normalized_views',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    kind: text('kind').notNull(),
    subjectKey: text('subject_key').notNull(),
    sealId: text('seal_id').notNull(),
    bundle: jsonb('bundle').notNull().default({}),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    reportConceptId: uuid('report_concept_id').references(() => concepts.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('system_normalized_views_seal_unique').on(
      t.companyId,
      t.kind,
      t.subjectKey,
      t.sealId,
    ),
    index('system_normalized_views_lookup_idx').on(t.companyId, t.kind, t.subjectKey, t.expiresAt),
  ],
);

/** Append-only curation score telemetry (D-071) — internal bands only. */
export const curationScoreEvents = pgTable(
  'curation_score_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    conceptId: uuid('concept_id').references(() => concepts.id),
    gateId: text('gate_id').notNull(),
    scoreBand: text('score_band', { enum: ['low', 'medium', 'high'] }).notNull(),
    passed: boolean('passed').notNull(),
    reason: text('reason').notNull().default(''),
    rawMeta: jsonb('raw_meta').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('curation_score_events_company_idx').on(t.companyId, t.createdAt)],
);
