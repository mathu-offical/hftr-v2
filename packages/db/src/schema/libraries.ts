import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, modules } from './companies';
import { concepts } from './knowledge';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Company-scoped research libraries (domain entity; optional canvas module bind). */
export const libraries = pgTable(
  'libraries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    moduleId: uuid('module_id').references(() => modules.id),
    name: text('name').notNull(),
    topicScope: text('topic_scope').notNull().default(''),
    masterLibrary: boolean('master_library').notNull().default(false),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    ...timestamps,
  },
  (t) => [
    index('libraries_company_idx').on(t.companyId, t.createdAt),
    uniqueIndex('libraries_company_name_unique').on(t.companyId, t.name),
  ],
);

/** Join of concept membership + curation status inside a library. */
export const libraryConcepts = pgTable(
  'library_concepts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    libraryId: uuid('library_id')
      .notNull()
      .references(() => libraries.id),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id),
    curationStatus: text('curation_status', {
      enum: ['proposed', 'accepted', 'auto_admitted', 'rejected', 'archived'],
    })
      .notNull()
      .default('proposed'),
    researchRunId: uuid('research_run_id'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('library_concepts_unique').on(t.libraryId, t.conceptId),
    index('library_concepts_library_idx').on(t.libraryId, t.curationStatus),
  ],
);

/** Hierarchical research topics owned by a research module. */
export const researchTopics = pgTable(
  'research_topics',
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
    parentTopicId: uuid('parent_topic_id'),
    title: text('title').notNull(),
    status: text('status', { enum: ['active', 'archived', 'deferred'] })
      .notNull()
      .default('active'),
    priority: text('priority', { enum: ['low', 'normal', 'high'] })
      .notNull()
      .default('normal'),
    provenance: text('provenance'),
    /** Hybrid article synopsis (D-040). */
    synopsisMd: text('synopsis_md').notNull().default(''),
    queryCount: integer('query_count').notNull().default(0),
    lastQueriedAt: timestamp('last_queried_at', { withTimezone: true }),
    referenceCount: integer('reference_count').notNull().default(0),
    lastReferencedAt: timestamp('last_referenced_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('research_topics_module_idx').on(t.moduleId, t.status),
    index('research_topics_company_idx').on(t.companyId, t.createdAt),
  ],
);

/** Ordered concept membership inside a topic (D-040). */
export const topicConcepts = pgTable(
  'topic_concepts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => researchTopics.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    role: text('role'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('topic_concepts_unique').on(t.topicId, t.conceptId),
    index('topic_concepts_topic_idx').on(t.topicId, t.sortOrder),
    index('topic_concepts_concept_idx').on(t.conceptId),
  ],
);
