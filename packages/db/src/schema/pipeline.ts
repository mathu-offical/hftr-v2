import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
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
 * Trade pipeline tables (data-model.md §Trends → trades). This slice covers
 * the deterministic tail: instruction → task → trace → verification → ledger.
 * Trend/lead/decision-tree tables land with the LLM pipeline milestone.
 */

/** Compile output. All value-bearing fields are ValueRef handles. */
export const actionInstructions = pgTable(
  'action_instructions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id),
    actionVerb: text('action_verb', {
      enum: ['buy', 'sell', 'cancel', 'replace', 'close_position'],
    }).notNull(),
    symbol: text('symbol').notNull(),
    orderType: text('order_type', { enum: ['market', 'limit', 'stop', 'stop_limit'] }).notNull(),
    timeInForce: text('time_in_force', { enum: ['day', 'gtc', 'ioc', 'fok'] }).notNull(),
    quantityRef: text('quantity_ref').notNull(),
    limitPriceRef: text('limit_price_ref'),
    stopPriceRef: text('stop_price_ref'),
    fillTimeoutRef: text('fill_timeout_ref').notNull(),
    guardrailRefs: jsonb('guardrail_refs').notNull().default([]),
    verificationSchemaVersion: text('verification_schema_version').notNull(),
    clientOrderId: text('client_order_id').notNull(),
    status: text('status', { enum: ['pending', 'dispatched', 'blocked', 'failed'] })
      .notNull()
      .default('pending'),
    envelope: jsonb('envelope').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('action_instructions_client_order_unique').on(t.clientOrderId),
    index('action_instructions_company_idx').on(t.companyId, t.createdAt),
  ],
);

/** Finalized, ref-resolved broker payload produced by the dispatch layer. */
export const deterministicTasks = pgTable(
  'deterministic_tasks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    instructionId: uuid('instruction_id')
      .notNull()
      .references(() => actionInstructions.id),
    payload: jsonb('payload').notNull(), // DeterministicActionTask contract
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status', {
      enum: ['pending', 'submitted', 'filled', 'rejected', 'blocked'],
    })
      .notNull()
      .default('pending'),
    venueOrderId: text('venue_order_id'),
    ...timestamps,
  },
  (t) => [uniqueIndex('deterministic_tasks_idempotency_unique').on(t.idempotencyKey)],
);

/** IMMUTABLE append-only execution record. No update/delete helpers exist. */
export const actionTraces = pgTable(
  'action_traces',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    taskId: uuid('task_id'),
    companyId: uuid('company_id').notNull(),
    moduleId: uuid('module_id').notNull(),
    venue: text('venue').notNull(),
    mode: text('mode', { enum: ['paper', 'live'] }).notNull(),
    outcome: text('outcome', {
      enum: ['filled', 'partial', 'canceled', 'replaced', 'rejected', 'blocked', 'recovered'],
    }).notNull(),
    fills: jsonb('fills').notNull().default([]),
    simulatorGapTags: jsonb('simulator_gap_tags').notNull().default([]),
    sessionLegalitySnapshot: jsonb('session_legality_snapshot').notNull().default({}),
    policyEnvelopeVersion: text('policy_envelope_version').notNull(),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('action_traces_company_idx').on(t.companyId, t.createdAt)],
);

/**
 * Cold archive for action_traces (D-036). Rows are copied here before hot-table
 * deletion by maintenance.retention — never delete without an archive copy.
 */
export const actionTracesArchive = pgTable(
  'action_traces_archive',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id'),
    companyId: uuid('company_id').notNull(),
    moduleId: uuid('module_id').notNull(),
    venue: text('venue').notNull(),
    mode: text('mode').notNull(),
    outcome: text('outcome').notNull(),
    fills: jsonb('fills').notNull().default([]),
    simulatorGapTags: jsonb('simulator_gap_tags').notNull().default([]),
    sessionLegalitySnapshot: jsonb('session_legality_snapshot').notNull().default({}),
    policyEnvelopeVersion: text('policy_envelope_version').notNull(),
    failureCode: text('failure_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('action_traces_archive_company_idx').on(t.companyId, t.createdAt)],
);

/** Append-only verification outcomes (schema-locked field checks). */
export const verificationRecords = pgTable(
  'verification_records',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    traceId: uuid('trace_id'),
    taskId: uuid('task_id'),
    result: text('result', { enum: ['pass', 'fail', 'blocked'] }).notNull(),
    fieldResults: jsonb('field_results').notNull().default([]),
    failureCode: text('failure_code'),
    recoveryProtocolId: text('recovery_protocol_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_records_trace_idx').on(t.traceId)],
);

/** The right panel's canonical money feed. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id'),
    kind: text('kind', { enum: ['trade', 'fee', 'transfer', 'simulation', 'seed'] }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    balanceAfterCents: bigint('balance_after_cents', { mode: 'bigint' }).notNull(),
    traceId: uuid('trace_id'),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_entries_company_idx').on(t.companyId, t.createdAt)],
);
