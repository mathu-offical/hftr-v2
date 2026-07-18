import { z } from 'zod';
import { TemporalOrientation } from './numeric';

/**
 * LLM tier contracts (agent-docs/architecture/llm-pipeline.md).
 * Every model call is schema-locked; numbers/datetimes are substituted before
 * the call and leak-linted after it. Keys are user-supplied only (D-026).
 */

export const LlmTier = z.enum(['strategic', 'tactical', 'execution', 'assistant']);
export type LlmTier = z.infer<typeof LlmTier>;

/** Transport + account families that may hold a user API key. */
export const LlmProvider = z.enum([
  'anthropic',
  'mistral',
  'groq',
  'cerebras',
  'fireworks',
  'openrouter',
]);
export type LlmProvider = z.infer<typeof LlmProvider>;

/** How the provider claims to handle prompt/response retention. */
export const RetentionClass = z.enum([
  /** Default non-persistent / ZDR for open inference. */
  'default_zdr',
  /** ZDR available only after organization/account config + attestation. */
  'org_zdr_attested',
  /** Per-request ZDR routing (e.g. OpenRouter `zdr: true`). */
  'request_zdr',
  /** Retention not contractually clear — excluded from strict privacy mode. */
  'unclear',
  /** Known to retain (batch/fine-tune features); not used for live inference. */
  'retains',
]);
export type RetentionClass = z.infer<typeof RetentionClass>;

export const SchemaMode = z.enum(['json_schema_strict', 'json_object', 'tool_strict', 'none']);
export type SchemaMode = z.infer<typeof SchemaMode>;

export const TransportFamily = z.enum(['anthropic_messages', 'mistral_chat', 'openai_compatible']);
export type TransportFamily = z.infer<typeof TransportFamily>;

/**
 * Allowlisted model capability row. Arbitrary unreviewed model IDs are rejected;
 * registry refresh may update availability/cost without widening the allowlist.
 */
export const ModelCapability = z.object({
  provider: LlmProvider,
  modelId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  tiers: z.array(LlmTier).min(1),
  transport: TransportFamily,
  schemaMode: SchemaMode,
  retentionClass: RetentionClass,
  /** Rough USD cents per 1M input tokens for budget estimates. */
  inputCostCentsPerMTok: z.number().int().nonnegative(),
  outputCostCentsPerMTok: z.number().int().nonnegative(),
  /** Free-tier / trial eligible for operator cost profile. */
  freeTierAvailable: z.boolean().default(false),
  available: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});
export type ModelCapability = z.infer<typeof ModelCapability>;

export const PrivacyMode = z.enum(['strict_zdr', 'standard']);
export type PrivacyMode = z.infer<typeof PrivacyMode>;

/** Company-level tier → model selection (allowlisted IDs only). */
export const CompanyLlmPolicy = z.object({
  privacyMode: PrivacyMode.default('strict_zdr'),
  /** Operator attestation that Anthropic org ZDR (or equivalent) is enabled. */
  anthropicZdrAttested: z.boolean().default(false),
  tierModels: z
    .object({
      strategic: z.string().min(1).max(120).nullable().default(null),
      tactical: z.string().min(1).max(120).nullable().default(null),
      execution: z.string().min(1).max(120).nullable().default(null),
      assistant: z.string().min(1).max(120).nullable().default(null),
    })
    .default({}),
  profileId: z
    .enum(['privacy_cost', 'strict_compile', 'premium_quality', 'custom'])
    .default('privacy_cost'),
});
export type CompanyLlmPolicy = z.infer<typeof CompanyLlmPolicy>;

/** Default tier → provider mapping when no company override is set. */
export const TIER_PROVIDER: Record<LlmTier, LlmProvider> = {
  strategic: 'anthropic',
  tactical: 'mistral',
  execution: 'groq',
  assistant: 'mistral',
};

/**
 * Seed allowlist. Quality promotion requires paper scenario evaluation —
 * these are starting points, not marketing defaults.
 */
