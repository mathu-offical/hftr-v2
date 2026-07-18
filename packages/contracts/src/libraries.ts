import { z } from 'zod';
import { ConceptLinkRelation } from './research-artifacts';

/** Provenance for curated concepts / concept links (honest; never dresses seeds as model output). */
export const ConceptSourceClass = z.enum([
  'catalog_seed',
  'deterministic_placeholder',
  'model_generated',
  'operator',
]);
export type ConceptSourceClass = z.infer<typeof ConceptSourceClass>;

/** Curation lifecycle for a concept inside a library. */
export const CurationStatus = z.enum([
  'proposed',
  'accepted',
  'auto_admitted',
  'rejected',
  'archived',
]);
export type CurationStatus = z.infer<typeof CurationStatus>;

/** Qualitative operator confidence for concepts and topics (NRA — no numeric scores). */
export const ConfidenceBand = z.enum(['low', 'medium', 'high']);
export type ConfidenceBand = z.infer<typeof ConfidenceBand>;

export const Library = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  /** Optional canvas library module binding. */
  moduleId: z.string().uuid().nullable(),
  name: z.string().min(1).max(120),
  topicScope: z.string().max(200).default(''),
  masterLibrary: z.boolean().default(false),
  status: z.enum(['active', 'archived']).default('active'),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Library = z.infer<typeof Library>;

export const CreateLibraryInput = z.object({
  name: z.string().min(1).max(120),
  topicScope: z.string().max(200).default(''),
  masterLibrary: z.boolean().default(false),
  moduleId: z.string().uuid().optional(),
});
export type CreateLibraryInput = z.infer<typeof CreateLibraryInput>;

export const PatchLibraryInput = z.object({
  name: z.string().min(1).max(120).optional(),
  topicScope: z.string().max(200).optional(),
  masterLibrary: z.boolean().optional(),
  status: z.enum(['active', 'archived']).optional(),
  moduleId: z.string().uuid().nullable().optional(),
});
export type PatchLibraryInput = z.infer<typeof PatchLibraryInput>;

