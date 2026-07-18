import type { EvidencePackage, ResearchSourceKind } from '@hftr/contracts';
import { selectReadySourceKinds } from '@hftr/contracts';
import { AlpacaNewsError, fetchAlpacaNews } from '../alpaca/news';
import { BraveSearchError, searchBrave } from './brave-search';
import {
  AlpacaBarsEvidenceError,
  gatherAlpacaBarsEvidence,
} from './alpaca-bars-evidence';
import {
  evidenceFromLibraryConcepts,
  type LibraryConceptEvidenceInput,
} from './library-concepts';
import { fetchFinnhubNews, FinnhubNewsError } from './finnhub-news';
import { fetchMarketNews, MarketNewsError } from './market-news';
import { fetchPolygonNews, PolygonNewsError } from './polygon-news';
import { searchSecFilings, SecFilingsError } from './sec-filings';
import { fetchFrankfurterFx, FrankfurterFxError } from './frankfurter-fx';
import { fetchCoinGeckoCrypto, CoinGeckoCryptoError } from './coingecko-crypto';
import { fetchFredMacro, FredMacroError } from './fred-macro';
import { fetchAlphaVantageNews, AlphaVantageNewsError } from './alpha-vantage-news';
import { fetchGdeltNews, GdeltNewsError } from './gdelt-news';
import {
  gatherTwelveDataBarsEvidence,
  TwelveDataBarsError,
} from './twelve-data-bars';
import {
  gatherMarketstackEodEvidence,
  MarketstackEodError,
} from './marketstack-eod';
import {
  fetchWorldBankIndicators,
  WorldBankIndicatorError,
} from './world-bank-indicator';
import { ResearchStubError } from './research-stub';
import { filterSourceKinds } from './source-matrix';

export interface GatherEvidenceError {
  sourceKind: string;
  code: string;
}

export interface GatherCredentials {
  braveApiKey?: string | null;
  marketNewsApiKey?: string | null;
  finnhubApiKey?: string | null;
  polygonApiKey?: string | null;
  fredApiKey?: string | null;
  alphaVantageApiKey?: string | null;
  twelveDataApiKey?: string | null;
  marketstackApiKey?: string | null;
  alpacaKeyId?: string | null;
  alpacaSecret?: string | null;
}

export interface GatherEvidencePackagesOptions extends GatherCredentials {
  query: string;
  sourceKinds: ResearchSourceKind[];
  allowlist: string[];
  blocklist: string[];
  maxEvidence: number;
  fetchImpl?: typeof fetch;
  /** Passed to SEC adapter for test resilience. */
  secAllowEmptyOnError?: boolean;
  /** Passed to market news when no API key. */
  marketNewsAllowDeterministicFallback?: boolean;
  marketNewsFeedUrl?: string;
  /** Preloaded admitted library concepts for sourceKind `library`. */
  libraryConcepts?: LibraryConceptEvidenceInput[];
}

function mergeCredentials(opts: GatherEvidencePackagesOptions): GatherCredentials {
  return {
    braveApiKey: opts.braveApiKey ?? null,
    marketNewsApiKey: opts.marketNewsApiKey ?? null,
    finnhubApiKey: opts.finnhubApiKey ?? null,
    polygonApiKey: opts.polygonApiKey ?? null,
    fredApiKey: opts.fredApiKey ?? null,
    alphaVantageApiKey: opts.alphaVantageApiKey ?? null,
    twelveDataApiKey: opts.twelveDataApiKey ?? null,
    marketstackApiKey: opts.marketstackApiKey ?? null,
    alpacaKeyId: opts.alpacaKeyId ?? null,
    alpacaSecret: opts.alpacaSecret ?? null,
  };
}

function researchKeysFromCredentials(credentials: GatherCredentials): string[] {
  const keys: string[] = [];
  if (credentials.braveApiKey?.trim()) keys.push('brave');
  if (credentials.marketNewsApiKey?.trim()) keys.push('market_news');
  if (credentials.finnhubApiKey?.trim()) keys.push('finnhub');
  if (credentials.polygonApiKey?.trim()) keys.push('polygon');
  if (credentials.fredApiKey?.trim()) keys.push('fred');
  if (credentials.alphaVantageApiKey?.trim()) keys.push('alpha_vantage');
  if (credentials.twelveDataApiKey?.trim()) keys.push('twelve_data');
  if (credentials.marketstackApiKey?.trim()) keys.push('marketstack');
  return keys;
}

