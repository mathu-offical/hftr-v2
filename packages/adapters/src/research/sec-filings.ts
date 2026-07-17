import type { EvidencePackage } from '@hftr/contracts';
import { normalizeToEvidencePackage } from './normalize';

export class SecFilingsError extends Error {
  constructor(
    public readonly code: 'http_error' | 'parse_error' | 'network_error',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SecFilingsError';
  }
}

export interface SearchSecFilingsOptions {
  query: string;
  maxResults?: number;
  fetchImpl?: typeof fetch;
  userAgent?: string;
  allowEmptyOnError?: boolean;
}

interface SecHit {
  _source?: {
    file_date?: string;
    form_type?: string;
    display_names?: string[];
    file_num?: string;
  };
  _id?: string;
}

interface SecSearchResponse {
  hits?: {
    hits?: SecHit[];
    total?: { value?: number };
  };
}

const DEFAULT_USER_AGENT = 'hftr-v2-research research@hftr.local';

/**
 * Deterministic SEC EDGAR full-text search → EvidencePackage[].
 */
export async function searchSecFilings(
  opts: SearchSecFilingsOptions,
): Promise<EvidencePackage[]> {
  const count = Math.min(Math.max(1, opts.maxResults ?? 5), 20);
  const fetchFn = opts.fetchImpl ?? fetch;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

  const url =
    `https://efts.sec.gov/LATEST/search-index` +
    `?q=${encodeURIComponent(opts.query)}` +
    `&forms=10-K,10-Q,8-K` +
    `&dateRange=custom` +
    `&startdt=2020-01-01` +
    `&enddt=2030-12-31` +
    `&from=0` +
    `&size=${count}`;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
    });
  } catch (err) {
    if (opts.allowEmptyOnError) {
      return [];
    }
    throw new SecFilingsError(
      'network_error',
      err instanceof Error ? err.message : 'network_error',
    );
  }

  if (!res.ok) {
    if (opts.allowEmptyOnError) {
      return [];
    }
    throw new SecFilingsError('http_error', `status:${res.status}`);
  }

  let body: SecSearchResponse;
  try {
    body = (await res.json()) as SecSearchResponse;
  } catch {
    if (opts.allowEmptyOnError) {
      return [];
    }
    throw new SecFilingsError('parse_error');
  }

  const hits = body.hits?.hits ?? [];
  return hits.slice(0, count).map((hit, index) => {
    const src = hit._source;
    const formType = src?.form_type ?? 'filing';
    const displayName = src?.display_names?.[0] ?? 'SEC registrant';
    const fileDate = src?.file_date ?? '';
    const accession = hit._id ?? src?.file_num ?? null;

    return normalizeToEvidencePackage({
      sourceKind: 'sec_edgar',
      feedClass: 'sec_edgar_free',
      title: `${formType} — ${displayName}`,
      summary:
        fileDate.length > 0
          ? `SEC EDGAR filing (${formType}) indexed for qualitative review.`
          : `SEC EDGAR filing (${formType}) — result ${index + 1}.`,
      externalRef: accession,
      authorityClass: 'DETERMINISTIC',
    });
  });
}