export const LibraryConcept = z.object({
  id: z.string().uuid(),
  libraryId: z.string().uuid(),
  conceptId: z.string().uuid(),
  curationStatus: CurationStatus,
  title: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourceClass: ConceptSourceClass.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LibraryConcept = z.infer<typeof LibraryConcept>;

export const CurateLibraryConceptInput = z.object({
  conceptId: z.string().uuid(),
  curationStatus: CurationStatus,
});
export type CurateLibraryConceptInput = z.infer<typeof CurateLibraryConceptInput>;

/** Query / reference telemetry for topics and concepts (D-040). */
export const KnowledgeUsage = z.object({
  queryCount: z.number().int().nonnegative().default(0),
  lastQueriedAt: z.string().nullable().default(null),
  referenceCount: z.number().int().nonnegative().default(0),
  lastReferencedAt: z.string().nullable().default(null),
});
export type KnowledgeUsage = z.infer<typeof KnowledgeUsage>;

export const ResearchTopic = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  parentTopicId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  status: z.enum(['active', 'archived', 'deferred']).default('active'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  provenance: z.string().max(200).nullable().default(null),
  /** Hybrid article agent synopsis (markdown with inline wikilinks). */
  synopsisMd: z.string().default(''),
  conceptCount: z.number().int().nonnegative().optional(),
  queryCount: z.number().int().nonnegative().default(0),
  lastQueriedAt: z.string().nullable().default(null),
  referenceCount: z.number().int().nonnegative().default(0),
  lastReferencedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResearchTopic = z.infer<typeof ResearchTopic>;

export const CreateResearchTopicInput = z.object({
  moduleId: z.string().uuid(),
  parentTopicId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  provenance: z.string().max(200).nullable().optional(),
  synopsisMd: z.string().max(50_000).optional(),
});
export type CreateResearchTopicInput = z.infer<typeof CreateResearchTopicInput>;

export const PatchResearchTopicInput = z.object({
  title: z.string().min(1).max(200).optional(),
  parentTopicId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'archived', 'deferred']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  provenance: z.string().max(200).nullable().optional(),
  synopsisMd: z.string().max(50_000).optional(),
});
export type PatchResearchTopicInput = z.infer<typeof PatchResearchTopicInput>;

/** Ordered concept membership inside a topic (D-040). */
export const TopicConcept = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  conceptId: z.string().uuid(),
  sortOrder: z.number().int().nonnegative().default(0),
  role: z.string().max(80).nullable().default(null),
  title: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  curationStatus: CurationStatus.nullable().optional(),
  primaryLibraryId: z.string().uuid().nullable().optional(),
  queryCount: z.number().int().nonnegative().optional(),
  referenceCount: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TopicConcept = z.infer<typeof TopicConcept>;

export const PutTopicConceptsInput = z.object({
  concepts: z
    .array(
      z.object({
        conceptId: z.string().uuid(),
        sortOrder: z.number().int().nonnegative().optional(),
        role: z.string().max(80).nullable().optional(),
      }),
    )
    .max(500),
});
export type PutTopicConceptsInput = z.infer<typeof PutTopicConceptsInput>;

export const ResearchTopicDetail = ResearchTopic.extend({
  memberships: z.array(TopicConcept).default([]),
});
export type ResearchTopicDetail = z.infer<typeof ResearchTopicDetail>;

export const ResearchGraphNode = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  sourceClass: ConceptSourceClass,
  status: z.string(),
  /** Opaque source handle (evidence/catalog/operator) when known. */
  sourceRef: z.string().nullable().optional(),
  /** Research run lineage when concept was synthesized from the bus (D-039). */
  researchRunId: z.string().uuid().nullable().optional(),
  /**
   * Text-first library admission label when joined to library_concepts.
   * Absent when the concept is not yet in any library.
   */
  curationStatus: z
    .enum(['proposed', 'accepted', 'auto_admitted', 'rejected', 'archived'])
    .nullable()
    .optional(),
  /** Primary library nest for hard nested galaxy layout (D-040). */
  primaryLibraryId: z.string().uuid().nullable().optional(),
  /** Secondary library memberships (badges; not duplicate nodes). */
  secondaryLibraryIds: z.array(z.string().uuid()).optional(),
  queryCount: z.number().int().nonnegative().optional(),
  referenceCount: z.number().int().nonnegative().optional(),
  lastQueriedAt: z.string().nullable().optional(),
  lastReferencedAt: z.string().nullable().optional(),
  confidenceBand: ConfidenceBand.optional(),
});
export type ResearchGraphNode = z.infer<typeof ResearchGraphNode>;

export const ArchiveResearchInput = z.object({
  action: z.enum([
    'archive_runtime',
    'clear_archive',
    'archive_object',
    'restore_object',
    'verify_object',
    'refine_object',
  ]),
  objectKind: z.enum(['concept', 'topic', 'library']).optional(),
  objectId: z.string().uuid().optional(),
  /** Optional refined concept body (refine_object + concept). Leak-linted server-side. */
  body: z.string().max(50_000).optional(),
  /** Optional refined topic synopsis (refine_object + topic). Leak-linted server-side. */
  synopsisMd: z.string().max(50_000).optional(),
});
export type ArchiveResearchInput = z.infer<typeof ArchiveResearchInput>;

export const ResearchGraphLink = z.object({
  id: z.string().uuid(),
  fromConceptId: z.string().uuid(),
  toConceptId: z.string().uuid(),
  relation: ConceptLinkRelation,
  weightBand: z.enum(['weak', 'typical', 'strong']),
  sourceClass: ConceptSourceClass,
});
export type ResearchGraphLink = z.infer<typeof ResearchGraphLink>;

/** Library nest metadata for hard nested galaxy layout (D-040). */
export const ResearchGraphLibraryNest = z.object({
  id: z.string().uuid(),
  name: z.string(),
  masterLibrary: z.boolean(),
  topicScope: z.string().default(''),
  conceptCount: z.number().int().nonnegative().default(0),
});
export type ResearchGraphLibraryNest = z.infer<typeof ResearchGraphLibraryNest>;

export const ResearchGraphResponse = z.object({
  nodes: z.array(ResearchGraphNode),
  links: z.array(ResearchGraphLink),
  tags: z.array(z.string()),
  libraries: z.array(ResearchGraphLibraryNest).default([]),
});
export type ResearchGraphResponse = z.infer<typeof ResearchGraphResponse>;

export const ObsidianExportNote = z.object({
  filename: z.string(),
  markdown: z.string(),
});
export type ObsidianExportNote = z.infer<typeof ObsidianExportNote>;