export const MODEL_CAPABILITY_REGISTRY: readonly ModelCapability[] = [
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    tiers: ['strategic'],
    transport: 'anthropic_messages',
    schemaMode: 'json_schema_strict',
    retentionClass: 'org_zdr_attested',
    inputCostCentsPerMTok: 300,
    outputCostCentsPerMTok: 1500,
    freeTierAvailable: false,
    available: true,
    notes: 'Requires organization ZDR attestation for strict privacy mode',
  },
  {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    displayName: 'Mistral Large',
    tiers: ['strategic', 'tactical', 'assistant'],
    transport: 'mistral_chat',
    schemaMode: 'json_schema_strict',
    retentionClass: 'unclear',
    inputCostCentsPerMTok: 200,
    outputCostCentsPerMTok: 600,
    freeTierAvailable: true,
    available: true,
    notes:
      'Primary tactical/assistant; strategic continuity fallback when Anthropic key missing (D-067). Excluded from explicit strict_zdr selection until retention is contractually clear; fallback path admits operator-saved Mistral key as continuity consent.',
  },
  {
    provider: 'mistral',
    modelId: 'mistral-medium-latest',
    displayName: 'Mistral Medium',
    tiers: ['tactical', 'assistant'],
    transport: 'mistral_chat',
    schemaMode: 'json_schema_strict',
    retentionClass: 'unclear',
    inputCostCentsPerMTok: 40,
    outputCostCentsPerMTok: 120,
    freeTierAvailable: true,
    available: true,
  },
  {
    provider: 'groq',
    modelId: 'openai/gpt-oss-20b',
    displayName: 'GPT-OSS 20B (Groq)',
    tiers: ['execution'],
    transport: 'openai_compatible',
    schemaMode: 'json_schema_strict',
    retentionClass: 'default_zdr',
    inputCostCentsPerMTok: 10,
    outputCostCentsPerMTok: 39,
    freeTierAvailable: true,
    available: true,
    notes: 'Strict json_schema; enable Groq Data Controls ZDR for abuse-log opt-out',
  },
  {
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B (Groq)',
    tiers: ['execution'],
    transport: 'openai_compatible',
    schemaMode: 'json_object',
    retentionClass: 'default_zdr',
    inputCostCentsPerMTok: 59,
    outputCostCentsPerMTok: 79,
    freeTierAvailable: true,
    available: true,
    notes: 'json_object only — Zod revalidation required; prefer gpt-oss-20b for compile',
  },
  {
    provider: 'cerebras',
    modelId: 'gpt-oss-120b',
    displayName: 'GPT-OSS 120B (Cerebras)',
    tiers: ['execution', 'tactical'],
    transport: 'openai_compatible',
    schemaMode: 'json_schema_strict',
    retentionClass: 'default_zdr',
    inputCostCentsPerMTok: 25,
    outputCostCentsPerMTok: 60,
    freeTierAvailable: true,
    available: true,
    notes: 'Privacy/cost profile candidate; free trial credits',
  },
  {
    provider: 'cerebras',
    modelId: 'zai-glm-4.7',
    displayName: 'GLM 4.7 (Cerebras)',
    tiers: ['tactical', 'execution'],
    transport: 'openai_compatible',
    schemaMode: 'json_schema_strict',
    retentionClass: 'default_zdr',
    inputCostCentsPerMTok: 25,
    outputCostCentsPerMTok: 60,
    freeTierAvailable: true,
    available: true,
  },
  {
    provider: 'fireworks',
    modelId: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    displayName: 'Llama 3.3 70B (Fireworks)',
    tiers: ['tactical', 'execution'],
    transport: 'openai_compatible',
    schemaMode: 'json_object',
    retentionClass: 'default_zdr',
    inputCostCentsPerMTok: 90,
    outputCostCentsPerMTok: 90,
    freeTierAvailable: false,
    available: true,
    notes: 'Default ZDR for open models',
  },
  {
    provider: 'openrouter',
    modelId: 'meta-llama/llama-3.3-70b-instruct',
    displayName: 'Llama 3.3 70B (OpenRouter ZDR)',
    tiers: ['tactical', 'execution'],
    transport: 'openai_compatible',
    schemaMode: 'json_object',
    retentionClass: 'request_zdr',
    inputCostCentsPerMTok: 12,
    outputCostCentsPerMTok: 12,
    freeTierAvailable: true,
    available: true,
    notes: 'Must force provider.zdr=true and data_collection=deny',
  },
] as const;

