import type { EvidencePackage } from '@hftr/contracts';
import { RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import { extractTickerFromQuery } from './alpaca-bars-evidence';
import { normalizeToEvidencePackage } from './normalize';

export class MarketstackEodError extends Error {
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
    this.name = 'MarketstackEodError';
  }
}

export interface GatherMarketstackEodEvidenceOptions {
  query: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface MarketstackResponse {
  error?: { code?: string; message?: string };
  data?: unknown[];
}

/**
 * Confirm Marketstack EOD entitlement with one qualitative EvidencePackage.
 * Quantitative EOD values stay on the ValueRef path — no digits in text fields.
 */
export async function gatherMarketstackEodEvidence(
  opts: GatherMarketstackEodEvidenceOptions,
): Promise<EvidencePackage[]> {
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) {
    throw new MarketstackEodError('missing_credentials');
  }

  const symbol = extractTickerFromQuery(opts.query);
  if (!symbol) {
    throw new MarketstackEodError(
      'missing_symbol',
      'no ticker-like symbol in query for marketstack gather',
    );
  }

  const url =
    `https://api.marketstack.com/v1/eod` +
    `?access_key=${encodeURIComponent(apiKey)}` +
    `&symbols=${encodeURIComponent(symbol)}` +
    `&limit=1`;

  const fetchFn = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new MarketstackEodError('network_error');
  }

  if (res.status === 429) {
    throw new MarketstackEodError('rate_limited');
  }
  if (!res.ok) {
    throw new MarketstackEodError('http_error', `status:${res.status}`);
  }

  let body: MarketstackResponse;
  try {
    body = (await res.json()) as MarketstackResponse;
  } catch {
    throw new MarketstackEodError('parse_error');
  }

  if (body.error) {
    const msg = (body.error.message ?? '').toLowerCase();
    if (msg.includes('rate') || body.error.code === 'rate_limit_reached') {
      throw new MarketstackEodError('rate_limited');
    }
    throw new MarketstackEodError('http_error', body.error.message ?? 'api_error');
  }

  const rows = body.data;
  if (!Array.isArray(rows)) {
    throw new MarketstackEodError('parse_error');
  }

  const availabilityBand = rows.length > 0 ? 'non-empty' : 'empty';

  return [
    normalizeToEvidencePackage({
      sourceKind: 'marketstack',
      feedClass: RESEARCH_SOURCE_FEED_CLASS.marketstack,
      title: `Marketstack EOD — ${symbol}`,
      summary:
        `Marketstack EOD entitlement confirmed for ${symbol}; quantitative values stay off model path. ` +
        `Series availability band: ${availabilityBand}.`,
      externalRef: `marketstack:${symbol}`,
      authorityClass: 'DETERMINISTIC',
      legalUseClass: 'ALLOWED',
    }),
  ];
}
