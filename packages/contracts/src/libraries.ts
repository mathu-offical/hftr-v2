import { z } from 'zod';
import { ConceptLinkRelation } from './research-artifacts';

/** Curation lifecycle for a concept inside a library. */
export const CurationStatus = z.enum(['proposed', 'accepted', 'rejected', 'archived']);
export type CurationStatus = z.infer<typeof CurationStatus>;

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
  sourceClass: z.enum(['deterministic_placeholder', 'model_generated', 'operator']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LibraryConcept = z.infer<typeof LibraryConcept>;

export const CurateLibraryConceptInput = z.object({
  conceptId: z.string().uuid(),
  curationStatus: CurationStatus,
});
export type CurateLibraryConceptInput = z.infer<typeof CurateLibraryConceptInput>;

export const ResearchTopic = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  parentTopicId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  status: z.enum(['active', 'archived', 'deferred']).default('active'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  provenance: z.string().max(200).nullable().default(null),
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
});
export type CreateResearchTopicInput = z.infer<typeof CreateResearchTopicInput>;

export const ResearchGraphNode = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  sourceClass: z.enum(['deterministic_placeholder', 'model_generated', 'operator']),
  status: z.string(),
});
export type ResearchGraphNode = z.infer<typeof ResearchGraphNode>;

export const ResearchGraphLink = z.object({
  id: z.string().uuid(),
  fromConceptId: z.string().uuid(),
  toConceptId: z.string().uuid(),
  relation: ConceptLinkRelation,
  weightBand: z.enum(['weak', 'typical', 'strong']),
  sourceClass: z.enum(['deterministic_placeholder', 'model_generated', 'operator']),
});
export type ResearchGraphLink = z.infer<typeof ResearchGraphLink>;

export const ResearchGraphResponse = z.object({
  nodes: z.array(ResearchGraphNode),
  links: z.array(ResearchGraphLink),
  tags: z.array(z.string()),
});
export type ResearchGraphResponse = z.infer<typeof ResearchGraphResponse>;

export const ObsidianExportNote = z.object({
  filename: z.string(),
  markdown: z.string(),
});
export type ObsidianExportNote = z.infer<typeof ObsidianExportNote>;
