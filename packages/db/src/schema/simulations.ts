import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Parallel paper simulation runs (simulator module milestone). */
export const simulationRuns = pgTable(
  'simulation_runs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    label: text('label').notNull(),
    status: text('status').notNull().default('pending'),
    config: jsonb('config').notNull().default({}),
    resultSummary: jsonb('result_summary').notNull().default({}),
    ...timestamps,
  },
  (t) => [index('simulation_runs_company_idx').on(t.companyId, t.createdAt)],
);
