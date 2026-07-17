import { LlmProvider, LlmTier, TIER_PROVIDER } from '@hftr/contracts';

/** Default models per tier; overridable via env (see .env.example). */
const DEFAULT_MODELS: Record<LlmTier, string> = {
  strategic: 'claude-sonnet-4-5',
  tactical: 'mistral-medium-latest',
  execution: 'llama-3.3-70b-versatile',
  assistant: 'mistral-medium-latest',
};

const MODEL_ENV: Partial<Record<LlmTier, string>> = {
  strategic: 'ANTHROPIC_STRATEGIC_MODEL',
  tactical: 'MISTRAL_TACTICAL_MODEL',
  execution: 'GROQ_EXECUTION_MODEL',
};

export function modelForTier(tier: LlmTier): { provider: LlmProvider; model: string } {
  const envName = MODEL_ENV[tier];
  const override = envName ? process.env[envName] : undefined;
  return { provider: TIER_PROVIDER[tier], model: override || DEFAULT_MODELS[tier] };
}

export function apiKeyForProvider(provider: LlmProvider): string | undefined {
  switch (provider) {
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'mistral':
      return process.env.MISTRAL_API_KEY;
    case 'groq':
      return process.env.GROQ_API_KEY;
    default: {
      const _exhaustive: never = provider;
      throw new Error(_exhaustive);
    }
  }
}
