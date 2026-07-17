import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage } from './normalize';

export class BraveSearchError extends Error {
  constructor(
    public readonly code: 'missing_api_key' | 'http_error' | 'parse_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'BraveSearchError';
  }
}

export interface SearchBraveOptions {
  query: string;
  apiKey: string;
  maxResults?: number;
  fetchImpl?: typeof fetch;
}

interface BraveWebResult {
  title?: string;
  description?: string;
  url?: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

/**
 * Model-free Brave web search → EvidencePackage[].
 */
export async function searchBrave(opts: SearchBraveOptions): Promise<EvidencePackage[]> {
  const key = opts.apiKey?.trim();
  if (!key) {
    throw new BraveSearchError('missing_api_key');
  }

  const count = Math.min(Math.max(1, opts.maxResults ?? 5), 20);
  const fetchFn = opts.fetchImpl ?? fetch;
  const url =
    `https://api.search.brave.com/res/v1/web/search` +
    `?q=${encodeURIComponent(opts.query)}` +
    `&count=${count}`;

  const res = await fetchFn(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': key,
    },
  });

  if (!res.ok) {
    throw new BraveSearchError('http_error', `status:${res.status}`);
  }

  let body: BraveSearchResponse;
  try {
    body = (await res.json()) as BraveSearchResponse;
  } catch {
    throw new BraveSearchError('parse_error');
  }

  const results = body.web?.results ?? [];
  return results.slice(0, count).map((hit, index) =>
    normalizeToEvidencePackage({
      sourceKind: 'brave_search',
      feedClass: 'brave_search',
      title: hit.title?.trim() || `Web result ${index + 1}`,
      summary: hit.description?.trim() || 'No description available.',
      externalRef: hit.url ?? null,
      authorityClass: 'PROVIDER_ANALYZED',
    }),
  );
}
