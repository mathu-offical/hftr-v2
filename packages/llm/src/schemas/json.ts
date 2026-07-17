import { ASSISTANT_PROPOSAL_JSON_SCHEMA } from '../assistant-tools';
/**
 * Hand-authored JSON Schema objects aligned with @hftr/contracts Zod types.
 * Used for provider structured-output hints — validation remains Zod-side.
 */

const CONCEPT_BATCH_V1 = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts', 'links', 'escalateToStrategic', 'escalateReason'],
  properties: {
    concepts: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'body', 'tags', 'sourceRef'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          body: { type: 'string', minLength: 1, maxLength: 8000 },
          tags: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 64 } },
          sourceRef: { type: ['string', 'null'], maxLength: 200 },
        },
      },
    },
    links: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fromTitle', 'toTitle', 'relation', 'weightBand'],
        properties: {
          fromTitle: { type: 'string', minLength: 1, maxLength: 200 },
          toTitle: { type: 'string', minLength: 1, maxLength: 200 },
          relation: {
            type: 'string',
            enum: ['supports', 'contradicts', 'causes', 'correlates', 'mentions', 'derived_from'],
          },
          weightBand: { type: 'string', enum: ['weak', 'typical', 'strong'] },
        },
      },
    },
    escalateToStrategic: { type: 'boolean' },
    escalateReason: {
      type: 'string',
      enum: ['low_confidence', 'high_stakes', 'ambiguous_regime', 'none'],
    },
  },
} as const satisfies Record<string, unknown>;

const TREE_EXPAND_V1 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'strategyFamily',
    'branchSummaries',
    'leverSelections',
    'escalateToStrategic',
    'escalateReason',
  ],
  properties: {
    strategyFamily: { type: 'string', minLength: 1, maxLength: 80 },
    branchSummaries: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'actionVerb', 'invalidationNotes'],
        properties: {
          id: { type: 'string', maxLength: 64 },
          label: { type: 'string', maxLength: 120 },
          actionVerb: { type: 'string', enum: ['buy', 'sell', 'hold', 'watch'] },
          invalidationNotes: {
            type: 'array',
            maxItems: 6,
            items: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    leverSelections: {
      type: 'array',
      maxItems: 32,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['leverId', 'bandPosition'],
        properties: {
          leverId: { type: 'string', maxLength: 80 },
          bandPosition: { type: 'string', enum: ['min', 'typical', 'max'] },
        },
      },
    },
    escalateToStrategic: { type: 'boolean' },
    escalateReason: {
      type: 'string',
      enum: ['low_confidence', 'high_stakes', 'ambiguous_regime', 'none'],
    },
  },
} as const satisfies Record<string, unknown>;

const COMPILE_V1 = {
  type: 'object',
  additionalProperties: false,
  required: ['orderShape', 'timeInForce', 'sizingBand', 'sizingPlanId', 'blockReasons'],
  properties: {
    orderShape: { type: 'string', enum: ['market', 'limit'] },
    timeInForce: { type: 'string', enum: ['day', 'gtc', 'ioc'] },
    sizingBand: { type: 'string', enum: ['min', 'typical', 'max'] },
    sizingPlanId: { type: 'string', maxLength: 80 },
    blockReasons: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 120 },
    },
  },
} as const satisfies Record<string, unknown>;

const JSON_SCHEMA_REGISTRY: Record<string, Record<string, unknown>> = {
  'concept_batch.v1': CONCEPT_BATCH_V1,
  'tree_expand.v1': TREE_EXPAND_V1,
  'compile.v1': COMPILE_V1,
  'assistant_proposal.v1': ASSISTANT_PROPOSAL_JSON_SCHEMA as Record<string, unknown>,
};

export function jsonSchemaForRef(schemaRef: string): Record<string, unknown> | undefined {
  return JSON_SCHEMA_REGISTRY[schemaRef];
}
