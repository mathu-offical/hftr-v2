/**
 * JSON Schema for Mistral assistant proposal path (llm-pipeline §7).
 * Models emit amountFrom spans only — never raw amountCents.
 */
export const ASSISTANT_PROPOSAL_SCHEMA_REF = 'assistant_proposal.v1';

export const ASSISTANT_PROPOSAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposal', 'rationale'],
  properties: {
    proposal: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['tool'],
          properties: {
            tool: {
              type: 'string',
              enum: [
                'create_module',
                'update_module_config',
                'link_modules',
                'set_policy',
                'allocate_funds',
                'create_watchlist',
                'trigger_tier',
                'rename_module',
                'add_watchlist_item',
              ],
            },
            type: { type: 'string' },
            name: { type: 'string' },
            moduleId: { type: 'string', format: 'uuid' },
            config: { type: 'object', additionalProperties: true },
            configPatch: { type: 'object', additionalProperties: true },
            canvasPosition: {
              type: 'object',
              additionalProperties: false,
              properties: { x: { type: 'number' }, y: { type: 'number' } },
            },
            fromModuleId: { type: 'string', format: 'uuid' },
            toModuleId: { type: 'string', format: 'uuid' },
            linkKind: {
              type: 'string',
              enum: ['data_feed', 'directive', 'verification', 'fund_route'],
            },
            policyEnvelopeRef: { type: 'string' },
            notes: { type: 'string' },
            fromKind: { type: 'string', enum: ['module', 'company_pool', 'reserve'] },
            toKind: { type: 'string', enum: ['module', 'company_pool', 'reserve'] },
            amountFrom: {
              type: 'object',
              additionalProperties: false,
              required: ['messageId', 'spanStart', 'spanEnd'],
              properties: {
                messageId: { type: 'string', format: 'uuid' },
                spanStart: { type: 'integer', minimum: 0 },
                spanEnd: { type: 'integer', minimum: 1 },
              },
            },
            symbols: { type: 'array', items: { type: 'string' } },
            symbol: { type: 'string' },
            bias: { type: 'string', enum: ['long', 'short', 'neutral'] },
            note: { type: 'string' },
          },
        },
      ],
    },
    rationale: { type: 'string', maxLength: 500 },
    noProposalReason: { type: 'string', maxLength: 200 },
  },
} as const satisfies Record<string, unknown>;

export const ASSISTANT_PROPOSAL_SYSTEM_PROMPT = `You are the hftr company assistant. Propose at most one bounded write tool call per turn.
Never emit raw financial numbers — for allocate_funds use amountFrom with messageId and character span indices only.
If the user request is read-only or ambiguous, return proposal: null with noProposalReason.
Use module UUIDs from the company digest when provided.`;
