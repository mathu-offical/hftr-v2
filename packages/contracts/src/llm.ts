import { z } from 'zod';
import { TemporalOrientation } from './numeric';

/**
 * LLM tier contracts (agent-docs/architecture/llm-pipeline.md).
 * Every model call is schema-locked; numbers/datetimes are substituted before
 * the call and leak-linted after it.
 */

export const LlmTier = z.enum(['strategic', 'tactical', 'execution', 'assistant']);
export type LlmTier = z.infer<typeof LlmTier>;

export const LlmProvider = z.enum(['anthropic', 'mistral', 'groq']);
export type LlmProvider = z.infer<typeof LlmProvider>;

/** Fixed tier → provider mapping (D-003). */
export const TIER_PROVIDER: Record<LlmTier, LlmProvider> = {
  strategic: 'anthropic',
  tactical: 'mistral',
  execution: 'groq',
  assistant: 'mistral',
};

export const LlmCallRequest = z.object({
  tier: LlmTier,
  schemaRef: z.string(), // registered output schema id
  systemPromptId: z.string(),
  promptVersion: z.string(),
  input: z.unknown(), // already numeric-substituted payload
  orientation: TemporalOrientation,
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(8),
});
export type LlmCallRequest = z.infer<typeof LlmCallRequest>;

export const LlmCallOutcome = z.object({
  ok: z.boolean(),
  output: z.unknown().nullable(),
  failure: z
    .enum(['schema_validation_failed', 'numeric_leak', 'provider_error', 'budget_exceeded'])
    .nullable(),
  provider: LlmProvider,
  model: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});
export type LlmCallOutcome = z.infer<typeof LlmCallOutcome>;

export const BudgetScope = z.enum(['user', 'company', 'module']);

export const LlmBudgetWindow = z.object({
  scope: BudgetScope,
  scopeId: z.string(),
  provider: LlmProvider,
  windowMinutes: z.number().int().positive(),
  maxCalls: z.number().int().positive(),
  maxCostCents: z.number().int().positive(),
});
export type LlmBudgetWindow = z.infer<typeof LlmBudgetWindow>;
