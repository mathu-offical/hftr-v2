import type { z } from 'zod';
import {
  AssistantModelProposalOutput,
  CompileSelectionOutput,
  ConceptBatch,
  SuggestionThresholdProfile,
  TreeExpandOutput,
} from '@hftr/contracts';

export const SCHEMA_REFS = {
  conceptBatch: 'concept_batch.v1',
  treeExpand: 'tree_expand.v1',
  compile: 'compile.v1',
  assistantProposal: 'assistant_proposal.v1',
  suggestionThresholdProfile: 'suggestion_threshold_profile.v1',
} as const;

export type SchemaRef = (typeof SCHEMA_REFS)[keyof typeof SCHEMA_REFS];

const REGISTRY: Record<string, z.ZodType> = {
  [SCHEMA_REFS.conceptBatch]: ConceptBatch,
  [SCHEMA_REFS.treeExpand]: TreeExpandOutput,
  [SCHEMA_REFS.compile]: CompileSelectionOutput,
  [SCHEMA_REFS.assistantProposal]: AssistantModelProposalOutput,
  [SCHEMA_REFS.suggestionThresholdProfile]: SuggestionThresholdProfile,
};

export function schemaForRef(schemaRef: string): z.ZodType | undefined {
  return REGISTRY[schemaRef];
}

export function registerSchema(schemaRef: string, schema: z.ZodType): void {
  REGISTRY[schemaRef] = schema;
}

export { jsonSchemaForRef } from './json';

export { ConceptBatch, TreeExpandOutput, CompileSelectionOutput, SuggestionThresholdProfile };
