/**
 * Environment variable manifest. A contracts test asserts `.env.example`
 * contains exactly these names (fixing v1's env drift; TD tech-decisions).
 */

export type EnvRequirement = {
  name: string;
  requiredIn: ReadonlyArray<'dev' | 'preview' | 'prod'>;
  consumer: string;
};

export const ENVIRONMENT_REQUIREMENTS: readonly EnvRequirement[] = [
  { name: 'DATABASE_URL', requiredIn: ['dev', 'preview', 'prod'], consumer: '@hftr/db' },
  { name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', requiredIn: ['dev', 'preview', 'prod'], consumer: 'apps/web' },
  { name: 'CLERK_SECRET_KEY', requiredIn: ['dev', 'preview', 'prod'], consumer: 'apps/web' },
  { name: 'CRON_SECRET', requiredIn: ['preview', 'prod'], consumer: 'apps/web (queue drain, cron)' },
  { name: 'ANTHROPIC_API_KEY', requiredIn: [], consumer: '@hftr/llm (strategic tier)' },
  { name: 'MISTRAL_API_KEY', requiredIn: [], consumer: '@hftr/llm (tactical/assistant tiers)' },
  { name: 'GROQ_API_KEY', requiredIn: [], consumer: '@hftr/llm (execution tier)' },
  { name: 'ANTHROPIC_STRATEGIC_MODEL', requiredIn: [], consumer: '@hftr/llm (override)' },
  { name: 'MISTRAL_TACTICAL_MODEL', requiredIn: [], consumer: '@hftr/llm (override)' },
  { name: 'GROQ_EXECUTION_MODEL', requiredIn: [], consumer: '@hftr/llm (override)' },
  { name: 'STRIPE_SECRET_KEY', requiredIn: [], consumer: 'apps/web (billing, M4)' },
  { name: 'STRIPE_WEBHOOK_SECRET', requiredIn: [], consumer: 'apps/web (billing, M4)' },
  { name: 'ALPACA_PAPER_KEY', requiredIn: [], consumer: '@hftr/adapters (CI smoke tests)' },
  { name: 'ALPACA_PAPER_SECRET', requiredIn: [], consumer: '@hftr/adapters (CI smoke tests)' },
  { name: 'CREDENTIALS_ENCRYPTION_KEY', requiredIn: ['preview', 'prod'], consumer: 'apps/web (broker credentials at rest)' },
] as const;
