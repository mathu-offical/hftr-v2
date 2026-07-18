import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';
import { controlSnapshots } from './safety';

/**
 * Append-only training feedback (D-126): bounded band/weight deltas only.
 * Never stores secrets or raw model prompts.
 */

export const trainingFeedback = pgTable(
  'training_feedback',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    sourceRunId: uuid('source_run_id'),
    sourceTraceId: uuid('source_trace_id'),
    mutationClass: text('mutation_class', {
      enum: ['band_position', 'weight_delta'],
    }).notNull(),
    delta: jsonb('delta').notNull(),
    appliedControlSnapshotId: uuid('applied_control_snapshot_id').references(
      () => controlSnapshots.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('training_feedback_company_idx').on(t.companyId, t.createdAt),
    index('training_feedback_snapshot_idx').on(t.appliedControlSnapshotId),
  ],
);
