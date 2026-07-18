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
  {
    name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    requiredIn: ['dev', 'preview', 'prod'],
    consumer: 'apps/web',
  },
  { name: 'CLERK_SECRET_KEY', requiredIn: ['dev', 'preview', 'prod'], consumer: 'apps/web' },
  { name: 'DEV_AUTH_BYPASS', requiredIn: [], consumer: 'apps/web (dev-only auth bypass)' },
  {
    name: 'CRON_SECRET',
    requiredIn: ['preview', 'prod'],
    consumer: 'apps/web (queue drain, cron)',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    requiredIn: [],
    consumer: 'unused for auth (D-027 user keys only; CI smoke via HFTR_LLM_SMOKE)',
  },
  {
    name: 'MISTRAL_API_KEY',
    requiredIn: [],
    consumer: 'unused for auth (D-027 user keys only; CI smoke via HFTR_LLM_SMOKE)',
  },
  {
    name: 'GROQ_API_KEY',
    requiredIn: [],
    consumer: 'unused for auth (D-027 user keys only; CI smoke via HFTR_LLM_SMOKE)',
  },
  { name: 'ANTHROPIC_STRATEGIC_MODEL', requiredIn: [], consumer: '@hftr/llm (model id override)' },
  { name: 'MISTRAL_TACTICAL_MODEL', requiredIn: [], consumer: '@hftr/llm (model id override)' },
  { name: 'GROQ_EXECUTION_MODEL', requiredIn: [], consumer: '@hftr/llm (model id override)' },
  { name: 'HFTR_LLM_MODE', requiredIn: [], consumer: '@hftr/llm (deterministic|live)' },
  { name: 'CEREBRAS_API_KEY', requiredIn: [], consumer: 'unused for auth (D-027; CI smoke)' },
  { name: 'FIREWORKS_API_KEY', requiredIn: [], consumer: 'unused for auth (D-027; CI smoke)' },
  {
    name: 'OPENROUTER_API_KEY',
    requiredIn: [],
    consumer: 'unused for auth (D-027; CI smoke)',
  },
  {
    name: 'HFTR_LLM_SMOKE',
    requiredIn: [],
    consumer: 'scripts/smoke-llm-providers.mjs opt-in gate',
  },
  {
    name: 'BRAVE_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke + offline tooling (D-039 runtime: user keys)',
  },
  {
    name: 'MARKETAUX_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  {
    name: 'MARKET_NEWS_API_KEY',
    requiredIn: [],
    consumer: 'alias for MARKETAUX_API_KEY (CI smoke)',
  },
  {
    name: 'HFTR_RESEARCH_SMOKE',
    requiredIn: [],
    consumer: 'scripts/smoke-research-sources.mjs opt-in gate',
  },
  {
    name: 'FINNHUB_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  {
    name: 'POLYGON_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  {
    name: 'FRED_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  {
    name: 'ALPHA_VANTAGE_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  {
    name: 'TWELVE_DATA_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  {
    name: 'MARKETSTACK_API_KEY',
    requiredIn: [],
    consumer: 'CI smoke (D-039 runtime: user_research_keys)',
  },
  { name: 'STRIPE_SECRET_KEY', requiredIn: [], consumer: 'apps/web (billing, M4)' },
  { name: 'STRIPE_WEBHOOK_SECRET', requiredIn: [], consumer: 'apps/web (billing, M4)' },
  { name: 'ALPACA_PAPER_KEY', requiredIn: [], consumer: '@hftr/adapters (CI smoke tests)' },
  { name: 'ALPACA_PAPER_SECRET', requiredIn: [], consumer: '@hftr/adapters (CI smoke tests)' },
  {
    name: 'ALPACA_PAPER_SMOKE',
    requiredIn: [],
    consumer: 'scripts/smoke-alpaca-paper.mjs opt-in gate',
  },
  {
    name: 'CREDENTIALS_ENCRYPTION_KEY',
    requiredIn: ['preview', 'prod'],
    consumer: 'apps/web (broker credentials at rest)',
  },
  {
    name: 'SETTINGS_ENCRYPTION_KEY',
    requiredIn: ['preview', 'prod'],
    consumer: 'apps/web (per-user LLM API keys at rest)',
  },
] as const;
