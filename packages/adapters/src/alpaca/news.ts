import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { createAlpacaClient, type AlpacaClient } from './client';
import { normalizeToEvidencePackage, redactDigitHeavyText } from '../research/normalize';

export class AlpacaNewsError extends Error {
  constructor(
    public readonly code:
      | 'missing_credentials'
      | 'http_error'
      | 'parse_error'
      | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AlpacaNewsError';
  }
}

export interface AlpacaNewsCredentials {
  keyId: string;
  secret: string;
}

export interface FetchAlpacaNewsParams {
  symbols?: string[];
  query?: string;
  limit: number;
  credentials: AlpacaNewsCredentials;
  client?: AlpacaClient;
  fetchImpl?: typeof fetch;
}

interface AlpacaNewsRecord {
  id?: number | string;
  headline?: string;
  summary?: string;
  url?: string;
  source?: string;
  symbols?: string[];
  author?: string;
}

interface AlpacaNewsResponse {
  news?: AlpacaNewsRecord[] | null;
  next_page_token?: string | null;
}

const QUALITATIVE_SUMMARY_FALLBACK =
  'Alpaca news item for qualitative review; numeric detail redacted.';
const QUALITATIVE_TITLE_FALLBACK = 'Alpaca market news';

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
 * Fetch historical news from Alpaca market data API (v1beta1).
 * Maps headline/summary/url/source/symbols to leak-linted EvidencePackage rows.
 */
export async function fetchAlpacaNews(params: FetchAlpacaNewsParams): Promise<EvidencePackage[]> {
  const keyId = params.credentials.keyId?.trim();
  const secret = params.credentials.secret?.trim();
  if (!keyId || !secret) {
    throw new AlpacaNewsError('missing_credentials');
  }

  const limit = Math.min(Math.max(1, params.limit), 50);
  const symbols =
    params.symbols && params.symbols.length > 0
      ? params.symbols.map((s) => s.toUpperCase())
      : extractSymbolsFromQuery(params.query);

  const client =
    params.client ??
    createAlpacaClient({
      keyId,
      secret,
      ...(params.fetchImpl ? { fetchImpl: params.fetchImpl } : {}),
    });

  const search = new URLSearchParams();
  search.set('limit', String(limit));
  if (symbols.length > 0) {
    search.set('symbols', symbols.join(','));
  }

  let res;
  try {
    res = await client.getData<AlpacaNewsResponse>(`/v1beta1/news?${search.toString()}`);
  } catch {
    throw new AlpacaNewsError('network_error');
  }

  if (!res.ok) {
    throw new AlpacaNewsError('http_error', res.errorBody ?? `status:${res.status}`);
  }

  const records = res.data?.news ?? [];
  if (!Array.isArray(records)) {
    throw new AlpacaNewsError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.alpaca_news;

  return records.slice(0, limit).map((item, index) => {
    const symbolHint =
      item.symbols && item.symbols.length > 0
        ? ` (${item.symbols.join(', ')})`
        : symbols.length > 0
          ? ` (${symbols.join(', ')})`
          : '';
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
      sourceKind: 'alpaca_news',
      feedClass,
      title: title || `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`,
      summary,
      externalRef: item.url ?? (item.id != null ? `alpaca-news:${item.id}` : null),
      authorityClass: 'PROVIDER_ANALYZED',
    });
  });
}
