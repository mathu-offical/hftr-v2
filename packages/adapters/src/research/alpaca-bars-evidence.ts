import type { EvidencePackage } from '@hftr/contracts';
import { RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import { createAlpacaClient, type AlpacaClient } from '../alpaca/client';
import { BarsFetchError, fetchBars } from '../alpaca/bars';
import { normalizeToEvidencePackage } from './normalize';

export class AlpacaBarsEvidenceError extends Error {
  constructor(
    public readonly code: 'missing_credentials' | 'missing_symbol' | 'bars_fetch_failed',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AlpacaBarsEvidenceError';
  }
}

export interface GatherAlpacaBarsEvidenceOptions {
  query: string;
  credentials: { keyId: string; secret: string };
  client?: AlpacaClient;
  fetchImpl?: typeof fetch;
}

const TICKER_STOPWORDS = new Set([
  'A',
  'AN',
  'AND',
  'ARE',
  'AS',
  'AT',
  'BE',
  'BY',
  'FOR',
  'FROM',
  'IN',
  'IS',
  'IT',
  'OF',
  'ON',
  'OR',
  'THE',
  'TO',
  'VS',
]);

/** First uppercase ticker-like token in query ($AAPL or AAPL). */
export function extractTickerFromQuery(query: string): string | null {
  const upper = query.toUpperCase();
  const dollar = upper.match(/\$([A-Z]{1,5})\b/);
  if (dollar) return dollar[1]!;

  for (const match of upper.matchAll(/\b([A-Z]{1,5})\b/g)) {
    const token = match[1]!;
    if (TICKER_STOPWORDS.has(token)) continue;
    if (token.length >= 2) return token;
  }
  return null;
}

/**
 * Confirm Alpaca bar feed entitlement with one qualitative EvidencePackage.
 * Quantitative OHLC series stay on the ValueRef path — no digits in text fields.
 */
export async function gatherAlpacaBarsEvidence(
  opts: GatherAlpacaBarsEvidenceOptions,
): Promise<EvidencePackage[]> {
  const keyId = opts.credentials.keyId?.trim();
  const secret = opts.credentials.secret?.trim();
  if (!keyId || !secret) {
    throw new AlpacaBarsEvidenceError('missing_credentials');
  }

  const symbol = extractTickerFromQuery(opts.query);
  if (!symbol) {
    throw new AlpacaBarsEvidenceError(
      'missing_symbol',
      'no ticker-like symbol in query for alpaca_bars gather',
    );
  }

  try {
    const client =
      opts.client ??
      createAlpacaClient({
        keyId,
        secret,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      });

    const result = await fetchBars({
      symbol,
      limit: 5,
      credentials: { keyId, secret },
      client,
    });

    const availabilityBand = result.bars.length > 0 ? 'non-empty' : 'empty';

    return [
      normalizeToEvidencePackage({
        sourceKind: 'alpaca_bars',
        feedClass: result.feedClass || RESEARCH_SOURCE_FEED_CLASS.alpaca_bars,
        title: `Alpaca bar feed — ${symbol}`,
        summary:
          `Alpaca bar feed entitlement confirmed for ${symbol}; quantitative series stay in ValueRef path. ` +
          `Series availability band: ${availabilityBand}.`,
        externalRef: result.requestId ? `alpaca-request:${result.requestId}` : null,
        authorityClass: 'DETERMINISTIC',
        legalUseClass: 'ALLOWED',
      }),
    ];
  } catch (err) {
    if (err instanceof BarsFetchError) {
      throw new AlpacaBarsEvidenceError('bars_fetch_failed', err.code);
    }
    throw err;
  }
}
