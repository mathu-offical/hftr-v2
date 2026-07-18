import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';

export class CoinGeckoCryptoError extends Error {
  constructor(
    public readonly code: 'http_error' | 'parse_error' | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'CoinGeckoCryptoError';
  }
}

export interface FetchCoinGeckoCryptoParams {
  limit?: number;
  fetchImpl?: typeof fetch;
}

interface CoinGeckoMarketRow {
  id?: string;
  symbol?: string;
  name?: string;
}

const USER_AGENT = 'hftr-v2-research-gather/1.0 (+https://hftr.local)';
const QUALITATIVE_SUMMARY = 'Market-cap ranked crypto listing; price and volume levels redacted.';

function sanitizeQualitativeField(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  const redacted = redactDigitHeavyText(trimmed);
  if (leakLint({ text: redacted }, []).ok) {
    return redacted;
  }
  return fallback;
}

/**
 * CoinGecko market-cap ranked listing — per-coin qualitative evidence only.
 */
export async function fetchCoinGeckoCrypto(
  params: FetchCoinGeckoCryptoParams = {},
): Promise<EvidencePackage[]> {
  const limit = Math.min(Math.max(1, params.limit ?? 8), 50);
  const fetchFn = params.fetchImpl ?? fetch;
  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    `?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1`;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
  } catch {
    throw new CoinGeckoCryptoError('network_error');
  }

  if (!res.ok) {
    throw new CoinGeckoCryptoError('http_error', `status:${res.status}`);
  }

  let rows: CoinGeckoMarketRow[];
  try {
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new CoinGeckoCryptoError('parse_error');
    }
    rows = body as CoinGeckoMarketRow[];
  } catch (err) {
    if (err instanceof CoinGeckoCryptoError) throw err;
    throw new CoinGeckoCryptoError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.coingecko_crypto;

  return rows.slice(0, limit).map((row, index) => {
    const symbol = row.symbol?.toUpperCase() ?? 'CRYPTO';
    const name = sanitizeQualitativeField(row.name, symbol);
    const title = sanitizeQualitativeField(
      name !== symbol ? `${name} (${symbol})` : symbol,
      `Crypto asset ${index + 1}`,
    );

    return normalizeToEvidencePackage({
      sourceKind: 'coingecko_crypto',
      feedClass,
      title,
      summary: QUALITATIVE_SUMMARY,
      externalRef: row.id ? `coingecko:${row.id}` : null,
      authorityClass: 'DETERMINISTIC',
    });
  });
}
