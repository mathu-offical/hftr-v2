import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const usersProfile = pgTable('users_profile', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  displayPrefs: jsonb('display_prefs').notNull().default({}),
  defaultCompanyId: uuid('default_company_id'),
  ...timestamps,
});

export const platformCredits = pgTable('platform_credits', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  balanceCents: bigint('balance_cents', { mode: 'bigint' })
    .notNull()
    .default(sql`0`),
  ...timestamps,
});

/** Append-only. Balance above is materialized; this ledger is the truth. */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkUserId: text('clerk_user_id').notNull(),
    deltaCents: bigint('delta_cents', { mode: 'bigint' }).notNull(),
    reason: text('reason', {
      enum: ['stripe_purchase', 'seed_allocation', 'llm_usage', 'refund', 'adjustment'],
    }).notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    companyId: uuid('company_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('credit_ledger_user_idx').on(t.clerkUserId, t.createdAt)],
);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('active'),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  ...timestamps,
});
