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

export const companies = pgTable(
  'companies',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkUserId: text('clerk_user_id').notNull(),
    name: text('name').notNull(),
    philosophyPrompt: text('philosophy_prompt').notNull(),
    /** Structured slideable philosophy axes → LeverSetting band positions. */
    philosophyProfile: jsonb('philosophy_profile').notNull().default({}),
    goals: jsonb('goals').notNull().default({}),
    reinvestmentPolicy: jsonb('reinvestment_policy').notNull().default({}),
    scopingPolicies: jsonb('scoping_policies').notNull().default({}),
    mode: text('mode', { enum: ['paper', 'live'] })
      .notNull()
      .default('paper'),
    seedCreditsCents: bigint('seed_credits_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    brokerConnectionId: uuid('broker_connection_id'),
    autoFundPolicy: jsonb('auto_fund_policy').notNull().default({}),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('companies_owner_idx').on(t.clerkUserId)],
);

export const modules = pgTable(
  'modules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    type: text('type', {
      enum: [
        'research',
        'library',
        'live_api',
        'trend',
        'trading',
        'policy',
        'generator',
        'simulator',
        'analyzer',
        'holding_fund',
        'fund_router',
        'math',
        'display',
      ],
    }).notNull(),
    subtype: text('subtype', {
      enum: ['crypto', 'prediction', 'hft', 'day', 'long_term', 'custom'],
    }),
    name: text('name').notNull(),
    config: jsonb('config').notNull().default({}),
    configSchemaVersion: text('config_schema_version').notNull().default('1'),
    status: text('status', { enum: ['active', 'paused', 'error', 'draft'] })
      .notNull()
      .default('draft'),
    allocationCents: bigint('allocation_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    topicSectors: text('topic_sectors').array().notNull().default([]),
    capitalAllocationRef: text('capital_allocation_ref'),
    targetExitRef: text('target_exit_ref'),
    canvasPosition: jsonb('canvas_position').notNull().default({ x: 0, y: 0 }),
    philosophyOverride: text('philosophy_override'),
    ...timestamps,
  },
  (t) => [index('modules_company_idx').on(t.companyId)],
);

export const moduleLinks = pgTable(
  'module_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    fromModuleId: uuid('from_module_id')
      .notNull()
      .references(() => modules.id),
    toModuleId: uuid('to_module_id')
      .notNull()
      .references(() => modules.id),
    linkKind: text('link_kind', {
      enum: ['data_feed', 'directive', 'verification', 'fund_route'],
    }).notNull(),
    config: jsonb('config').notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index('module_links_company_idx').on(t.companyId),
    uniqueIndex('module_links_unique_edge').on(t.fromModuleId, t.toModuleId, t.linkKind),
  ],
);

export const fundTransfers = pgTable(
  'fund_transfers',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    fromKind: text('from_kind', { enum: ['module', 'company_pool', 'reserve'] }).notNull(),
    fromModuleId: uuid('from_module_id'),
    toKind: text('to_kind', { enum: ['module', 'company_pool', 'reserve'] }).notNull(),
    toModuleId: uuid('to_module_id'),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    status: text('status', {
      enum: ['requested', 'approved', 'auto_approved', 'rejected', 'settled'],
    })
      .notNull()
      .default('requested'),
    requestedBy: text('requested_by', { enum: ['user', 'module', 'policy'] }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('fund_transfers_company_idx').on(t.companyId, t.status)],
);
