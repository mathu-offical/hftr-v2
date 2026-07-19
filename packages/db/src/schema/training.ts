import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';
import { controlSnapshots } from './safety';

/**
 * Append-only training feedback (D-126): bounded band/weight deltas only.
 * Never stores secrets or raw model prompts.
 *
 * mutation_class `book_delta` (D-122 Phase 4) links a book_deltas row.
 * D-205: `maintenance.book_delta_valves` / applyBookDeltaValvesForModule consumes
 * unapplied book_delta rows into bounded participation_rate_band snapshots.
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
      enum: ['band_position', 'weight_delta', 'book_delta'],
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

/**
 * Append-only dual-book deltas (D-122 Phase 4 both_verify).
 * Stores validated BookDelta JSON; never secrets.
 */
export const bookDeltas = pgTable(
  'book_deltas',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    engineModuleId: uuid('engine_module_id')
      .notNull()
      .references(() => modules.id),
    instructionId: uuid('instruction_id'),
    traceId: uuid('trace_id'),
    routingMode: text('routing_mode').notNull(),
    delta: jsonb('delta').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('book_deltas_company_idx').on(t.companyId, t.createdAt),
    index('book_deltas_module_idx').on(t.engineModuleId, t.createdAt),
  ],
);
