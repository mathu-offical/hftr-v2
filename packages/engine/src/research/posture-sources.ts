import {
  RESEARCH_SOURCE_REGISTRY,
  ResearchSourceKind,
  selectReadySourceKinds,
  type ResearchSourceAvailability,
  type ResearchSourceKind as ResearchSourceKindT,
} from '@hftr/contracts';
import type { ResearchGatherCredentials } from './gather-credentials';

/** Movers compound lanes — intersected with credential-ready kinds at scan time. */
export const MOVERS_LANE_SOURCE_KINDS: ResearchSourceKindT[] = [
  'gdelt_news',
  'market_news',
  'alpha_vantage_news',
  'alpaca_news',
  'finnhub_news',
  'polygon_news',
  'fred_macro',
  'frankfurter_fx',
  'coingecko_crypto',
  'world_bank_indicator',
  'brave_search',
  'sec_edgar',
  'alpaca_bars',
  'twelve_data',
  'marketstack',
];

export const SECTOR_NEWS_LANE_SOURCE_KINDS: ResearchSourceKindT[] = [
  'gdelt_news',
  'market_news',
  'alpha_vantage_news',
  'brave_search',
  'finnhub_news',
  'polygon_news',
  'alpaca_news',
];

export function researchAvailabilityFromCredentials(
  credentials: ResearchGatherCredentials,
): ResearchSourceAvailability {
  const researchKeys: string[] = [];
  if (credentials.braveApiKey?.trim()) researchKeys.push('brave');
  if (credentials.marketNewsApiKey?.trim()) researchKeys.push('market_news');
  if (credentials.finnhubApiKey?.trim()) researchKeys.push('finnhub');
  if (credentials.polygonApiKey?.trim()) researchKeys.push('polygon');
  if (credentials.fredApiKey?.trim()) researchKeys.push('fred');
  if (credentials.alphaVantageApiKey?.trim()) researchKeys.push('alpha_vantage');
  if (credentials.twelveDataApiKey?.trim()) researchKeys.push('twelve_data');
  if (credentials.marketstackApiKey?.trim()) researchKeys.push('marketstack');
  return {
    researchKeys,
    hasAlpacaPaper: Boolean(
      credentials.alpacaKeyId?.trim() && credentials.alpacaSecret?.trim(),
    ),
  };
}

/** Credential-ready movers/sector kinds from the operator's provided surfaces. */
export function selectReadyLaneSourceKinds(
  credentials: ResearchGatherCredentials,
  requested: readonly ResearchSourceKindT[],
): ResearchSourceKindT[] {
  return selectReadySourceKinds(
    researchAvailabilityFromCredentials(credentials),
    [...requested],
  );
}

export function sourceKindLabel(kind: string): string {
  const parsed = ResearchSourceKind.safeParse(kind);
  if (!parsed.success) return kind.replace(/_/g, ' ');
  const d = RESEARCH_SOURCE_REGISTRY[parsed.data];
  return d.kind.replace(/_/g, ' ');
}

export function sourceKindDomain(kind: string): string {
  const parsed = ResearchSourceKind.safeParse(kind);
  if (!parsed.success) return 'unknown';
  return RESEARCH_SOURCE_REGISTRY[parsed.data].domain;
}
