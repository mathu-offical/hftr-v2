import { leakLint, RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';

export class FredMacroError extends Error {
  constructor(
    public readonly code:
      | 'missing_credentials'
      | 'http_error'
      | 'parse_error'
      | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FredMacroError';
  }
}

export interface FetchFredMacroParams {
  query: string;
  limit?: number;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface FredSeriesRow {
  id?: string;
  title?: string;
  notes?: string;
}

const QUALITATIVE_SUMMARY = 'FRED series match; observation values not included.';
const QUALITATIVE_TITLE_FALLBACK = 'FRED macro series';

function sanitizeQualitativeField(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  const redacted = redactDigitHeavyText(trimmed);
  if (leakLint({ text: redacted }, []).ok) {
    return redacted;
  }
  return fallback;
}

/**
 * FRED series search — titles only; observation values excluded.
 */
export async function fetchFredMacro(params: FetchFredMacroParams): Promise<EvidencePackage[]> {
  const apiKey = params.apiKey?.trim();
  if (!apiKey) {
    throw new FredMacroError('missing_credentials');
  }

  const limit = Math.min(Math.max(1, params.limit ?? 8), 50);
  const searchText = params.query?.trim() || 'macro';
  const url =
    'https://api.stlouisfed.org/fred/series/search' +
    `?search_text=${encodeURIComponent(searchText)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&limit=${limit}`;

  const fetchFn = params.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
  } catch {
    throw new FredMacroError('network_error');
  }

  if (!res.ok) {
    throw new FredMacroError('http_error', `status:${res.status}`);
  }

  let rows: FredSeriesRow[];
  try {
    const body = (await res.json()) as { seriess?: FredSeriesRow[] };
    if (!body.seriess || !Array.isArray(body.seriess)) {
      throw new FredMacroError('parse_error');
    }
    rows = body.seriess;
  } catch (err) {
    if (err instanceof FredMacroError) throw err;
    throw new FredMacroError('parse_error');
  }

  const feedClass = RESEARCH_SOURCE_FEED_CLASS.fred_macro;

  return rows.slice(0, limit).map((row, index) => {
    const title = sanitizeQualitativeField(row.title, `${QUALITATIVE_TITLE_FALLBACK} ${index + 1}`);
    return normalizeToEvidencePackage({
      sourceKind: 'fred_macro',
      feedClass,
      title,
      summary: QUALITATIVE_SUMMARY,
      externalRef: row.id ? `fred-series:${row.id}` : null,
      authorityClass: 'DETERMINISTIC',
    });
  });
}
