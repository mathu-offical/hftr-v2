import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

/** Append-only company-scoped assistant conversation log. Never UPDATE/DELETE in app code. */
export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    clerkUserId: text('clerk_user_id').notNull(),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    content: text('content').notNull(),
    toolResults: jsonb('tool_results'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('assistant_messages_company_idx').on(t.companyId, t.createdAt),
    index('assistant_messages_company_user_created_idx').on(
      t.companyId,
      t.clerkUserId,
      t.createdAt,
    ),
    check('assistant_messages_role_check', sql`${t.role} in ('user', 'assistant', 'system')`),
  ],
);

/** Append-only audit of assistant-proposed mutations (confirm applies once; row never deleted). */
export const assistantEdits = pgTable(
  'assistant_edits',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    clerkUserId: text('clerk_user_id').notNull(),
    tool: text('tool').notNull(),
    proposal: jsonb('proposal').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('assistant_edits_company_status_idx').on(t.companyId, t.status, t.createdAt),
    check('assistant_edits_status_check', sql`${t.status} in ('pending', 'confirmed', 'rejected')`),
  ],
);

/** Cold archive for assistant_messages — copy-before-delete (D-036). */
export const assistantMessagesArchive = pgTable(
  'assistant_messages_archive',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id').notNull(),
    clerkUserId: text('clerk_user_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    toolResults: jsonb('tool_results'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assistant_messages_archive_company_idx').on(t.companyId, t.createdAt)],
);

/** Cold archive for assistant_edits — copy-before-delete (D-036). */
export const assistantEditsArchive = pgTable(
  'assistant_edits_archive',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id').notNull(),
    clerkUserId: text('clerk_user_id').notNull(),
    tool: text('tool').notNull(),
    proposal: jsonb('proposal').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assistant_edits_archive_company_idx').on(t.companyId, t.createdAt)],
);
