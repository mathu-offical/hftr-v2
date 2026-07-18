#!/usr/bin/env node
/**
 * Opt-in credentialed smoke against LLM provider model-list endpoints.
 * Mirrors apps/web/lib/llm-verify.ts — never logs secret values.
 */
const HELP = `smoke-llm-providers — opt-in LLM provider connectivity smoke

Usage:
  node scripts/smoke-llm-providers.mjs [--help]
  pnpm smoke:llm

Environment (automation path):
  HFTR_LLM_SMOKE=1                Required to run (otherwise exits 0 with skip)
  ANTHROPIC_API_KEY               Optional — format check only (no models endpoint)
  MISTRAL_API_KEY                 Optional
  GROQ_API_KEY                    Optional
  CEREBRAS_API_KEY                Optional
  FIREWORKS_API_KEY               Optional
  OPENROUTER_API_KEY              Optional

Runtime inference uses user-saved keys only (D-027). Env keys are CI/smoke only.

Exits 0 when all present keys pass or none are set; non-zero if any present key fails auth.
`;

const MODELS_LIST_URL = {
  mistral: 'https://api.mistral.ai/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  cerebras: 'https://api.cerebras.ai/v1/models',
  fireworks: 'https://api.fireworks.ai/inference/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

/** @type {ReadonlyArray<{ envVar: string; provider: string }>} */
const PROVIDERS = [
  { envVar: 'ANTHROPIC_API_KEY', provider: 'anthropic' },
  { envVar: 'MISTRAL_API_KEY', provider: 'mistral' },
  { envVar: 'GROQ_API_KEY', provider: 'groq' },
  { envVar: 'CEREBRAS_API_KEY', provider: 'cerebras' },
  { envVar: 'FIREWORKS_API_KEY', provider: 'fireworks' },
  { envVar: 'OPENROUTER_API_KEY', provider: 'openrouter' },
];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (process.env.HFTR_LLM_SMOKE !== '1') {
  console.log('skip: set HFTR_LLM_SMOKE=1 to run credentialed LLM provider smoke');
  process.exit(0);
}

/**
 * @param {string} provider
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean; failure: string | null }>}
 */
async function verifyProviderKey(provider, apiKey) {
  if (apiKey.length < 8) {
    return { ok: false, failure: 'key_too_short' };
  }

  if (provider === 'anthropic') {
    if (!apiKey.startsWith('sk-ant-')) {
      return { ok: false, failure: 'invalid_key_format' };
    }
    return { ok: true, failure: null };
  }

  const url = MODELS_LIST_URL[provider];
  if (!url) {
    return { ok: false, failure: 'unsupported_provider' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    /** @type {Record<string, string>} */
    const headers = { authorization: `Bearer ${apiKey}` };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://hftr.app';
      headers['X-Title'] = 'hftr-v2';
    }
    const res = await fetch(url, { method: 'GET', signal: controller.signal, headers });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected' };
    }
    if (!res.ok) {
      return { ok: false, failure: `provider_http_${res.status}` };
    }
    return { ok: true, failure: null };
  } catch {
    return { ok: false, failure: 'ping_timeout' };
  } finally {
    clearTimeout(timer);
  }
}

let anyPresent = false;
let anyFailed = false;

for (const { envVar, provider } of PROVIDERS) {
  const raw = process.env[envVar] ?? '';
  const apiKey = raw.trim();
  if (!apiKey) {
    console.log(`${provider}: skip (no ${envVar})`);
    continue;
  }

  anyPresent = true;
  const outcome = await verifyProviderKey(provider, apiKey);
  if (outcome.ok) {
    console.log(`${provider}: ok`);
  } else {
    anyFailed = true;
    console.log(`${provider}: fail (${outcome.failure ?? 'unknown'})`);
  }
}

if (!anyPresent) {
  console.log('skip: no LLM API keys set in environment');
  process.exit(0);
}

process.exit(anyFailed ? 1 : 0);
