export { createPaperSimAdapter, type PaperSimOptions } from './paper-sim';
export {
  createAlpacaPaperAdapter,
  createAlpacaAdapter,
  fetchAlpacaAccountId,
  type AlpacaAdapterOptions,
} from './alpaca/adapter';
export { createAlpacaClient, ALPACA_PAPER_BASE, ALPACA_DATA_BASE } from './alpaca/client';
export { mapTaskToAlpacaOrder } from './alpaca/map-order';
export {
  fetchBars,
  BarsFetchError,
  type OhlcBar,
  type FetchBarsParams,
  type FetchBarsResult,
  type AlpacaBarsCredentials,
} from './alpaca/bars';
export {
  fetchAlpacaNews,
  AlpacaNewsError,
  type FetchAlpacaNewsParams,
  type AlpacaNewsCredentials,
} from './alpaca/news';
export {
  gatherAlpacaBarsEvidence,
  AlpacaBarsEvidenceError,
  extractTickerFromQuery,
  type GatherAlpacaBarsEvidenceOptions,
} from './research/alpaca-bars-evidence';
export {
  resolveBrokerAdapter,
  adapterCapabilitiesForConnection,
  BrokerResolveError,
  type BrokerConnectionResolveInput,
  type ResolveBrokerAdapterOptions,
  type LiveArmingContext,
} from './resolve';
export {
  createKalshiDemoAdapter,
  assertKalshiDemoOnly,
  KALSHI_DEMO_STARTING_CASH_CENTS,
  KALSHI_DEMO_SYNTHETIC_MID_CENTS,
  type KalshiDemoAdapterOptions,
} from './kalshi/adapter';
export {
  createKalshiClient,
  KALSHI_DEMO_BASE_URL,
  KALSHI_DEMO_API_ORIGIN,
  type KalshiClient,
  type KalshiClientOptions,
} from './kalshi/client';
export { mapTaskToKalshiOrder } from './kalshi/map-order';
export {
  redactDigitHeavyText,
  digestEvidence,
  normalizeToEvidencePackage,
  type NormalizeEvidenceInput,
} from './research/normalize';
export { searchBrave, BraveSearchError, type SearchBraveOptions } from './research/brave-search';
export {
  searchSecFilings,
  SecFilingsError,
  type SearchSecFilingsOptions,
} from './research/sec-filings';
export {
  fetchMarketNews,
  MarketNewsError,
  type FetchMarketNewsOptions,
} from './research/market-news';
export {
  fetchFinnhubNews,
  FinnhubNewsError,
  type FetchFinnhubNewsParams,
} from './research/finnhub-news';
export {
  fetchPolygonNews,
  PolygonNewsError,
  type FetchPolygonNewsParams,
} from './research/polygon-news';
export {
  fetchAlphaVantageNews,
  AlphaVantageNewsError,
  type FetchAlphaVantageNewsParams,
} from './research/alpha-vantage-news';
export {
  fetchFrankfurterFx,
  FrankfurterFxError,
  type FetchFrankfurterFxParams,
} from './research/frankfurter-fx';
export {
  fetchCoinGeckoCrypto,
  CoinGeckoCryptoError,
  type FetchCoinGeckoCryptoParams,
} from './research/coingecko-crypto';
export { fetchFredMacro, FredMacroError, type FetchFredMacroParams } from './research/fred-macro';
export {
  fetchWorldBankIndicators,
  WorldBankIndicatorError,
  type FetchWorldBankIndicatorParams,
} from './research/world-bank-indicator';
export { fetchGdeltNews, GdeltNewsError, type FetchGdeltNewsParams } from './research/gdelt-news';
export {
  gatherTwelveDataBarsEvidence,
  TwelveDataBarsError,
  type GatherTwelveDataBarsEvidenceOptions,
} from './research/twelve-data-bars';
export {
  gatherMarketstackEodEvidence,
  MarketstackEodError,
  type GatherMarketstackEodEvidenceOptions,
} from './research/marketstack-eod';
export { filterSourceKinds } from './research/source-matrix';
export {
  evidenceFromLibraryConcepts,
  type LibraryConceptEvidenceInput,
} from './research/library-concepts';
export {
  normalizeOperatorArticleEvidence,
  deriveOperatorArticleTitle,
  type OperatorArticleEvidenceInput,
} from './research/operator-evidence';
export {
  gatherEvidencePackages,
  resolveDefaultSourceKinds,
  type GatherEvidencePackagesOptions,
  type GatherEvidenceError,
  type GatherCredentials,
} from './research/gather';
export { extractTickerSymbols } from './research/symbol-resolve';
export { mapSectorToQueryPhrases } from './research/sector-synonyms';
export {
  canonicalizeUrl,
  simHash64,
  simHash64Hex,
  hammingDistance,
  dedupeEvidenceByNearHash,
} from './research/evidence-quality';
export {
  buildResearchQueryPlan,
  type ResearchQueryPlan,
  type BuildResearchQueryPlanInput,
} from './research/query-plan';
