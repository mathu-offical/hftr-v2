import type { LlmProvider, SchemaMode, TransportFamily } from '@hftr/contracts';

/**
 * Provider transports for user-key inference. Auth is always via caller-supplied
 * apiKey — never environment variables.
 */

export interface RawCallInput {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  transport: TransportFamily;
  schemaMode: SchemaMode;
  /** JSON Schema object when structured output is required. */
  jsonSchema?: Record<string, unknown>;
}

export interface RawCallOutput {
  text: string;
  tokensIn: number;
  tokensOut: number;
  rateLimitRemaining: string | null;
  requestId: string | null;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** Auth / credential rejection — safe to try a continuity fallback provider. */
  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

const OPENAI_COMPAT_BASE: Record<
  Extract<LlmProvider, 'groq' | 'cerebras' | 'fireworks' | 'openrouter'>,
  string
> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  cerebras: 'https://api.cerebras.ai/v1/chat/completions',
  fireworks: 'https://api.fireworks.ai/inference/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

export async function rawCall(input: RawCallInput): Promise<RawCallOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    switch (input.transport) {
      case 'anthropic_messages':
        return await callAnthropic(input, controller.signal);
      case 'mistral_chat':
        return await callMistral(input, controller.signal);
      case 'openai_compatible':
        return await callOpenAiCompatible(input, controller.signal);
      default: {
        const _exhaustive: never = input.transport;
        throw new Error(_exhaustive);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(input: RawCallInput, signal: AbortSignal): Promise<RawCallOutput> {
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens,
    system: input.system,
    messages: [{ role: 'user', content: input.user }],
  };

  if (input.jsonSchema && input.schemaMode === 'json_schema_strict') {
    body.output_config = {
      format: {
        type: 'json_schema',
        schema: input.jsonSchema,
      },
    };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ProviderError(
      `anthropic ${res.status}`,
      res.status === 429 || res.status >= 500,
      res.status,
    );
  }

  const parsed = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = parsed.content.find((c) => c.type === 'text')?.text ?? '';

  return {
    text,
    tokensIn: parsed.usage.input_tokens,
    tokensOut: parsed.usage.output_tokens,
    rateLimitRemaining: res.headers.get('anthropic-ratelimit-requests-remaining'),
    requestId: res.headers.get('request-id') ?? res.headers.get('x-request-id'),
  };
}

async function callMistral(input: RawCallInput, signal: AbortSignal): Promise<RawCallOutput> {
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
  };

  if (input.jsonSchema && input.schemaMode === 'json_schema_strict') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'output',
        strict: true,
        schema: input.jsonSchema,
      },
    };
  } else if (input.schemaMode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ProviderError(
      `mistral ${res.status}`,
      res.status === 429 || res.status >= 500,
      res.status,
    );
  }

  return parseOpenAiCompatibleResponse(res, input.provider);
}

async function callOpenAiCompatible(
  input: RawCallInput,
  signal: AbortSignal,
): Promise<RawCallOutput> {
  const url = openAiCompatibleUrl(input.provider);
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ],
  };

  if (input.jsonSchema && input.schemaMode === 'json_schema_strict') {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'output',
        strict: true,
        schema: input.jsonSchema,
      },
    };
  } else if (input.schemaMode === 'json_object' || input.schemaMode === 'json_schema_strict') {
    body.response_format = { type: 'json_object' };
  }

  if (input.provider === 'openrouter') {
    body.provider = { zdr: true, data_collection: 'deny' };
  }

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: openAiCompatibleHeaders(input.provider, input.apiKey),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new ProviderError(
      `${input.provider} ${res.status}`,
      res.status === 429 || res.status >= 500,
      res.status,
    );
  }

  return parseOpenAiCompatibleResponse(res, input.provider);
}

function openAiCompatibleUrl(provider: LlmProvider): string {
  switch (provider) {
    case 'groq':
    case 'cerebras':
    case 'fireworks':
    case 'openrouter':
      return OPENAI_COMPAT_BASE[provider];
    case 'anthropic':
    case 'mistral':
      throw new Error(`provider ${provider} is not openai_compatible`);
    default: {
      const _exhaustive: never = provider;
      throw new Error(_exhaustive);
    }
  }
}

function openAiCompatibleHeaders(provider: LlmProvider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://hftr.app';
    headers['X-Title'] = 'hftr-v2';
  }
  return headers;
}

async function parseOpenAiCompatibleResponse(
  res: Response,
  provider: LlmProvider,
): Promise<RawCallOutput> {
  const body = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text: body.choices[0]?.message.content ?? '',
    tokensIn: body.usage.prompt_tokens,
    tokensOut: body.usage.completion_tokens,
    rateLimitRemaining: res.headers.get('x-ratelimit-remaining-requests'),
    requestId: res.headers.get('x-request-id'),
  };
}
