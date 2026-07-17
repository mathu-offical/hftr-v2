import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Numeric + temporal reference store (D-008/D-009).
 * APPEND-ONLY: values are immutable; a "changed" value is a new row with
 * parent lineage. See agent-docs/architecture/number-handling.md.
 */
export const numericValues = pgTable(
  'numeric_values',
  {
    ref: text('ref').primaryKey(), // "nv_<ulid>"
    kind: text('kind', {
      enum: [
        'price',
        'quantity',
        'pct',
        'bps',
        'usd_cents',
        'ratio',
        'count',
        'volatility',
        'probability',
        'timestamp_ms',
        'duration_ms',
        'session_date',
        'schedule_ref',
      ],
    }).notNull(),
    unit: text('unit').notNull(),
    scale: integer('scale').notNull().default(0),
    valueInt: bigint('value_int', { mode: 'bigint' }).notNull(),
    timezone: text('timezone'), // IANA; mandatory for temporal kinds (checked in code)
    sourceClass: text('source_class', {
      enum: [
        'live_feed',
        'broker_state',
        'ledger',
        'derived',
        'band_seed',
        'operator_input',
        'clock',
        'calendar',
      ],
    }).notNull(),
    sourceId: text('source_id').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    ttlMs: bigint('ttl_ms', { mode: 'bigint' }).notNull(),
    parentRefs: text('parent_refs').array().notNull().default([]),
    sanityEnvelope: jsonb('sanity_envelope').notNull().default({}),
    companyId: uuid('company_id'),
    moduleId: uuid('module_id'),
    lineageHash: text('lineage_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('numeric_values_company_kind_idx').on(t.companyId, t.kind, t.capturedAt),
    index('numeric_values_source_idx').on(t.sourceId),
  ],
);

/** APPEND-ONLY audit of every calculator operation. */
export const calcOperations = pgTable(
  'calc_operations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    opKind: text('op_kind', { enum: ['static', 'expr'] }).notNull(),
    opName: text('op_name').notNull(), // static op name or serialized expr digest
    formulaVersion: text('formula_version').notNull(),
    inputRefs: text('input_refs').array().notNull(),
    outputRef: text('output_ref'),
    sanityResults: jsonb('sanity_results').notNull().default({}),
    status: text('status', { enum: ['ok', 'stale_input', 'sanity_block', 'unit_error'] }).notNull(),
    jobId: uuid('job_id'),
    tier: text('tier'),
    moduleId: uuid('module_id'),
    durationUs: integer('duration_us').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('calc_operations_module_idx').on(t.moduleId, t.createdAt)],
);

/** Exchange sessions feeding the calendar service + session-legality checks. */
export const exchangeCalendars = pgTable(
  'exchange_calendars',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    venue: text('venue').notNull(),
    sessionDate: date('session_date').notNull(),
    timezone: text('timezone').notNull(),
    openMsUtc: bigint('open_ms_utc', { mode: 'bigint' }),
    closeMsUtc: bigint('close_ms_utc', { mode: 'bigint' }),
    isHoliday: text('is_holiday', { enum: ['open', 'holiday', 'half_day'] })
      .notNull()
      .default('open'),
    catalogVersion: text('catalog_version').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('exchange_calendars_venue_date_unique').on(t.venue, t.sessionDate)],
);
