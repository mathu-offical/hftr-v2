import type { EvidencePackage, ResearchSourceKind } from '@hftr/contracts';
import { BraveSearchError, searchBrave } from './brave-search';
import { fetchMarketNews, MarketNewsError } from './market-news';
import { searchSecFilings, SecFilingsError } from './sec-filings';
import { filterSourceKinds } from './source-matrix';

export interface GatherEvidenceError {
  sourceKind: string;
  code: string;
}

export interface GatherEvidencePackagesOptions {
  query: string;
  sourceKinds: ResearchSourceKind[];
  allowlist: string[];
  blocklist: string[];
  maxEvidence: number;
  braveApiKey?: string | null;
  marketNewsApiKey?: string | null;
  fetchImpl?: typeof fetch;
  /** Passed to SEC adapter for test resilience. */
  secAllowEmptyOnError?: boolean;
  /** Passed to market news when no API key. */
  marketNewsAllowDeterministicFallback?: boolean;
  marketNewsFeedUrl?: string;
}

function errorCode(err: unknown): string {
  if (err instanceof BraveSearchError) return err.code;
  if (err instanceof SecFilingsError) return err.code;
  if (err instanceof MarketNewsError) return err.code;
  if (err instanceof Error && err.message.startsWith('unsupported_source')) {
    return 'unsupported_source';
  }
  if (err instanceof Error) return err.message || err.name;
  return 'unknown_error';
}

async function gatherFromSource(
  kind: ResearchSourceKind,
  opts: GatherEvidencePackagesOptions,
): Promise<EvidencePackage[]> {
  const perSourceMax = Math.min(Math.max(1, opts.maxEvidence), 20);
  const fetchImpl = opts.fetchImpl;

  switch (kind) {
    case 'brave_search':
      return searchBrave({
        query: opts.query,
        apiKey: opts.braveApiKey ?? '',
        maxResults: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'sec_edgar':
      return searchSecFilings({
        query: opts.query,
        maxResults: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(opts.secAllowEmptyOnError !== undefined
          ? { allowEmptyOnError: opts.secAllowEmptyOnError }
          : {}),
      });
    case 'market_news':
      return fetchMarketNews({
        query: opts.query,
        maxResults: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(opts.marketNewsApiKey ? { apiKey: opts.marketNewsApiKey } : {}),
        ...(opts.marketNewsFeedUrl ? { feedUrl: opts.marketNewsFeedUrl } : {}),
        allowDeterministicFallback: opts.marketNewsAllowDeterministicFallback ?? true,
      });
    case 'alpaca_bars':
    case 'catalog':
    case 'library':
    case 'operator':
      throw new Error('unsupported_source');
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unsupported_source:${String(_exhaustive)}`);
    }
  }
}

/**
 * Fan out across filtered research sources; collect per-source errors without aborting.
 */
export async function gatherEvidencePackages(
  opts: GatherEvidencePackagesOptions,
): Promise<{ packages: EvidencePackage[]; errors: GatherEvidenceError[] }> {
  const filtered = filterSourceKinds(opts.sourceKinds, opts.allowlist, opts.blocklist);
  const errors: GatherEvidenceError[] = [];
  const packages: EvidencePackage[] = [];

  await Promise.all(
    filtered.map(async (kind) => {
      try {
        const batch = await gatherFromSource(kind, opts);
        packages.push(...batch);
      } catch (err) {
        errors.push({ sourceKind: kind, code: errorCode(err) });
      }
    }),
  );

  const cap = Math.min(Math.max(1, opts.maxEvidence), 48);
  return {
    packages: packages.slice(0, cap),
    errors,
  };
}
