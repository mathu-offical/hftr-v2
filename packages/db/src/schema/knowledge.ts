import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';
import { actionInstructions } from './pipeline';
import { trendCandidates } from './research';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Knowledge & pipeline-spine tables (v1 carryover: activation-validation.md,
 * execution-agent-compile.md). These cover the model-bearing stages of the
 * v1 pipeline — research curation, lead admission, tactical decomposition,
 * and compile — implemented today as deterministic placeholders. sourceClass
 * columns keep provenance honest: nothing here pretends to be model output
 * until a real provider call replaces the placeholder function.
 */

/** Curated research concepts owned by a research module. */
export const concepts = pgTable(
  'concepts',
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
    title: text('title').notNull(),
    body: text('body').notNull(),
    tags: jsonb('tags').notNull().default([]),
    sourceClass: text('source_class', {
      enum: ['catalog_seed', 'deterministic_placeholder', 'model_generated', 'operator'],
    })
      .notNull()
      .default('deterministic_placeholder'),
    sourceRef: text('source_ref'),
    researchRunId: uuid('research_run_id'),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    confidenceBand: text('confidence_band', { enum: ['low', 'medium', 'high'] })
      .notNull()
      .default('medium'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /**
     * Primary library for hard nested galaxy layout (D-040).
     * FK enforced in migration; uuid-only here to avoid circular import with libraries.ts.
     */
    primaryLibraryId: uuid('primary_library_id'),
    queryCount: integer('query_count').notNull().default(0),
    lastQueriedAt: timestamp('last_queried_at', { withTimezone: true }),
    referenceCount: integer('reference_count').notNull().default(0),
    lastReferencedAt: timestamp('last_referenced_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('concepts_company_idx').on(t.companyId, t.createdAt),
    uniqueIndex('concepts_module_title_unique').on(t.moduleId, t.title),
    index('concepts_primary_library_idx').on(t.primaryLibraryId),
  ],
);

/** Typed galaxy / Obsidian edges between concepts. */
export const conceptLinks = pgTable(
  'concept_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    fromConceptId: uuid('from_concept_id')
      .notNull()
      .references(() => concepts.id),
    toConceptId: uuid('to_concept_id')
      .notNull()
      .references(() => concepts.id),
    relation: text('relation', {
      enum: ['supports', 'contradicts', 'causes', 'correlates', 'mentions', 'derived_from'],
    }).notNull(),
    weightBand: text('weight_band', { enum: ['weak', 'typical', 'strong'] })
      .notNull()
      .default('typical'),
    sourceClass: text('source_class', {
      enum: ['catalog_seed', 'deterministic_placeholder', 'model_generated', 'operator'],
    })
      .notNull()
      .default('model_generated'),
    ...timestamps,
  },
  (t) => [
    index('concept_links_company_idx').on(t.companyId),
    uniqueIndex('concept_links_unique_edge').on(t.fromConceptId, t.toConceptId, t.relation),
  ],
);

/**
 * Six-gate admission record (activation-validation.md). One row per trend
 * promotion attempt; gates jsonb holds the full evidence array so downstream
 * stages and operator surfaces reference admission truth, never reinterpret.
 */
export const leadPackages = pgTable(
  'lead_packages',
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
    targetModuleId: uuid('target_module_id').references(() => modules.id),
    trendId: uuid('trend_id')
      .notNull()
      .references(() => trendCandidates.id),
    symbol: text('symbol').notNull(),
    direction: text('direction', { enum: ['up', 'down', 'flat'] }).notNull(),
    strategyFamily: text('strategy_family').notNull(),
    status: text('status', {
      enum: ['pending', 'admitted', 'rejected', 'decomposed', 'expired'],
    })
      .notNull()
      .default('pending'),
    gates: jsonb('gates').notNull().default([]),
    controlSnapshot: jsonb('control_snapshot').notNull().default({}),
    ...timestamps,
  },
  (t) => [index('lead_packages_company_idx').on(t.companyId, t.createdAt)],
);

/** Tactical decomposition of an admitted lead (BranchNode[] in branches). */
export const decisionTrees = pgTable(
  'decision_trees',
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
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leadPackages.id),
    symbol: text('symbol').notNull(),
    status: text('status', {
      enum: ['draft', 'compile_ready', 'compile_blocked', 'dispatched', 'invalidated'],
    })
      .notNull()
      .default('draft'),
    branches: jsonb('branches').notNull().default([]),
    recoveryLadder: jsonb('recovery_ladder').notNull().default([]),
    /** Accumulated LeverSetting map from philosophy / tier jobs. */
    leverState: jsonb('lever_state').notNull().default({}),
    sourceClass: text('source_class', {
      enum: ['catalog_seed', 'deterministic_placeholder', 'model_generated', 'operator'],
    })
      .notNull()
      .default('deterministic_placeholder'),
    ...timestamps,
  },
  (t) => [index('decision_trees_company_idx').on(t.companyId, t.createdAt)],
);

/**
 * Compile lineage (execution-agent-compile.md): one row per compile attempt,
 * compiled or blocked, with the v1 block reason taxonomy preserved verbatim.
 */
export const compileEvents = pgTable(
  'compile_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    treeId: uuid('tree_id')
      .notNull()
      .references(() => decisionTrees.id),
    result: text('result', { enum: ['compiled', 'blocked'] }).notNull(),
    blockReason: text('block_reason', {
      enum: [
        'incomplete_branch',
        'unsupported_order_class',
        'missing_recovery_ladder',
        'price_precision_mismatch',
        'policy_mismatch',
        'missing_context',
        'portfolio_heat_exceeded',
      ],
    }),
    instructionId: uuid('instruction_id').references(() => actionInstructions.id),
    lineage: jsonb('lineage').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('compile_events_company_idx').on(t.companyId, t.createdAt)],
);
