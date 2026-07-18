import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';

export class FinnhubNewsError extends Error {
  constructor(
    public readonly code:
      | 'missing_credentials'
      | 'http_error'
      | 'parse_error'
      | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FinnhubNewsError';
  }
}

export interface FetchFinnhubNewsParams {
  query?: string;
  symbols?: string[];
  limit: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface FinnhubNewsRecord {
  id?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  category?: string;
}

const QUALITATIVE_SUMMARY_FALLBACK =
  'Finnhub news item for qualitative review; numeric detail redacted.';
const QUALITATIVE_TITLE_FALLBACK = 'Finnhub market news';

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

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildFinnhubUrl(params: {
  apiKey: string;
  symbol: string | null;
}): string {
  const token = encodeURIComponent(params.apiKey);
  if (params.symbol) {
    const from = isoDateDaysAgo(30);
    const to = isoDateDaysAgo(0);
    return (
      `https://finnhub.io/api/v1/company-news` +
      `?symbol=${encodeURIComponent(params.symbol)}` +
      `&from=${from}&to=${to}&token=${token}`
    );
  }
  return `https://finnhub.io/api/v1/news?category=general&token=${token}`;
}

/**
 * Fetch news from Finnhub company-news or general category feed.
 * Maps headline/summary to leak-linted EvidencePackage rows.
 */
export async function fetchFinnhubNews(
  params: FetchFinnhubNewsParams,
): Promise<EvidencePackage[]> {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    throw new FinnhubNewsError('missing_credentials');
  }

  const limit = Math.min(Math.max(1, params.limit), 50);
  const symbols =
    params.symbols && params.symbols.length > 0
      ? params.symbols.map((s) => s.toUpperCase())
      : extractSymbolsFromQuery(params.query);
  const symbol = symbols[0] ?? null;

  const fetchFn = params.fetchImpl ?? fetch;
  const url = buildFinnhubUrl({ apiKey, symbol });

  let res: Response;
  try {
    res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    throw new FinnhubNewsError('network_error');
  }

  if (!res.ok) {
    throw new FinnhubNewsError('http_error', `status:${res.status}`);
  }

  let records: FinnhubNewsRecord[];
  try {
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new FinnhubNewsError('parse_error');
    }
    records = body as FinnhubNewsRecord[];
  } catch (err) {
    if (err instanceof FinnhubNewsError) throw err;
    throw new FinnhubNewsError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.finnhub_news;
  const symbolHint = symbol ? ` (${symbol})` : '';

  return records.slice(0, limit).map((item, index) => {
    const title = sanitizeQualitativeField(
      item.headline,
      `${QUALITATIVE_TITLE_FALLBACK}${symbolHint}`.trim(),
    );
    const summary = sanitizeQualitativeField(
      item.summary,
      item.source
        ? `News from ${item.source} for qualitative review.`
        : QUALITATIVE_SUMMARY_FALLBACK,
    );

    return normalizeToEvidencePackage({
      sourceKind: 'finnhub_news',
      feedClass,
      title: title || `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`,
      summary,
      externalRef: item.url ?? (item.id != null ? `finnhub-news:${item.id}` : null),
      authorityClass: 'PROVIDER_ANALYZED',
    });
  });
}
