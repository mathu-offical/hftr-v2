import { RESEARCH_SOURCE_FEED_CLASS } from '@hftr/contracts';
import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage, redactDigitHeavyText } from './normalize';
import { leakLint } from '@hftr/contracts';

export class WorldBankIndicatorError extends Error {
  constructor(
    public readonly code: 'http_error' | 'parse_error' | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'WorldBankIndicatorError';
  }
}

export interface FetchWorldBankIndicatorParams {
  query?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}

interface WorldBankIndicatorMeta {
  id?: string;
  name?: string;
  sourceNote?: string;
}

const TITLE_FALLBACK = 'World Bank indicator';
const SUMMARY_FALLBACK =
  'World Bank open data indicator match; numeric observation values excluded.';

function sanitize(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() || fallback;
  const redacted = redactDigitHeavyText(trimmed);
  if (leakLint({ text: redacted }, []).ok) return redacted;
  return fallback;
}

/**
 * Public World Bank indicator catalog slice — qualitative titles only.
 * GET https://api.worldbank.org/v2/indicator?format=json&per_page=N
 */
export async function fetchWorldBankIndicators(
  params: FetchWorldBankIndicatorParams = {},
): Promise<EvidencePackage[]> {
  const fetchFn = params.fetchImpl ?? fetch;
  const limit = Math.min(Math.max(1, params.limit ?? 5), 20);
  const q = params.query?.trim();
  const url =
    `https://api.worldbank.org/v2/indicator` +
    `?format=json&per_page=${limit}` +
    (q ? `&name=${encodeURIComponent(q.slice(0, 80))}` : '');

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new WorldBankIndicatorError('network_error');
  }

  if (!res.ok) {
    throw new WorldBankIndicatorError('http_error', `status:${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new WorldBankIndicatorError('parse_error');
  }

  const rows: WorldBankIndicatorMeta[] = Array.isArray(body)
    ? ((body[1] as WorldBankIndicatorMeta[] | undefined) ?? [])
    : [];

  if (rows.length === 0) {
    return [
      normalizeToEvidencePackage({
        sourceKind: 'world_bank_indicator',
        feedClass: RESEARCH_SOURCE_FEED_CLASS.world_bank_indicator,
        title: TITLE_FALLBACK,
        summary:
          'World Bank indicator catalog reachable; no matching series for this query window.',
        externalRef: null,
        authorityClass: 'CURATED_BACKGROUND',
        legalUseClass: 'ALLOWED',
      }),
    ];
  }

  return rows.slice(0, limit).map((row) =>
    normalizeToEvidencePackage({
      sourceKind: 'world_bank_indicator',
      feedClass: RESEARCH_SOURCE_FEED_CLASS.world_bank_indicator,
      title: sanitize(row.name, TITLE_FALLBACK),
      summary: sanitize(
        row.sourceNote
          ? `${row.sourceNote.slice(0, 280)} Observation values excluded.`
          : SUMMARY_FALLBACK,
        SUMMARY_FALLBACK,
      ),
      externalRef: row.id ? `worldbank:indicator:${row.id}` : null,
      authorityClass: 'CURATED_BACKGROUND',
      legalUseClass: 'ALLOWED',
    }),
  );
}
