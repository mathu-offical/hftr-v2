import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';

export class GdeltNewsError extends Error {
  constructor(
    public readonly code: 'http_error' | 'rate_limited' | 'parse_error' | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'GdeltNewsError';
  }
}

export interface FetchGdeltNewsParams {
  query: string;
  limit: number;
  fetchImpl?: typeof fetch;
}

interface GdeltArticle {
  title?: string;
  url?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

const QUALITATIVE_TITLE_FALLBACK = 'GDELT global news item';
const QUALITATIVE_SUMMARY_FALLBACK =
  'GDELT news item for qualitative review; numeric detail redacted.';

function sanitizeQualitativeField(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  const redacted = redactDigitHeavyText(trimmed);
  if (leakLint({ text: redacted }, []).ok) {
    return redacted;
  }
  return fallback;
}

function buildGdeltUrl(query: string, maxRecords: number): string {
  const q = encodeURIComponent(query.trim() || 'markets');
  return (
    `https://api.gdeltproject.org/api/v2/doc/doc` +
    `?query=${q}&mode=ArtList&format=json&maxrecords=${maxRecords}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGdeltOnce(url: string, fetchFn: typeof fetch): Promise<Response> {
  try {
    return await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'hftr-v2-research/1.0',
      },
    });
  } catch {
    throw new GdeltNewsError('network_error');
  }
}

/**
 * Fetch global news from GDELT DOC 2.0 ArtList.
 * On HTTP 429: one retry after 1.5s; still 429 throws rate_limited.
 */
export async function fetchGdeltNews(params: FetchGdeltNewsParams): Promise<EvidencePackage[]> {
  const limit = Math.min(Math.max(1, params.limit), 50);
  const fetchFn = params.fetchImpl ?? fetch;
  const url = buildGdeltUrl(params.query, limit);

  let res = await fetchGdeltOnce(url, fetchFn);
  if (res.status === 429) {
    await sleep(1500);
    res = await fetchGdeltOnce(url, fetchFn);
    if (res.status === 429) {
      throw new GdeltNewsError('rate_limited');
    }
  }

  if (!res.ok) {
    throw new GdeltNewsError('http_error', `status:${res.status}`);
  }

  let articles: GdeltArticle[];
  try {
    const body = (await res.json()) as unknown;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('articles' in body) ||
      !Array.isArray((body as { articles: unknown }).articles)
    ) {
      throw new GdeltNewsError('parse_error');
    }
    articles = (body as { articles: GdeltArticle[] }).articles;
  } catch (err) {
    if (err instanceof GdeltNewsError) throw err;
    throw new GdeltNewsError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.gdelt_news;

  return articles.slice(0, limit).map((item, index) => {
    const title = sanitizeQualitativeField(
      item.title,
      `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`,
    );
    const domainHint = item.domain?.trim()
      ? `Source domain: ${item.domain.trim()}.`
      : 'Global news context for qualitative review.';
    const summary = sanitizeQualitativeField(undefined, domainHint);

    return normalizeToEvidencePackage({
      sourceKind: 'gdelt_news',
      feedClass,
      title: title || `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`,
      summary,
      externalRef: item.url ?? null,
      authorityClass: 'PROVIDER_ANALYZED',
    });
  });
}
