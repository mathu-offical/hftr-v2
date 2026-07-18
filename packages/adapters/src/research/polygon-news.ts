import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';

export class PolygonNewsError extends Error {
  constructor(
    public readonly code:
      | 'missing_credentials'
      | 'http_error'
      | 'parse_error'
      | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PolygonNewsError';
  }
}

export interface FetchPolygonNewsParams {
  query?: string;
  symbols?: string[];
  limit: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface PolygonNewsPublisher {
  name?: string;
}

interface PolygonNewsRecord {
  id?: string;
  title?: string;
  description?: string;
  article_url?: string;
  publisher?: PolygonNewsPublisher;
  tickers?: string[];
}

interface PolygonNewsResponse {
  results?: PolygonNewsRecord[] | null;
}

const QUALITATIVE_SUMMARY_FALLBACK =
  'Polygon news item for qualitative review; numeric detail redacted.';
const QUALITATIVE_TITLE_FALLBACK = 'Polygon market news';

function sanitizeQualitativeField(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  const redacted = redactDigitHeavyText(trimmed);
  if (leakLint({ text: redacted }, []).ok) {
    return redacted;
  }
  return fallback;
}

function extractSymbolsFromQuery(query: string | undefined): string[] {
  if (!query?.trim()) return [];
  const upper = query.toUpperCase();
  const symbols = new Set<string>();
  for (const match of upper.matchAll(/\$([A-Z]{1,5})\b/g)) {
    symbols.add(match[1]!);
  }
  for (const match of upper.matchAll(/\b([A-Z]{1,5})\b/g)) {
    const token = match[1]!;
    if (token.length >= 2) symbols.add(token);
  }
  return [...symbols].slice(0, 8);
}

/**
 * Fetch reference news from Polygon.io v2 API.
 * Maps title/description to leak-linted EvidencePackage rows.
 */
export async function fetchPolygonNews(
  params: FetchPolygonNewsParams,
): Promise<EvidencePackage[]> {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    throw new PolygonNewsError('missing_credentials');
  }

  const limit = Math.min(Math.max(1, params.limit), 50);
  const symbols =
    params.symbols && params.symbols.length > 0
      ? params.symbols.map((s) => s.toUpperCase())
      : extractSymbolsFromQuery(params.query);
  const ticker = symbols[0] ?? null;

  const search = new URLSearchParams();
  search.set('limit', String(limit));
  search.set('apiKey', apiKey);
  if (ticker) {
    search.set('ticker', ticker);
  }

  const url = `https://api.polygon.io/v2/reference/news?${search.toString()}`;
  const fetchFn = params.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    throw new PolygonNewsError('network_error');
  }

  if (!res.ok) {
    throw new PolygonNewsError('http_error', `status:${res.status}`);
  }

  let body: PolygonNewsResponse;
  try {
    body = (await res.json()) as PolygonNewsResponse;
  } catch {
    throw new PolygonNewsError('parse_error');
  }

  const records = body.results ?? [];
  if (!Array.isArray(records)) {
    throw new PolygonNewsError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.polygon_news;
  const symbolHint =
    ticker ??
    (symbols.length > 0 ? symbols.join(', ') : records[0]?.tickers?.join(', ') ?? '');

  return records.slice(0, limit).map((item, index) => {
    const hint = symbolHint ? ` (${symbolHint})` : '';
    const title = sanitizeQualitativeField(
      item.title,
      `${QUALITATIVE_TITLE_FALLBACK}${hint}`.trim(),
    );
    const summary = sanitizeQualitativeField(
      item.description,
      item.publisher?.name
        ? `News from ${item.publisher.name} for qualitative review.`
        : QUALITATIVE_SUMMARY_FALLBACK,
    );

    return normalizeToEvidencePackage({
      sourceKind: 'polygon_news',
      feedClass,
      title: title || `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`,
      summary,
      externalRef: item.article_url ?? (item.id != null ? `polygon-news:${item.id}` : null),
      authorityClass: 'PROVIDER_ANALYZED',
    });
  });
}
