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
export { filterSourceKinds } from './research/source-matrix';
export {
  evidenceFromLibraryConcepts,
  type LibraryConceptEvidenceInput,
} from './research/library-concepts';
export {
  gatherEvidencePackages,
  type GatherEvidencePackagesOptions,
  type GatherEvidenceError,
} from './research/gather';
