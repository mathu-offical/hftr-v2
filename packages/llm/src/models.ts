import {
  admitsRetention,
  admitsStrategicContinuityFallback,
  CompanyLlmPolicy,
  DEFAULT_TIER_MODELS,
  lookupModelCapability,
  LlmProvider,
  LlmTier,
  STRATEGIC_CONTINUITY_FALLBACK,
  type ModelCapability,
} from '@hftr/contracts';

export interface ResolvedModel {
  capability: ModelCapability;
  /** True when Anthropic was skipped for Mistral Large continuity (D-067). */
  usedStrategicFallback?: boolean;
}

export type ResolveModelFailure = 'model_not_allowlisted' | 'retention_blocked';

export function resolveModelForTier(
  policy: CompanyLlmPolicy,
  tier: LlmTier,
  overrides?: { provider?: LlmProvider; modelId?: string },
): { ok: true; resolved: ResolvedModel } | { ok: false; failure: ResolveModelFailure } {
  const parsedPolicy = CompanyLlmPolicy.parse(policy);
  const tierOverride = parsedPolicy.tierModels[tier];
  const defaultRow = DEFAULT_TIER_MODELS[tier];

  const provider = overrides?.provider ?? defaultRow.provider;
  const modelId = overrides?.modelId ?? tierOverride ?? defaultRow.modelId;

  const capability = lookupModelCapability(provider, modelId);
  if (!capability) {
    return { ok: false, failure: 'model_not_allowlisted' };
  }
  if (!capability.tiers.includes(tier)) {
    return { ok: false, failure: 'model_not_allowlisted' };
  }
  if (!admitsRetention(capability, parsedPolicy)) {
    return { ok: false, failure: 'retention_blocked' };
  }
  return { ok: true, resolved: { capability } };
}

/**
 * Resolve Mistral Large for strategic continuity when Anthropic cannot run.
 * Uses continuity retention gate (D-067), not the stricter admitsRetention path.
 */
export function resolveStrategicContinuityFallback(
  policy: CompanyLlmPolicy,
): { ok: true; resolved: ResolvedModel } | { ok: false; failure: ResolveModelFailure } {
  const parsedPolicy = CompanyLlmPolicy.parse(policy);
  const capability = lookupModelCapability(
    STRATEGIC_CONTINUITY_FALLBACK.provider,
    STRATEGIC_CONTINUITY_FALLBACK.modelId,
  );
  if (!capability || !capability.tiers.includes('strategic')) {
    return { ok: false, failure: 'model_not_allowlisted' };
  }
  if (!admitsStrategicContinuityFallback(capability, parsedPolicy)) {
    return { ok: false, failure: 'retention_blocked' };
  }
  return {
    ok: true,
    resolved: { capability, usedStrategicFallback: true },
  };
}

/** Rough pre-call cost estimate for budget admission (1k in / 2k out tokens). */
export function estimateCallCostCents(capability: ModelCapability): number {
  const tokensIn = 1_000;
  const tokensOut = 2_000;
  return Math.max(
    1,
    Math.ceil(
      (tokensIn * capability.inputCostCentsPerMTok +
        tokensOut * capability.outputCostCentsPerMTok) /
        1_000_000,
    ),
  );
}

export function actualCostCents(
  capability: ModelCapability,
  tokensIn: number,
  tokensOut: number,
): number {
  return Math.ceil(
    (tokensIn * capability.inputCostCentsPerMTok + tokensOut * capability.outputCostCentsPerMTok) /
      1_000_000,
  );
}
