import type { z } from 'zod';
import type { CompanyLlmPolicy, LlmCallOutcome, LlmCallRequest } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { invoke } from './invoke';

export interface CallSchemaOptions<T> {
  db: Db;
  clerkUserId: string;
  companyPolicy: CompanyLlmPolicy;
  request: LlmCallRequest;
  outputSchema: z.ZodType<T>;
  systemPrompt: string;
  jsonSchema?: Record<string, unknown>;
  leakWhitelist?: readonly string[];
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * callSchema — thin wrapper around invoke for schema-locked model calls.
 */
export async function callSchema<T>(opts: CallSchemaOptions<T>): Promise<LlmCallOutcome> {
  return invoke({
    db: opts.db,
    clerkUserId: opts.clerkUserId,
    companyPolicy: opts.companyPolicy,
    request: opts.request,
    outputSchema: opts.outputSchema,
    systemPrompt: opts.systemPrompt,
    ...(opts.jsonSchema !== undefined ? { jsonSchema: opts.jsonSchema } : {}),
    ...(opts.leakWhitelist !== undefined ? { leakWhitelist: opts.leakWhitelist } : {}),
    ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
}
