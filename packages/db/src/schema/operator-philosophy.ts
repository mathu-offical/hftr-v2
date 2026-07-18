import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';

/**
 * Append-only operator philosophy directives (D-082).
 * Never updated or deleted by app code; agents cannot write these rows.
 */
export const operatorPhilosophyDirectives = pgTable(
  'operator_philosophy_directives',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    /** Optional module scope; null = company-wide. */
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdByClerkUserId: text('created_by_clerk_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('operator_philosophy_directives_company_idx').on(t.companyId, t.createdAt)],
);
