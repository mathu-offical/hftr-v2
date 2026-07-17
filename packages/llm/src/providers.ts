import { LlmProvider } from '@hftr/contracts';

/**
 * Minimal fetch-based provider clients. Anthropic uses the Messages API;
 * Mistral and Groq are OpenAI-compatible chat completions.
 */

export interface RawCallInput {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface RawCallOutput {
  text: string;
  tokensIn: number;
  tokensOut: number;
  rateLimitRemaining: string | null;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export async function rawCall(input: RawCallInput): Promise<RawCallOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    switch (input.provider) {
      case 'anthropic':
        return await callAnthropic(input, controller.signal);
      case 'mistral':
        return await callOpenAiCompatible(
          input,
          'https://api.mistral.ai/v1/chat/completions',
          controller.signal,
        );
      case 'groq':
        return await callOpenAiCompatible(
          input,
          'https://api.groq.com/openai/v1/chat/completions',
          controller.signal,
        );
      default: {
        const _exhaustive: never = input.provider;
        throw new Error(_exhaustive);
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(input: RawCallInput, signal: AbortSignal): Promise<RawCallOutput> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
    }),
  });
  if (!res.ok) {
    throw new ProviderError(`anthropic ${res.status}`, res.status === 429 || res.status >= 500);
  }
  const body = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };
  const text = body.content.find((c) => c.type === 'text')?.text ?? '';
  return {
    text,
    tokensIn: body.usage.input_tokens,
    tokensOut: body.usage.output_tokens,
    rateLimitRemaining: res.headers.get('anthropic-ratelimit-requests-remaining'),
  };
}

async function callOpenAiCompatible(
  input: RawCallInput,
  url: string,
  signal: AbortSignal,
): Promise<RawCallOutput> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: input.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
    }),
  });
  if (!res.ok) {
    throw new ProviderError(
      `${input.provider} ${res.status}`,
      res.status === 429 || res.status >= 500,
    );
  }
  const body = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: body.choices[0]?.message.content ?? '',
    tokensIn: body.usage.prompt_tokens,
    tokensOut: body.usage.completion_tokens,
    rateLimitRemaining: res.headers.get('x-ratelimit-remaining-requests'),
  };
}
