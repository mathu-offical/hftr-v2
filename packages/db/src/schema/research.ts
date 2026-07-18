import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, engineInstances, modules } from './companies';
import { brokerConnections } from './brokers';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Catalog rows seeded from the vendored v1 JSONs (packages/db/src/seed/catalogs).
 * One row per entry per catalog, versioned; payload keeps the source shape so
 * UI and engine consumers read a single canonical store instead of files.
 */
export const catalogEntries = pgTable(
  'catalog_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    catalog: text('catalog').notNull(), // e.g. 'strategy_families', 'guardrail_packages'
    entryKey: text('entry_key').notNull(), // stable id within the catalog
    catalogVersion: text('catalog_version').notNull(),
    title: text('title').notNull(),
    tier: text('tier'), // strategy tier A/B/C where applicable
    payload: jsonb('payload').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('catalog_entries_key_unique').on(t.catalog, t.entryKey),
    index('catalog_entries_catalog_idx').on(t.catalog),
  ],
);

/**
 * Current holdings per (module, symbol). Maintained transactionally by the
 * dispatch layer at fill time; qty is whole units (scale 0 for now), cost in
 * cents. Never written by anything except packages/engine/dispatch.
 */
export const positions = pgTable(
  'positions',
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
    symbol: text('symbol').notNull(),
    qty: bigint('qty', { mode: 'bigint' }).notNull(),
    avgCostCents: integer('avg_cost_cents').notNull(),
    realizedPnlCents: bigint('realized_pnl_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    /** Broker connection that produced the fill when known (D-090). */
    connectionId: uuid('connection_id').references(() => brokerConnections.id),
    venue: text('venue'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('positions_module_symbol_unique').on(t.moduleId, t.symbol),
    index('positions_company_idx').on(t.companyId),
    index('positions_connection_idx').on(t.connectionId),
  ],
);

/**
 * Append-only realized PnL events at fill time (D-090). Cash ledger stays cash-only;
 * daily-loss limits sum loss magnitude from these rows in the session window.
 */
export const realizedPnlEvents = pgTable(
  'realized_pnl_events',
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
    symbol: text('symbol').notNull(),
    realizedCents: bigint('realized_cents', { mode: 'bigint' }).notNull(),
    traceId: uuid('trace_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('realized_pnl_events_company_created_idx').on(t.companyId, t.createdAt)],
);

/**
 * Trend candidates emitted by trend modules. Until the LLM pipeline lands,
 * the deterministic trend.scan handler produces these from quote drift —
 * sourceClass is honestly labeled so nothing pretends to be model output.
 */
export const trendCandidates = pgTable(
  'trend_candidates',
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
    symbol: text('symbol').notNull(),
    direction: text('direction', { enum: ['up', 'down', 'flat'] }).notNull(),
    strengthBand: text('strength_band', { enum: ['weak', 'moderate', 'strong'] }).notNull(),
    driftRef: text('drift_ref').notNull(), // ValueRef into numeric_values
    sourceClass: text('source_class', { enum: ['deterministic_scan', 'model_nominated'] })
      .notNull()
      .default('deterministic_scan'),
    status: text('status', { enum: ['candidate', 'promoted', 'expired'] })
      .notNull()
      .default('candidate'),
    /** Opaque admitted library / evidence refs copied at promote (D-039). */
    artifactRefs: jsonb('artifact_refs').notNull().default([]),
    /**
     * D-077: optional per-trend binding to an execution engine / trading module
     * (canvas trend-item ports). Topology + UI truth; compile wiring is follow-up.
     */
    engineInstanceId: uuid('engine_instance_id').references(() => engineInstances.id, {
      onDelete: 'set null',
    }),
    tradingModuleId: uuid('trading_module_id').references(() => modules.id, {
      onDelete: 'set null',
    }),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('trend_candidates_company_idx').on(t.companyId, t.createdAt),
    index('trend_candidates_module_idx').on(t.moduleId, t.status),
  ],
);