export function lookupModelCapability(
  provider: LlmProvider,
  modelId: string,
): ModelCapability | undefined {
  return MODEL_CAPABILITY_REGISTRY.find(
    (m) => m.provider === provider && m.modelId === modelId && m.available,
  );
}

export function modelsForTier(tier: LlmTier): ModelCapability[] {
  return MODEL_CAPABILITY_REGISTRY.filter((m) => m.available && m.tiers.includes(tier));
}

/** Whether a model may be used under the given privacy mode + company policy. */
export function admitsRetention(capability: ModelCapability, policy: CompanyLlmPolicy): boolean {
  if (policy.privacyMode === 'standard') {
    return capability.retentionClass !== 'retains';
  }
  switch (capability.retentionClass) {
    case 'default_zdr':
    case 'request_zdr':
      return true;
    case 'org_zdr_attested':
      return capability.provider === 'anthropic' ? policy.anthropicZdrAttested : false;
    case 'unclear':
    case 'retains':
      return false;
    default: {
      const _exhaustive: never = capability.retentionClass;
      return _exhaustive;
    }
  }
}

/**
 * When Anthropic is unavailable for strategic work, prefer Mistral Large
 * (higher-capability / longer-context substitute — D-067).
 */
export const STRATEGIC_CONTINUITY_FALLBACK: {
  provider: LlmProvider;
  modelId: string;
} = {
  provider: 'mistral',
  modelId: 'mistral-large-latest',
};

/** Token budget for strategic continuity fallback (longer reasoning than default tactical). */
export const STRATEGIC_FALLBACK_MAX_TOKENS = 8192;

/**
 * Retention gate for D-067 strategic continuity: when Claude is unavailable,
 * an operator-saved Mistral Large key is treated as consent to use that model
 * for strategic schema-locked calls (even under strict_zdr). Explicit
 * operator selection of Mistral in tierModels still uses admitsRetention.
 */
export function admitsStrategicContinuityFallback(
  capability: ModelCapability,
  _policy: CompanyLlmPolicy,
): boolean {
  if (
    capability.provider === STRATEGIC_CONTINUITY_FALLBACK.provider &&
    capability.modelId === STRATEGIC_CONTINUITY_FALLBACK.modelId
  ) {
    return capability.retentionClass !== 'retains';
  }
  return false;
}

export const DEFAULT_TIER_MODELS: Record<LlmTier, { provider: LlmProvider; modelId: string }> = {
  strategic: { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
  tactical: { provider: 'cerebras', modelId: 'zai-glm-4.7' },
  execution: { provider: 'groq', modelId: 'openai/gpt-oss-20b' },
  assistant: { provider: 'cerebras', modelId: 'zai-glm-4.7' },
};

export const LlmCallRequest = z.object({
  tier: LlmTier,
  schemaRef: z.string(),
  systemPromptId: z.string(),
  promptVersion: z.string(),
  input: z.unknown(),
  orientation: TemporalOrientation,
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  jobId: z.string().uuid().nullable(),
  idempotencyKey: z.string().min(8),
  /** When set, overrides default model for the tier (must be allowlisted). */
  modelId: z.string().min(1).max(120).optional(),
  provider: LlmProvider.optional(),
});
export type LlmCallRequest = z.infer<typeof LlmCallRequest>;

export const LlmCallFailure = z.enum([
  'schema_validation_failed',
  'numeric_leak',
  'provider_error',
  'budget_exceeded',
  'key_missing',
  'retention_blocked',
  'model_not_allowlisted',
]);
export type LlmCallFailure = z.infer<typeof LlmCallFailure>;

export const LlmCallOutcome = z.object({
  ok: z.boolean(),
  output: z.unknown().nullable(),
  failure: LlmCallFailure.nullable(),
  provider: LlmProvider,
  model: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative().default(0),
  requestId: z.string().nullable().default(null),
  retentionClass: RetentionClass.nullable().default(null),
  schemaValid: z.boolean().default(false),
  leakLintPassed: z.boolean().default(false),
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
