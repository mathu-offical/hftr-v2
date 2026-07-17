import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyLlmPolicy, LlmCallRequest } from '@hftr/contracts';
import { ConceptBatch } from '@hftr/contracts';
import { llmArtifacts, llmBudgets, userApiKeys } from '@hftr/db/schema';
import { encryptSecret } from '@hftr/secrets';
import * as substituteModule from './substitute';
import { invoke } from './invoke';
import { resolveModelForTier } from './models';
import { rawCall } from './providers';
import { substituteInput } from './substitute';

const HEX_KEY = 'c'.repeat(64);

const basePolicy: CompanyLlmPolicy = {
  privacyMode: 'standard',
  anthropicZdrAttested: false,
  tierModels: {
    strategic: null,
    tactical: null,
    execution: null,
    assistant: null,
  },
  profileId: 'privacy_cost',
};

const baseRequest: LlmCallRequest = {
  tier: 'execution',
  schemaRef: 'concept_batch.v1',
  systemPromptId: 'compile.v1',
  promptVersion: '1',
  input: { note: 'allocate via nv_abc' },
  orientation: {
    nowIso: '2026-07-17T16:00:00.000Z',
    venueTimezone: 'America/New_York',
    sessionPhase: 'open',
    timeToClose: 'ample',
  },
  companyId: '00000000-0000-4000-8000-000000000001',
  moduleId: null,
  jobId: null,
  idempotencyKey: 'idem-test-key-001',
};

function mockDb(
  overrides: {
    apiKey?: string | null;
    budget?: {
      maxCalls: number;
      maxCostCents: number;
      consumedCalls?: number;
      consumedCostCents?: number;
    } | null;
    artifact?: unknown | null;
  } = {},
) {
  const apiKey =
    overrides.apiKey === null
      ? null
      : encryptSecret(overrides.apiKey ?? 'sk-test-key-abcdef', 'llm_settings');

  const budget = overrides.budget ?? null;
  const artifact = overrides.artifact ?? null;

  const state = {
    keys: apiKey
      ? [
          {
            ciphertext: apiKey.ciphertext,
          },
        ]
      : [],
    artifacts: artifact
      ? [
          {
            output: artifact,
            provider: 'groq' as const,
            model: 'openai/gpt-oss-20b',
            schemaRef: 'concept_batch.v1',
          },
        ]
      : [],
    budgets: budget
      ? [
          {
            id: 'budget-1',
            scope: 'user' as const,
            scopeId: 'user_123',
            provider: 'groq' as const,
            windowMinutes: 60,
            maxCalls: budget.maxCalls,
            maxCostCents: budget.maxCostCents,
            consumedCalls: budget.consumedCalls ?? 0,
            consumedCostCents: budget.consumedCostCents ?? 0,
            windowStartedAt: new Date(),
          },
        ]
      : [],
  };

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === userApiKeys) return state.keys;
            if (table === llmArtifacts) return state.artifacts;
            if (table === llmBudgets) return state.budgets;
            return [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: 'call-1' }],
        onConflictDoNothing: async () => undefined,
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
  };

  return { db: db as never, state };
}

describe('resolveModelForTier', () => {
  it('uses DEFAULT_TIER_MODELS when no override', () => {
    const result = resolveModelForTier(basePolicy, 'execution');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolved.capability.provider).toBe('groq');
      expect(result.resolved.capability.modelId).toBe('openai/gpt-oss-20b');
    }
  });

  it('blocks mistral in strict_zdr without attestation', () => {
    const strictPolicy: CompanyLlmPolicy = {
      ...basePolicy,
      privacyMode: 'strict_zdr',
    };
    const result = resolveModelForTier(strictPolicy, 'tactical', {
      provider: 'mistral',
      modelId: 'mistral-large-latest',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('retention_blocked');
    }
  });
});

describe('substituteInput', () => {
  it('replaces digits and preserves nv_ handles', () => {
    const result = substituteInput({ amount: 500, ref: 'nv_abc', note: 'price is $12.50' });
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      amount: 'qualitative_numeric_descriptor',
      ref: 'nv_abc',
      note: 'qualitative_numeric_descriptor',
    });
  });
});

describe('rawCall openrouter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends provider zdr and data_collection deny', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => (name === 'x-request-id' ? 'req-or-1' : null),
      },
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await rawCall({
      provider: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct',
      apiKey: 'sk-or-test',
      system: 'sys',
      user: 'user',
      maxTokens: 100,
      timeoutMs: 5000,
      transport: 'openai_compatible',
      schemaMode: 'json_object',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      provider: { zdr: boolean; data_collection: string };
    };
    expect(body.provider).toEqual({ zdr: true, data_collection: 'deny' });
  });
});

describe('invoke gateway', () => {
  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = HEX_KEY;
    delete process.env.HFTR_LLM_MODE;
  });

  afterEach(() => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    delete process.env.HFTR_LLM_MODE;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns key_missing when user has no API key', async () => {
    const { db } = mockDb({ apiKey: null });
    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe('key_missing');
  });

  it('returns budget_exceeded when window is exhausted', async () => {
    const { db } = mockDb({
      budget: { maxCalls: 1, maxCostCents: 100, consumedCalls: 1, consumedCostCents: 0 },
    });
    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe('budget_exceeded');
  });

  it('returns numeric_leak on input substitution failure', async () => {
    vi.spyOn(substituteModule, 'substituteInput').mockReturnValue({
      ok: false,
      payload: {},
      failure: 'numeric_leak',
    });
    const { db } = mockDb();
    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe('numeric_leak');
  });

  it('returns schema_validation_failed when provider JSON does not match', async () => {
    const { db } = mockDb();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          choices: [{ message: { content: '{"not":"valid"}' } }],
          usage: { prompt_tokens: 5, completion_tokens: 5 },
        }),
      }),
    );

    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe('schema_validation_failed');
  });

  it('returns numeric_leak when output contains digits', async () => {
    const { db } = mockDb();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  concepts: [{ title: 'A', body: 'allocate 500 dollars', tags: [] }],
                  links: [],
                  escalateToStrategic: false,
                  escalateReason: 'none',
                }),
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 5 },
        }),
      }),
    );

    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe('numeric_leak');
  });

  it('skips network in deterministic mode after key resolve', async () => {
    process.env.HFTR_LLM_MODE = 'deterministic';
    const { db } = mockDb();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.failure).toBe('provider_error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replays cached artifact by idempotency key', async () => {
    const cached = {
      concepts: [{ title: 'Cached', body: 'qualitative only', tags: [], sourceRef: null }],
      links: [],
      escalateToStrategic: false,
      escalateReason: 'none' as const,
    };
    const { db } = mockDb({ artifact: cached });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await invoke({
      db,
      clerkUserId: 'user_123',
      companyPolicy: basePolicy,
      request: baseRequest,
      outputSchema: ConceptBatch,
      systemPrompt: 'test',
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.output).toEqual(cached);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
