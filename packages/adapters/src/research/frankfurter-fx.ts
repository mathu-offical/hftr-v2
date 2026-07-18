import { RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage } from './normalize';

export class FrankfurterFxError extends Error {
  constructor(
    public readonly code: 'http_error' | 'parse_error' | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FrankfurterFxError';
  }
}

export interface FetchFrankfurterFxParams {
  limit?: number;
  fetchImpl?: typeof fetch;
}

interface FrankfurterRatesObject {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

interface FrankfurterRateRow {
  base?: string;
  quote?: string;
  rate?: number;
  date?: string;
}

/**
 * Frankfurter ECB reference FX availability — numeric rates redacted from evidence text.
 * Official path: GET /v2/rates?base=USD (array of quote rows). Also accepts legacy object shape.
 */
export async function fetchFrankfurterFx(
  params: FetchFrankfurterFxParams = {},
): Promise<EvidencePackage[]> {
  const fetchFn = params.fetchImpl ?? fetch;
  // /v2/latest returns 404 on frankfurter.dev v2 — use /v2/rates
  const url = 'https://api.frankfurter.dev/v2/rates?base=USD';

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new FrankfurterFxError('network_error');
  }

  if (!res.ok) {
    throw new FrankfurterFxError('http_error', `status:${res.status}`);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new FrankfurterFxError('parse_error');
  }

  let base = 'USD';
  let currencyCount = 0;

  if (Array.isArray(raw)) {
    const rows = raw as FrankfurterRateRow[];
    const quotes = new Set(
      rows.map((row) => row.quote?.trim()).filter((q): q is string => Boolean(q)),
    );
    currencyCount = quotes.size;
    base = rows[0]?.base?.trim() || 'USD';
  } else if (raw && typeof raw === 'object') {
    const body = raw as FrankfurterRatesObject;
    currencyCount = body.rates ? Object.keys(body.rates).length : 0;
    base = body.base?.trim() || 'USD';
  } else {
    throw new FrankfurterFxError('parse_error');
  }

  return [
    normalizeToEvidencePackage({
      sourceKind: 'frankfurter_fx',
      feedClass: RESEARCH_SOURCE_FEED_CLASS.frankfurter_fx,
      title: `Frankfurter FX reference set — ${base} base`,
      summary:
        `Frankfurter FX reference set — ${base} base quotes available for ${currencyCount} currencies; ` +
        'numeric rates redacted.',
      externalRef: 'frankfurter:rates:USD',
      authorityClass: 'DETERMINISTIC',
      legalUseClass: 'ALLOWED',
    }),
  ];
}
