import type { LlmProvider } from '@hftr/contracts';

const MODELS_LIST_URL: Partial<
  Record<Extract<LlmProvider, 'mistral' | 'groq' | 'cerebras' | 'fireworks' | 'openrouter'>, string>
> = {
  mistral: 'https://api.mistral.ai/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  cerebras: 'https://api.cerebras.ai/v1/models',
  fireworks: 'https://api.fireworks.ai/inference/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

export interface LlmKeyVerifyOutcome {
  ok: boolean;
  failure: string | null;
  deferred: boolean;
}

/**
 * Decrypt-then-verify user LLM keys. Never logs or returns plaintext.
 * Anthropic has no spend-free models endpoint — format + decrypt only.
 */
export async function verifyLlmProviderKey(
  provider: LlmProvider,
  apiKey: string,
): Promise<LlmKeyVerifyOutcome> {
  if (apiKey.length < 8) {
    return { ok: false, failure: 'key_too_short', deferred: true };
  }

  if (provider === 'anthropic') {
    if (!apiKey.startsWith('sk-ant-')) {
      return { ok: false, failure: 'invalid_key_format', deferred: true };
    }
    return { ok: true, failure: null, deferred: true };
  }

  const url = MODELS_LIST_URL[provider as keyof typeof MODELS_LIST_URL];
  if (!url) {
    return { ok: false, failure: 'unsupported_provider', deferred: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://hftr.app';
      headers['X-Title'] = 'hftr-v2';
    }
    const res = await fetch(url, { method: 'GET', signal: controller.signal, headers });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, failure: 'auth_rejected', deferred: false };
    }
    if (!res.ok) {
      return { ok: false, failure: `provider_http_${res.status}`, deferred: false };
    }
    return { ok: true, failure: null, deferred: false };
  } catch {
    return { ok: false, failure: 'ping_timeout', deferred: false };
  } finally {
    clearTimeout(timer);
  }
}
