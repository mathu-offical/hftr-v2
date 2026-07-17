import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Operator watch lists (bottom panel). Each item belongs to the trading/trend
 * module that would act on it; sourceClass distinguishes hand-added symbols
 * from trend-promotion so nothing pretends to be operator intent.
 */
export const watchlistItems = pgTable(
  'watchlist_items',
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
    bias: text('bias', { enum: ['long', 'short', 'neutral'] })
      .notNull()
      .default('neutral'),
    note: text('note').notNull().default(''),
    sourceClass: text('source_class', { enum: ['operator', 'trend_promotion'] })
      .notNull()
      .default('operator'),
    status: text('status', { enum: ['watching', 'triggered', 'archived'] })
      .notNull()
      .default('watching'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('watchlist_items_module_symbol_unique').on(t.moduleId, t.symbol),
    index('watchlist_items_company_idx').on(t.companyId),
  ],
);
