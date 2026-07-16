import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
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

const QUEUE_CLASSES = [
  'RESEARCH',
  'STRATEGIC',
  'TACTICAL',
  'COMPILE',
  'DISPATCH',
  'VERIFY',
  'TRAINING',
  'ASSISTANT',
  'BILLING',
  'MAINTENANCE',
] as const;

/**
 * The custom Postgres queue (agent-docs/architecture/job-orchestration.md).
 * Claimed with FOR UPDATE SKIP LOCKED; leases via locked_until; at-least-once
 * delivery with idempotent handlers.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    queueClass: text('queue_class', { enum: QUEUE_CLASSES }).notNull(),
    kind: text('kind').notNull(), // handler key, e.g. "maintenance.sweep"
    priority: integer('priority').notNull().default(10),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lockedBy: text('locked_by'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status', { enum: ['pending', 'active', 'completed', 'failed', 'dead'] })
      .notNull()
      .default('pending'),
    lastError: text('last_error'),
    companyId: uuid('company_id'),
    moduleId: uuid('module_id'),
    costEstimate: jsonb('cost_estimate').notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('jobs_idempotency_key_unique').on(t.idempotencyKey),
    index('jobs_claim_idx').on(t.status, t.queueClass, t.runAfter, t.priority),
    index('jobs_company_idx').on(t.companyId, t.status),
  ],
);

export const jobSchedules = pgTable(
  'job_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    cronExpr: text('cron_expr').notNull(),
    queueClass: text('queue_class', { enum: QUEUE_CLASSES }).notNull(),
    kind: text('kind').notNull(),
    payloadTemplate: jsonb('payload_template').notNull().default({}),
    companyId: uuid('company_id'),
    moduleId: uuid('module_id'),
    enabled: boolean('enabled').notNull().default(true),
    lastMaterializedWindow: timestamp('last_materialized_window', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('job_schedules_enabled_idx').on(t.enabled)],
);

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    provider: text('provider', { enum: ['anthropic', 'mistral', 'groq'] }).notNull(),
    model: text('model').notNull(),
    tier: text('tier', { enum: ['strategic', 'tactical', 'execution', 'assistant'] }).notNull(),
    companyId: uuid('company_id'),
    moduleId: uuid('module_id'),
    jobId: uuid('job_id'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    schemaValid: boolean('schema_valid').notNull(),
    leakLintPassed: boolean('leak_lint_passed').notNull(),
    rateLimitRemaining: text('rate_limit_remaining'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('llm_calls_company_idx').on(t.companyId, t.createdAt)],
);

export const llmBudgets = pgTable(
  'llm_budgets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    scope: text('scope', { enum: ['user', 'company', 'module'] }).notNull(),
    scopeId: text('scope_id').notNull(),
    provider: text('provider', { enum: ['anthropic', 'mistral', 'groq'] }).notNull(),
    windowMinutes: integer('window_minutes').notNull(),
    maxCalls: integer('max_calls').notNull(),
    maxCostCents: integer('max_cost_cents').notNull(),
    consumedCalls: integer('consumed_calls').notNull().default(0),
    consumedCostCents: integer('consumed_cost_cents').notNull().default(0),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex('llm_budgets_scope_unique').on(t.scope, t.scopeId, t.provider)],
);
