import type { z } from 'zod';
import { LlmCallOutcome, LlmCallRequest } from '@hftr/contracts';
import { leakLint } from '@hftr/engine';
import { apiKeyForProvider, modelForTier } from './models';
import { ProviderError, rawCall } from './providers';

/**
 * callSchema — the ONLY way any code talks to a model (llm-pipeline.md).
 * Input must already be numeric-substituted (ValueRef handles + descriptors);
 * output is schema-parsed then leak-linted. Fails closed on every violation.
 */

export interface CallSchemaOptions<T> {
  request: LlmCallRequest;
  outputSchema: z.ZodType<T>;
  systemPrompt: string;
  /** JSONPath-style whitelist for display-only fields allowed to carry digits. */
  leakWhitelist?: readonly string[];
  maxTokens?: number;
  timeoutMs?: number;
}

const RETRYABLE_ATTEMPTS = 2;

export async function callSchema<T>(opts: CallSchemaOptions<T>): Promise<LlmCallOutcome> {
  const request = LlmCallRequest.parse(opts.request);
  const { provider, model } = modelForTier(request.tier);
  const apiKey = apiKeyForProvider(provider);
  const startedAt = performance.now();

  const base: Omit<LlmCallOutcome, 'ok' | 'output' | 'failure'> = {
    provider,
    model,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
  };

  if (!apiKey) {
    return { ...base, ok: false, output: null, failure: 'provider_error' };
  }

  const userPayload = JSON.stringify({
    orientation: request.orientation, // read-only context; may be echoed, never computed on
    input: request.input,
  });

  let lastFailure: LlmCallOutcome['failure'] = 'provider_error';
  for (let attempt = 1; attempt <= RETRYABLE_ATTEMPTS; attempt++) {
    let text: string;
    try {
      const raw = await rawCall({
        provider,
        model,
        apiKey,
        system: opts.systemPrompt,
        user: userPayload,
        maxTokens: opts.maxTokens ?? 4096,
        timeoutMs: opts.timeoutMs ?? 60_000,
      });
      base.tokensIn += raw.tokensIn;
      base.tokensOut += raw.tokensOut;
      text = raw.text;
    } catch (err) {
      if (err instanceof ProviderError && err.retryable && attempt < RETRYABLE_ATTEMPTS) continue;
      return {
        ...base,
        ok: false,
        output: null,
        failure: 'provider_error',
        latencyMs: elapsed(startedAt),
      };
    }

    const parsed = safeJsonParse(text);
    const validated = parsed === undefined ? null : opts.outputSchema.safeParse(parsed);
    if (!validated || !validated.success) {
      lastFailure = 'schema_validation_failed';
      continue; // one structured retry, then fail closed
    }

    const lint = leakLint(validated.data, opts.leakWhitelist ?? []);
    if (!lint.ok) {
      // Leaks are never retried into acceptance — the response is rejected.
      return {
        ...base,
        ok: false,
        output: null,
        failure: 'numeric_leak',
        latencyMs: elapsed(startedAt),
      };
    }

    return {
      ...base,
      ok: true,
      output: validated.data,
      failure: null,
      latencyMs: elapsed(startedAt),
    };
  }

  return { ...base, ok: false, output: null, failure: lastFailure, latencyMs: elapsed(startedAt) };
}

function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    // Some providers wrap JSON in fences despite json mode.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
