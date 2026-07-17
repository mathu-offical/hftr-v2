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

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * User-owned broker API credentials (AES-GCM via CREDENTIALS_ENCRYPTION_KEY).
 * Exclusive company binding: at most one company.broker_connection_id points here.
 */
export const brokerConnections = pgTable(
  'broker_connections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkUserId: text('clerk_user_id').notNull(),
    venue: text('venue', {
      enum: ['alpaca', 'kalshi', 'polymarket', 'coinbase'],
    }).notNull(),
    mode: text('mode', { enum: ['paper', 'live'] })
      .notNull()
      .default('paper'),
    ciphertext: text('ciphertext').notNull(),
    keyHint: text('key_hint').notNull(),
    status: text('status', {
      enum: ['connected', 'error', 'revoked', 'unverified'],
    })
      .notNull()
      .default('unverified'),
    capabilities: jsonb('capabilities'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    /** Optional stable venue account id for exclusivity checks (e.g. Alpaca account number). */
    venueAccountId: text('venue_account_id'),
    ...timestamps,
  },
  (t) => [
    index('broker_connections_user_idx').on(t.clerkUserId),
    uniqueIndex('broker_connections_user_venue_mode_unique').on(t.clerkUserId, t.venue, t.mode),
  ],
);

export const brokerBalancesSnapshot = pgTable(
  'broker_balances_snapshot',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => brokerConnections.id),
    cashCents: bigint('cash_cents', { mode: 'bigint' }).notNull(),
    buyingPowerCents: bigint('buying_power_cents', { mode: 'bigint' }).notNull(),
    positions: jsonb('positions').notNull().default([]),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('broker_balances_connection_idx').on(t.connectionId, t.asOf)],
);

export const dispatchReconciliationEvents = pgTable(
  'dispatch_reconciliation_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id').notNull(),
    connectionId: uuid('connection_id').references(() => brokerConnections.id),
    clientOrderId: text('client_order_id'),
    venueOrderId: text('venue_order_id'),
    eventKind: text('event_kind', {
      enum: ['submit', 'poll', 'fill', 'reject', 'timeout', 'recover', 'cancel'],
    }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dispatch_recon_company_idx').on(t.companyId, t.createdAt),
    index('dispatch_recon_client_order_idx').on(t.clientOrderId),
  ],
);
