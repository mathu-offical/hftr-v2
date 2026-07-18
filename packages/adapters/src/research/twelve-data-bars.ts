import type { EvidencePackage } from '@hftr/contracts';
import { RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import { extractTickerFromQuery } from './alpaca-bars-evidence';
import { normalizeToEvidencePackage } from './normalize';

export class TwelveDataBarsError extends Error {
  constructor(
    public readonly code:
      | 'missing_credentials'
      | 'missing_symbol'
      | 'http_error'
      | 'rate_limited'
      | 'parse_error'
      | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TwelveDataBarsError';
  }
}

export interface GatherTwelveDataBarsEvidenceOptions {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface TwelveDataResponse {
  status?: string;
  code?: number;
  message?: string;
  meta?: { symbol?: string };
  values?: unknown[];
}

/**
 * Confirm Twelve Data time-series entitlement with one qualitative EvidencePackage.
 * Quantitative OHLC values stay on the ValueRef path — no digits in text fields.
 */
export async function gatherTwelveDataBarsEvidence(
  opts: GatherTwelveDataBarsEvidenceOptions,
): Promise<EvidencePackage[]> {
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) {
    throw new TwelveDataBarsError('missing_credentials');
  }

  const symbol = extractTickerFromQuery(opts.query);
  if (!symbol) {
    throw new TwelveDataBarsError(
      'missing_symbol',
      'no ticker-like symbol in query for twelve_data gather',
    );
  }

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=1&apikey=${encodeURIComponent(apiKey)}`;

  const fetchFn = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new TwelveDataBarsError('network_error');
  }

  if (res.status === 429) {
    throw new TwelveDataBarsError('rate_limited');
  }
  if (!res.ok) {
    throw new TwelveDataBarsError('http_error', `status:${res.status}`);
  }

  let body: TwelveDataResponse;
  try {
    body = (await res.json()) as TwelveDataResponse;
  } catch {
    throw new TwelveDataBarsError('parse_error');
  }

  if (body.status === 'error' || (body.code != null && body.code >= 400)) {
    const msg = (body.message ?? '').toLowerCase();
    if (msg.includes('rate') || body.code === 429) {
      throw new TwelveDataBarsError('rate_limited');
    }
    throw new TwelveDataBarsError('http_error', body.message ?? 'api_error');
  }

  const values = body.values;
  if (!Array.isArray(values)) {
    throw new TwelveDataBarsError('parse_error');
  }

  const availabilityBand = values.length > 0 ? 'non-empty' : 'empty';

  return [
    normalizeToEvidencePackage({
      sourceKind: 'twelve_data',
      feedClass: RESEARCH_SOURCE_FEED_CLASS.twelve_data,
      title: `Twelve Data series — ${symbol}`,
      summary:
        `Twelve Data series entitlement confirmed for ${symbol}; quantitative values stay off model path. ` +
        `Series availability band: ${availabilityBand}.`,
      externalRef: `twelve-data:${symbol}`,
      authorityClass: 'DETERMINISTIC',
      legalUseClass: 'ALLOWED',
    }),
  ];
}
