import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { brokerConnections } from './brokers';

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
    /** Multi-select from SECTOR_FOCUS_PRESETS; pre-seeds engine topic/sectors. */
    sectorFocuses: text('sector_focuses').array().notNull().default([]),
    /** Structured slideable philosophy axes → LeverSetting band positions. */
    philosophyProfile: jsonb('philosophy_profile').notNull().default({}),
    /** Company LLM tier model + privacy policy (allowlisted model ids only). */
    llmPolicy: jsonb('llm_policy').notNull().default({}),
    goals: jsonb('goals').notNull().default({}),
    reinvestmentPolicy: jsonb('reinvestment_policy').notNull().default({}),
    scopingPolicies: jsonb('scoping_policies').notNull().default({}),
    mode: text('mode', { enum: ['paper', 'live'] })
      .notNull()
      .default('paper'),
    seedCreditsCents: bigint('seed_credits_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    /** Exclusive bind: unique so one broker connection serves at most one company. */
    brokerConnectionId: uuid('broker_connection_id').references(() => brokerConnections.id),
    autoFundPolicy: jsonb('auto_fund_policy').notNull().default({}),
    /** Set when operator explicitly arms live trading after gate pass (fail-closed until set). */
    liveArmedAt: timestamp('live_armed_at', { withTimezone: true }),
    liveGateEvidenceId: uuid('live_gate_evidence_id'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('companies_owner_idx').on(t.clerkUserId),
    uniqueIndex('companies_broker_connection_unique').on(t.brokerConnectionId),
  ],
);

/**
 * Persisted ENGINE group (D-028). Member modules reference this via
 * modules.engine_instance_id. Math modules are never members.
 */
export const engineInstances = pgTable(
  'engine_instances',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    templateId: text('template_id').notNull(),
    label: text('label').notNull(),
    masterTopicSectors: text('master_topic_sectors').array().notNull().default([]),
    /** D-035: total capital envelope ValueRef (cascades as equal split to members). */
    capitalAllocationRef: text('capital_allocation_ref'),
    /** D-035: overall exit ValueRef shared by exit-bearing members. */
    targetExitRef: text('target_exit_ref'),
    /** Operator-visible draft strings for group chrome hydration. */
    setupSnapshot: jsonb('setup_snapshot').notNull().default({}),
    /** Engine template input values collected at insert time. */
    templateInputs: jsonb('template_inputs').notNull().default({}),
    canvasBounds: jsonb('canvas_bounds'),
    ...timestamps,
  },
  (t) => [index('engine_instances_company_idx').on(t.companyId)],
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
        'librarian',
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
    generatedNameBase: text('generated_name_base').notNull(),
    nameCustomized: boolean('name_customized').notNull().default(false),
    config: jsonb('config').notNull().default({}),
    configSchemaVersion: text('config_schema_version').notNull().default('1'),
    status: text('status', { enum: ['active', 'paused', 'error', 'draft'] })
      .notNull()
      .default('draft'),
    allocationCents: bigint('allocation_cents', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    topicSectors: text('topic_sectors').array().notNull().default([]),
    topicSectorsOverridden: boolean('topic_sectors_overridden').notNull().default(false),
    capitalAllocationRef: text('capital_allocation_ref'),
    targetExitRef: text('target_exit_ref'),
    canvasPosition: jsonb('canvas_position').notNull().default({ x: 0, y: 0 }),
    philosophyOverride: text('philosophy_override'),
    engineInstanceId: uuid('engine_instance_id').references(() => engineInstances.id, {
      onDelete: 'set null',
    }),
    /**
     * D-033: explicit dedicated-tool ownership. Set only on Math rows; unique
     * nullable FK gives each owner at most one dedicated Math tool.
     */
    toolOwnerModuleId: uuid('tool_owner_module_id').references((): AnyPgColumn => modules.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    index('modules_company_idx').on(t.companyId),
    index('modules_engine_instance_idx').on(t.engineInstanceId),
    uniqueIndex('modules_tool_owner_unique').on(t.toolOwnerModuleId),
  ],
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
