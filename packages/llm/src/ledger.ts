import type { LlmCallFailure, LlmProvider, RetentionClass } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { llmCalls } from '@hftr/db/schema';

export interface WriteLlmCallInput {
  provider: LlmProvider;
  model: string;
  tier: 'strategic' | 'tactical' | 'execution' | 'assistant';
  companyId: string | null;
  moduleId: string | null;
  jobId: string | null;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  latencyMs: number;
  schemaValid: boolean;
  leakLintPassed: boolean;
  rateLimitRemaining: string | null;
  requestId: string | null;
  retentionClass: RetentionClass | null;
  failure: LlmCallFailure | null;
  idempotencyKey: string | null;
}

/** Persist call metadata — never prompts, outputs, or secrets. */
export async function writeLlmCall(db: Db, input: WriteLlmCallInput): Promise<string> {
  const rows = await db
    .insert(llmCalls)
    .values({
      provider: input.provider,
      model: input.model,
      tier: input.tier,
      companyId: input.companyId,
      moduleId: input.moduleId,
      jobId: input.jobId,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costCents: input.costCents,
      latencyMs: input.latencyMs,
      schemaValid: input.schemaValid,
      leakLintPassed: input.leakLintPassed,
      rateLimitRemaining: input.rateLimitRemaining,
      requestId: input.requestId,
      retentionClass: input.retentionClass,
      failure: input.failure,
      idempotencyKey: input.idempotencyKey,
    })
    .returning({ id: llmCalls.id });

  return rows[0]!.id;
}
