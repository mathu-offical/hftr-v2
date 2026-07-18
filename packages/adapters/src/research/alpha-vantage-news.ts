import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';
import { extractTickerFromQuery } from './alpaca-bars-evidence';

export class AlphaVantageNewsError extends Error {
  constructor(
    public readonly code:
      | 'missing_credentials'
      | 'http_error'
      | 'parse_error'
      | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AlphaVantageNewsError';
  }
}

export interface FetchAlphaVantageNewsParams {
  query?: string;
  symbols?: string[];
  limit?: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface AlphaVantageNewsRow {
  title?: string;
  summary?: string;
  url?: string;
  source?: string;
}

const QUALITATIVE_SUMMARY_FALLBACK =
  'Alpha Vantage news sentiment item; numeric detail redacted.';
const QUALITATIVE_TITLE_FALLBACK = 'Alpha Vantage market news';

function sanitizeQualitativeField(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  const redacted = redactDigitHeavyText(trimmed);
  if (leakLint({ text: redacted }, []).ok) {
    return redacted;
  }
  return fallback;
}

function buildAlphaVantageUrl(params: {
  apiKey: string;
  limit: number;
  tickers: string[];
}): string {
  const base =
    'https://www.alphavantage.co/query' +
    `?function=NEWS_SENTIMENT&limit=${params.limit}` +
    `&apikey=${encodeURIComponent(params.apiKey)}`;
  if (params.tickers.length === 0) return base;
  return `${base}&tickers=${encodeURIComponent(params.tickers.join(','))}`;
}

/**
 * Alpha Vantage news sentiment — qualitative headlines only.
 */
export async function fetchAlphaVantageNews(
  params: FetchAlphaVantageNewsParams,
): Promise<EvidencePackage[]> {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    throw new AlphaVantageNewsError('missing_credentials');
  }

  const limit = Math.min(Math.max(1, params.limit ?? 8), 50);
  const symbol = extractTickerFromQuery(params.query ?? '');
  const tickers =
    params.symbols && params.symbols.length > 0
      ? params.symbols.map((s) => s.toUpperCase())
      : symbol
        ? [symbol]
        : [];

  const fetchFn = params.fetchImpl ?? fetch;
  const url = buildAlphaVantageUrl({ apiKey, limit, tickers });

  let res: Response;
  try {
    res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    throw new AlphaVantageNewsError('network_error');
  }

  if (!res.ok) {
    throw new AlphaVantageNewsError('http_error', `status:${res.status}`);
  }

  let rows: AlphaVantageNewsRow[];
  try {
    const body = (await res.json()) as { feed?: AlphaVantageNewsRow[] };
    if (!body.feed || !Array.isArray(body.feed)) {
      throw new AlphaVantageNewsError('parse_error');
    }
    rows = body.feed;
  } catch (err) {
    if (err instanceof AlphaVantageNewsError) throw err;
    throw new AlphaVantageNewsError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.alpha_vantage_news;
  const tickerHint = tickers[0] ? ` (${tickers[0]})` : '';

  return rows.slice(0, limit).map((item, index) => {
    const title = sanitizeQualitativeField(
      item.title,
      `${QUALITATIVE_TITLE_FALLBACK}${tickerHint}`.trim(),
    );
    const summary = sanitizeQualitativeField(
      item.summary,
      item.source
        ? `News from ${item.source} for qualitative review.`
        : QUALITATIVE_SUMMARY_FALLBACK,
    );

    return normalizeToEvidencePackage({
      sourceKind: 'alpha_vantage_news',
      feedClass,
      title: title || `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`,
      summary,
      externalRef: item.url ?? null,
      authorityClass: 'PROVIDER_ANALYZED',
    });
  });
}
