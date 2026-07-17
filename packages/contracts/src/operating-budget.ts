import { z } from 'zod';
import { LlmProvider } from './llm';

export const LlmBudgetSummary = z.object({
  provider: LlmProvider,
  credentialSource: z.enum(['user_key', 'environment', 'unconfigured']),
  maxCalls: z.number().int().nonnegative().nullable(),
  consumedCalls: z.number().int().nonnegative(),
  maxCostCents: z.number().int().nonnegative().nullable(),
  consumedCostCents: z.number().int().nonnegative(),
  windowMinutes: z.number().int().positive().nullable(),
  windowStartedAt: z.string().datetime().nullable(),
});
export type LlmBudgetSummary = z.infer<typeof LlmBudgetSummary>;

export const LlmBudgetsResponse = z.object({
  providers: z.array(LlmBudgetSummary).length(3),
});
export type LlmBudgetsResponse = z.infer<typeof LlmBudgetsResponse>;
