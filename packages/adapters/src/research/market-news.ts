import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage } from './normalize';

export class MarketNewsError extends Error {
  constructor(
    public readonly code: 'http_error' | 'parse_error' | 'network_error' | 'no_source',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'MarketNewsError';
  }
}

export interface FetchMarketNewsOptions {
  query: string;
  maxResults?: number;
  fetchImpl?: typeof fetch;
  feedUrl?: string;
  apiKey?: string;
  allowDeterministicFallback?: boolean;
}

interface MarketauxArticle {
  title?: string;
  description?: string;
  url?: string;
  source?: string;
}

interface MarketauxResponse {
  data?: MarketauxArticle[];
}

interface StubNewsItem {
  title?: string;
  summary?: string;
  url?: string;
}

function buildDeterministicStubs(query: string, count: number): EvidencePackage[] {
  const trimmed = query.trim() || 'market';
  const stubs: Array<{ title: string; summary: string }> = [
    {
      title: `Public market context — ${trimmed}`,
      summary:
        'Qualitative stub: general market sentiment band unavailable without live feed entitlement.',
    },
    {
      title: `Sector backdrop — ${trimmed}`,
      summary:
        'Qualitative stub: sector-level narrative placeholder for offline or unconfigured gather.',
    },
    {
      title: `Headline scan — ${trimmed}`,
      summary:
        'Qualitative stub: headline inventory not fetched; configure market news API or feed URL.',
    },
  ];

  return stubs.slice(0, count).map((stub) =>
    normalizeToEvidencePackage({
      sourceKind: 'market_news',
      feedClass: 'market_news_public_stub',
      title: stub.title,
      summary: stub.summary,
      externalRef: null,
      authorityClass: 'CURATED_BACKGROUND',
      legalUseClass: 'REVIEW_REQUIRED',
    }),
  );
}

async function fetchMarketaux(
  opts: FetchMarketNewsOptions,
  count: number,
): Promise<EvidencePackage[]> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const key = opts.apiKey!.trim();
  const url =
    `https://api.marketaux.com/v1/news/all` +
    `?api_token=${encodeURIComponent(key)}` +
    `&search=${encodeURIComponent(opts.query)}` +
    `&limit=${count}`;

  const res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new MarketNewsError('http_error', `status:${res.status}`);
  }

  let body: MarketauxResponse;
  try {
    body = (await res.json()) as MarketauxResponse;
  } catch {
    throw new MarketNewsError('parse_error');
  }

  const articles = body.data ?? [];
  return articles.slice(0, count).map((article, index) =>
    normalizeToEvidencePackage({
      sourceKind: 'market_news',
      feedClass: 'market_news_public',
      title: article.title?.trim() || `Market news ${index + 1}`,
      summary:
        article.description?.trim() ||
        `News item from ${article.source ?? 'market feed'} for qualitative review.`,
      externalRef: article.url ?? null,
      authorityClass: 'PROVIDER_ANALYZED',
    }),
  );
}

async function fetchFeedUrl(
  opts: FetchMarketNewsOptions,
  count: number,
): Promise<EvidencePackage[]> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(opts.feedUrl!, {
    method: 'GET',
    headers: { Accept: 'application/json, application/rss+xml, text/xml, */*' },
  });

  if (!res.ok) {
    throw new MarketNewsError('http_error', `status:${res.status}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (
    contentType.includes('json') ||
    text.trimStart().startsWith('{') ||
    text.trimStart().startsWith('[')
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new MarketNewsError('parse_error');
    }

    const items: StubNewsItem[] = Array.isArray(parsed)
      ? (parsed as StubNewsItem[])
      : ((parsed as { items?: StubNewsItem[] }).items ?? []);

    return items.slice(0, count).map((item, index) =>
      normalizeToEvidencePackage({
        sourceKind: 'market_news',
        feedClass: 'market_news_public',
        title: item.title?.trim() || `Feed item ${index + 1}`,
        summary: item.summary?.trim() || 'News feed item for qualitative review.',
        externalRef: item.url ?? null,
        authorityClass: 'PROVIDER_ANALYZED',
      }),
    );
  }

  // Minimal RSS title/description extraction (no XML parser dependency)
  const titleMatches = [...text.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi)];
  const descMatches = [
    ...text.matchAll(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/gi),
  ];

  const packages: EvidencePackage[] = [];
  const start = titleMatches.length > 1 ? 1 : 0;
  for (let i = start; i < titleMatches.length && packages.length < count; i++) {
    const title = titleMatches[i]![1]!.replace(/<[^>]+>/g, '').trim();
    const summary =
      descMatches[i]?.[1]?.replace(/<[^>]+>/g, '').trim() ||
      'RSS news item for qualitative review.';
    if (!title) continue;
    packages.push(
      normalizeToEvidencePackage({
        sourceKind: 'market_news',
        feedClass: 'market_news_public',
        title,
        summary,
        externalRef: null,
        authorityClass: 'PROVIDER_ANALYZED',
      }),
    );
  }

  return packages;
}

/**
 * Model-free market news gather — Marketaux when keyed, feed URL, or honest stubs.
 */
export async function fetchMarketNews(opts: FetchMarketNewsOptions): Promise<EvidencePackage[]> {
  const count = Math.min(Math.max(1, opts.maxResults ?? 5), 20);

  if (opts.apiKey?.trim()) {
    return fetchMarketaux(opts, count);
  }

  if (opts.feedUrl?.trim()) {
    try {
      return await fetchFeedUrl(opts, count);
    } catch (err) {
      if (opts.allowDeterministicFallback) {
        return buildDeterministicStubs(opts.query, count);
      }
      throw err;
    }
  }

  if (opts.allowDeterministicFallback) {
    return buildDeterministicStubs(opts.query, count);
  }

  throw new MarketNewsError('no_source', 'no apiKey, feedUrl, or deterministic fallback');
}
