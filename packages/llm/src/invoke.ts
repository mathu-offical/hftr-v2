import type { z } from 'zod';
import { CompanyLlmPolicy, leakLint, LlmCallOutcome, LlmCallRequest } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { loadArtifact, storeArtifact } from './artifacts';
import { admitBudget, budgetScopesForCall, consumeBudget } from './budget';
import { withUserApiKey } from './keys';
import { writeLlmCall } from './ledger';
import { actualCostCents, estimateCallCostCents, resolveModelForTier } from './models';
import { ProviderError, rawCall, type RawCallInput } from './providers';
import { substituteInput } from './substitute';

const RETRYABLE_ATTEMPTS = 2;

export interface InvokeOptions<T> {
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

function isDeterministicMode(): boolean {
  return process.env.HFTR_LLM_MODE === 'deterministic';
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function baseOutcome(capability: {
  provider: LlmCallOutcome['provider'];
  modelId: string;
  retentionClass: LlmCallOutcome['retentionClass'];
}): Omit<LlmCallOutcome, 'ok' | 'output' | 'failure'> {
  return {
    provider: capability.provider,
    model: capability.modelId,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    costCents: 0,
    requestId: null,
    retentionClass: capability.retentionClass,
    schemaValid: false,
    leakLintPassed: false,
  };
}

/**
 * Main LLM gateway — user keys only, schema-locked, budget-admitted, leak-linted.
 */
export async function invoke<T>(opts: InvokeOptions<T>): Promise<LlmCallOutcome> {
  const request = LlmCallRequest.parse(opts.request);
  const policy = CompanyLlmPolicy.parse(opts.companyPolicy);
  const startedAt = performance.now();

  const resolved = resolveModelForTier(
    policy,
    request.tier,
    request.provider !== undefined || request.modelId !== undefined
      ? {
          ...(request.provider !== undefined ? { provider: request.provider } : {}),
          ...(request.modelId !== undefined ? { modelId: request.modelId } : {}),
        }
      : undefined,
  );

  if (!resolved.ok) {
    const failure = resolved.failure;
    const fallback = resolveModelForTier(policy, request.tier);
    const provider = fallback.ok ? fallback.resolved.capability.provider : 'anthropic';
    const model = fallback.ok ? fallback.resolved.capability.modelId : 'unknown';
    return {
      provider,
      model,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: elapsed(startedAt),
      costCents: 0,
      requestId: null,
      retentionClass: null,
      schemaValid: false,
      leakLintPassed: false,
      ok: false,
      output: null,
      failure,
    };
  }

  const { capability } = resolved.resolved;
  const base = baseOutcome(capability);

  const cached = await loadArtifact(opts.db, request.idempotencyKey);
  if (cached) {
    const validated = opts.outputSchema.safeParse(cached.output);
    if (validated.success) {
      return {
        ...base,
        ok: true,
        output: validated.data,
        failure: null,
        latencyMs: elapsed(startedAt),
        schemaValid: true,
        leakLintPassed: true,
      };
    }
  }

  const hasKey = await withUserApiKey(
    opts.db,
    opts.clerkUserId,
    capability.provider,
    async () => true,
  );
  if (!hasKey) {
    if (!isDeterministicMode()) {
      await writeLlmCall(opts.db, {
        provider: capability.provider,
        model: capability.modelId,
        tier: request.tier,
        companyId: request.companyId,
        moduleId: request.moduleId,
        jobId: request.jobId,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        latencyMs: elapsed(startedAt),
        schemaValid: false,
        leakLintPassed: false,
        rateLimitRemaining: null,
        requestId: null,
        retentionClass: capability.retentionClass,
        failure: 'key_missing',
        idempotencyKey: request.idempotencyKey,
      });
    }
    return {
      ...base,
      ok: false,
      output: null,
      failure: 'key_missing',
      latencyMs: elapsed(startedAt),
    };
  }

  const scopes = budgetScopesForCall(opts.clerkUserId, request.companyId, request.moduleId);
  const estimatedCost = estimateCallCostCents(capability);
  const budget = await admitBudget(opts.db, scopes, capability.provider, estimatedCost);
  if (!budget.ok) {
    return {
      ...base,
      ok: false,
      output: null,
      failure: 'budget_exceeded',
      latencyMs: elapsed(startedAt),
    };
  }

  const substituted = substituteInput(request.input, opts.leakWhitelist ?? []);
  if (!substituted.ok) {
    return {
      ...base,
      ok: false,
      output: null,
      failure: 'numeric_leak',
      latencyMs: elapsed(startedAt),
    };
  }

  const userPayload = JSON.stringify({
    orientation: request.orientation,
    input: substituted.payload,
  });

  if (isDeterministicMode()) {
    return {
      ...base,
      ok: false,
      output: null,
      failure: 'provider_error',
      latencyMs: elapsed(startedAt),
    };
  }

  let lastFailure: LlmCallOutcome['failure'] = 'provider_error';
  let tokensIn = 0;
  let tokensOut = 0;
  let rateLimitRemaining: string | null = null;
  let requestId: string | null = null;

  const callResult = await withUserApiKey(
    opts.db,
    opts.clerkUserId,
    capability.provider,
    async (apiKey) => {
      for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
        let text: string;
        try {
          const rawInput: RawCallInput = {
            provider: capability.provider,
            model: capability.modelId,
            apiKey,
            system: opts.systemPrompt,
            user: userPayload,
            maxTokens: opts.maxTokens ?? 4096,
            timeoutMs: opts.timeoutMs ?? 60_000,
            transport: capability.transport,
            schemaMode: capability.schemaMode,
          };
          if (opts.jsonSchema !== undefined) {
            rawInput.jsonSchema = opts.jsonSchema;
          }
          const raw = await rawCall(rawInput);
          tokensIn += raw.tokensIn;
          tokensOut += raw.tokensOut;
          rateLimitRemaining = raw.rateLimitRemaining;
          requestId = raw.requestId;
          text = raw.text;
        } catch (err) {
          if (err instanceof ProviderError && err.retryable && attempt < RETRYABLE_ATTEMPTS) {
            continue;
          }
          return { ok: false as const, failure: 'provider_error' as const };
        }

        const parsed = safeJsonParse(text);
        const validated = parsed === undefined ? null : opts.outputSchema.safeParse(parsed);
        if (!validated || !validated.success) {
          lastFailure = 'schema_validation_failed';
          continue;
        }

        const lint = leakLint(validated.data, opts.leakWhitelist ?? []);
        if (!lint.ok) {
          return { ok: false as const, failure: 'numeric_leak' as const };
        }

        return { ok: true as const, output: validated.data };
      }
      return { ok: false as const, failure: lastFailure };
    },
  );

  const latencyMs = elapsed(startedAt);
  const costCents = actualCostCents(capability, tokensIn, tokensOut);

  if (!callResult || !callResult.ok) {
    const failure = callResult?.failure ?? 'provider_error';
    await writeLlmCall(opts.db, {
      provider: capability.provider,
      model: capability.modelId,
      tier: request.tier,
      companyId: request.companyId,
      moduleId: request.moduleId,
      jobId: request.jobId,
      tokensIn,
      tokensOut,
      costCents,
      latencyMs,
      schemaValid: failure === 'schema_validation_failed',
      leakLintPassed: failure !== 'numeric_leak',
      rateLimitRemaining,
      requestId,
      retentionClass: capability.retentionClass,
      failure,
      idempotencyKey: request.idempotencyKey,
    });
    return {
      ...base,
      tokensIn,
      tokensOut,
      costCents,
      latencyMs,
      requestId,
      schemaValid: failure === 'schema_validation_failed',
      leakLintPassed: failure !== 'numeric_leak',
      ok: false,
      output: null,
      failure,
    };
  }

  const llmCallId = await writeLlmCall(opts.db, {
    provider: capability.provider,
    model: capability.modelId,
    tier: request.tier,
    companyId: request.companyId,
    moduleId: request.moduleId,
    jobId: request.jobId,
    tokensIn,
    tokensOut,
    costCents,
    latencyMs,
    schemaValid: true,
    leakLintPassed: true,
    rateLimitRemaining,
    requestId,
    retentionClass: capability.retentionClass,
    failure: null,
    idempotencyKey: request.idempotencyKey,
  });

  await storeArtifact(opts.db, {
    idempotencyKey: request.idempotencyKey,
    companyId: request.companyId,
    schemaRef: request.schemaRef,
    provider: capability.provider,
    model: capability.modelId,
    output: callResult.output,
    llmCallId,
  });

  await consumeBudget(opts.db, scopes, capability.provider, costCents);

  return {
    ...base,
    tokensIn,
    tokensOut,
    costCents,
    latencyMs,
    requestId,
    schemaValid: true,
    leakLintPassed: true,
    ok: true,
    output: callResult.output,
    failure: null,
  };
}