/** Default shipped source kinds ready for the supplied credential bag. */
export function resolveDefaultSourceKinds(credentials: GatherCredentials): ResearchSourceKind[] {
  const hasAlpacaPaper = Boolean(
    credentials.alpacaKeyId?.trim() && credentials.alpacaSecret?.trim(),
  );
  return selectReadySourceKinds(
    {
      researchKeys: researchKeysFromCredentials(credentials),
      hasAlpacaPaper,
    },
    undefined,
  );
}

function errorCode(err: unknown): string {
  if (err instanceof BraveSearchError) return err.code;
  if (err instanceof SecFilingsError) return err.code;
  if (err instanceof MarketNewsError) return err.code;
  if (err instanceof AlpacaNewsError) return err.code;
  if (err instanceof AlpacaBarsEvidenceError) return err.code;
  if (err instanceof FinnhubNewsError) return err.code;
  if (err instanceof PolygonNewsError) return err.code;
  if (err instanceof FrankfurterFxError) return err.code;
  if (err instanceof CoinGeckoCryptoError) return err.code;
  if (err instanceof FredMacroError) return err.code;
  if (err instanceof AlphaVantageNewsError) return err.code;
  if (err instanceof GdeltNewsError) return err.code;
  if (err instanceof TwelveDataBarsError) return err.code;
  if (err instanceof MarketstackEodError) return err.code;
  if (err instanceof WorldBankIndicatorError) return err.code;
  if (err instanceof ResearchStubError) return err.code;
  if (err instanceof Error && err.message.startsWith('unsupported_source')) {
    return 'unsupported_source';
  }
  if (err instanceof Error) return err.message || err.name;
  return 'unknown_error';
}

async function gatherFromSource(
  kind: ResearchSourceKind,
  opts: GatherEvidencePackagesOptions,
  credentials: GatherCredentials,
): Promise<EvidencePackage[]> {
  const perSourceMax = Math.min(Math.max(1, opts.maxEvidence), 20);
  const fetchImpl = opts.fetchImpl;

  switch (kind) {
    case 'brave_search':
      return searchBrave({
        query: opts.query,
        apiKey: credentials.braveApiKey ?? '',
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
        ...(credentials.marketNewsApiKey ? { apiKey: credentials.marketNewsApiKey } : {}),
        ...(opts.marketNewsFeedUrl ? { feedUrl: opts.marketNewsFeedUrl } : {}),
        allowDeterministicFallback: opts.marketNewsAllowDeterministicFallback ?? true,
      });
    case 'alpaca_news':
      return fetchAlpacaNews({
        query: opts.query,
        limit: perSourceMax,
        credentials: {
          keyId: credentials.alpacaKeyId ?? '',
          secret: credentials.alpacaSecret ?? '',
        },
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'alpaca_bars':
      return gatherAlpacaBarsEvidence({
        query: opts.query,
        credentials: {
          keyId: credentials.alpacaKeyId ?? '',
          secret: credentials.alpacaSecret ?? '',
        },
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'finnhub_news':
      return fetchFinnhubNews({
        query: opts.query,
        limit: perSourceMax,
        apiKey: credentials.finnhubApiKey ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'polygon_news':
      return fetchPolygonNews({
        query: opts.query,
        limit: perSourceMax,
        apiKey: credentials.polygonApiKey ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'frankfurter_fx':
      return fetchFrankfurterFx({
        limit: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'coingecko_crypto':
      return fetchCoinGeckoCrypto({
        limit: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'fred_macro':
      return fetchFredMacro({
        query: opts.query,
        limit: perSourceMax,
        apiKey: credentials.fredApiKey ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'alpha_vantage_news':
      return fetchAlphaVantageNews({
        query: opts.query,
        limit: perSourceMax,
        apiKey: credentials.alphaVantageApiKey ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'world_bank_indicator':
      return fetchWorldBankIndicators({
        query: opts.query,
        limit: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'gdelt_news':
      return fetchGdeltNews({
        query: opts.query,
        limit: perSourceMax,
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'twelve_data':
      return gatherTwelveDataBarsEvidence({
        query: opts.query,
        apiKey: credentials.twelveDataApiKey ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'marketstack':
      return gatherMarketstackEodEvidence({
        query: opts.query,
        apiKey: credentials.marketstackApiKey ?? '',
        ...(fetchImpl ? { fetchImpl } : {}),
      });
    case 'library':
      return evidenceFromLibraryConcepts(opts.libraryConcepts ?? [], {
        maxResults: perSourceMax,
      });
    case 'catalog':
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
  const credentials = mergeCredentials(opts);
  const filtered = filterSourceKinds(opts.sourceKinds, opts.allowlist, opts.blocklist);
  const errors: GatherEvidenceError[] = [];
  const packages: EvidencePackage[] = [];

  await Promise.all(
    filtered.map(async (kind) => {
      try {
        const batch = await gatherFromSource(kind, opts, credentials);
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
