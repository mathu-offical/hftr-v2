import { z } from 'zod';
import {
  RESEARCH_SOURCE_FEED_CLASS,
  ResearchKeyProvider,
  ResearchSourceKind,
  type ResearchSourceKind as ResearchSourceKindType,
} from './research-bus';

export const ResearchSourceDomain = z.enum([
  'web_search',
  'filings',
  'news',
  'macro',
  'fx',
  'crypto',
  'equity_bars',
  'equity_news',
  'internal',
]);
export type ResearchSourceDomain = z.infer<typeof ResearchSourceDomain>;

export const ResearchSourceAuthMode = z.enum(['none', 'research_key', 'broker_paper']);
export type ResearchSourceAuthMode = z.infer<typeof ResearchSourceAuthMode>;

export const ResearchSourceLiveMode = z.enum(['rest_poll', 'websocket_candidate', 'none']);
export type ResearchSourceLiveMode = z.infer<typeof ResearchSourceLiveMode>;

export const ResearchSourceImplementation = z.enum(['shipped', 'stub', 'researched']);
export type ResearchSourceImplementation = z.infer<typeof ResearchSourceImplementation>;

export const ResearchSourceDescriptor = z.object({
  kind: ResearchSourceKind,
  domain: ResearchSourceDomain,
  authMode: ResearchSourceAuthMode,
  keyProvider: ResearchKeyProvider.optional(),
  feedClass: z.string().min(1).max(80),
  implementation: ResearchSourceImplementation,
  liveMode: ResearchSourceLiveMode,
  defaultEnabledWhenReady: z.boolean(),
  docsUrl: z.string().url(),
  notes: z.string().max(300),
});
export type ResearchSourceDescriptor = z.infer<typeof ResearchSourceDescriptor>;

const DOCS = {
  brave: 'https://brave.com/search/api/',
  sec: 'https://www.sec.gov/edgar/search/',
  marketaux: 'https://www.marketaux.com/documentation',
  alpaca: 'https://docs.alpaca.markets/docs/market-data-api',
  finnhub: 'https://finnhub.io/docs/api',
  polygon: 'https://polygon.io/docs/stocks/get_v2_reference_news',
  frankfurter: 'https://www.frankfurter.dev/docs/',
  coingecko: 'https://docs.coingecko.com/reference/coins-markets',
  fred: 'https://fred.stlouisfed.org/docs/api/fred/',
  alphaVantage: 'https://www.alphavantage.co/documentation/#news-sentiment',
  gdelt: 'https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/',
  worldBank: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392',
  twelveData: 'https://twelvedata.com/docs',
  marketstack: 'https://marketstack.com/documentation',
} as const;

/** Canonical registry for every ResearchSourceKind — shipped adapters and researched stubs. */
export const RESEARCH_SOURCE_REGISTRY: Record<ResearchSourceKindType, ResearchSourceDescriptor> = {
  brave_search: {
    kind: 'brave_search',
    domain: 'web_search',
    authMode: 'research_key',
    keyProvider: 'brave',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.brave_search,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.brave,
    notes: 'Operator Brave Search API for qualitative web evidence.',
  },
  sec_edgar: {
    kind: 'sec_edgar',
    domain: 'filings',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.sec_edgar,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.sec,
    notes: 'Public SEC EDGAR full-text search; no API key.',
  },
  market_news: {
    kind: 'market_news',
    domain: 'news',
    authMode: 'research_key',
    keyProvider: 'market_news',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.market_news,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.marketaux,
    notes: 'Marketaux public market news with deterministic fallback.',
  },
  alpaca_news: {
    kind: 'alpaca_news',
    domain: 'equity_news',
    authMode: 'broker_paper',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.alpaca_news,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.alpaca,
    notes: 'Alpaca Benzinga news via paper broker credentials.',
  },
  alpaca_bars: {
    kind: 'alpaca_bars',
    domain: 'equity_bars',
    authMode: 'broker_paper',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.alpaca_bars,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.alpaca,
    notes: 'Alpaca bar feed entitlement check; OHLC stays on ValueRef path.',
  },
  finnhub_news: {
    kind: 'finnhub_news',
    domain: 'equity_news',
    authMode: 'research_key',
    keyProvider: 'finnhub',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.finnhub_news,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.finnhub,
    notes: 'Finnhub company or general news headlines.',
  },
  polygon_news: {
    kind: 'polygon_news',
    domain: 'equity_news',
    authMode: 'research_key',
    keyProvider: 'polygon',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.polygon_news,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.polygon,
    notes: 'Polygon.io reference news feed.',
  },
  frankfurter_fx: {
    kind: 'frankfurter_fx',
    domain: 'fx',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.frankfurter_fx,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.frankfurter,
    notes: 'Frankfurter ECB reference FX set; numeric rates redacted in evidence.',
  },
  coingecko_crypto: {
    kind: 'coingecko_crypto',
    domain: 'crypto',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.coingecko_crypto,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.coingecko,
    notes: 'CoinGecko market-cap ranked listing; price and volume redacted.',
  },
  fred_macro: {
    kind: 'fred_macro',
    domain: 'macro',
    authMode: 'research_key',
    keyProvider: 'fred',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.fred_macro,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.fred,
    notes: 'FRED series search matches; observation values excluded.',
  },
  alpha_vantage_news: {
    kind: 'alpha_vantage_news',
    domain: 'news',
    authMode: 'research_key',
    keyProvider: 'alpha_vantage',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.alpha_vantage_news,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.alphaVantage,
    notes: 'Alpha Vantage news sentiment headlines; digits stripped.',
  },
  gdelt_news: {
    kind: 'gdelt_news',
    domain: 'news',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.gdelt_news,
    implementation: 'stub',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: false,
    docsUrl: DOCS.gdelt,
    notes:
      'GDELT DOC 2.0 ArtList verified reachable; intermittent 429 — adapter deferred pending backoff.',
  },
  world_bank_indicator: {
    kind: 'world_bank_indicator',
    domain: 'macro',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.world_bank_indicator,
    implementation: 'shipped',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: true,
    docsUrl: DOCS.worldBank,
    notes: 'World Bank indicator catalog; observation values excluded from evidence.',
  },
  twelve_data: {
    kind: 'twelve_data',
    domain: 'equity_bars',
    authMode: 'research_key',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.twelve_data,
    implementation: 'researched',
    liveMode: 'rest_poll',
    defaultEnabledWhenReady: false,
    docsUrl: DOCS.twelveData,
    notes: 'Twelve Data time-series researched; not wired in gather.',
  },
  marketstack: {
    kind: 'marketstack',
    domain: 'equity_bars',
    authMode: 'research_key',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.marketstack,
    implementation: 'researched',
    liveMode: 'none',
    defaultEnabledWhenReady: false,
    docsUrl: DOCS.marketstack,
    notes: 'Marketstack EOD researched; not wired in gather.',
  },
  catalog: {
    kind: 'catalog',
    domain: 'internal',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.catalog,
    implementation: 'shipped',
    liveMode: 'none',
    defaultEnabledWhenReady: false,
    docsUrl: 'https://github.com/',
    notes: 'Seed catalog hints; engine handler only, not external gather.',
  },
  library: {
    kind: 'library',
    domain: 'internal',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.library,
    implementation: 'shipped',
    liveMode: 'none',
    defaultEnabledWhenReady: false,
    docsUrl: 'https://github.com/',
    notes: 'Linked library concepts; explicit or linked-module default only.',
  },
  operator: {
    kind: 'operator',
    domain: 'internal',
    authMode: 'none',
    feedClass: RESEARCH_SOURCE_FEED_CLASS.operator,
    implementation: 'shipped',
    liveMode: 'none',
    defaultEnabledWhenReady: false,
    docsUrl: 'https://github.com/',
    notes: 'Operator input path; explicit request only.',
  },
};

const INTERNAL_KINDS = new Set<ResearchSourceKindType>(['catalog', 'library', 'operator']);

export interface ResearchSourceAvailability {
  researchKeys: string[];
  hasAlpacaPaper: boolean;
}

function isSourceReady(
  descriptor: ResearchSourceDescriptor,
  available: ResearchSourceAvailability,
): boolean {
  switch (descriptor.authMode) {
    case 'none':
      return true;
    case 'research_key':
      return descriptor.keyProvider
        ? available.researchKeys.includes(descriptor.keyProvider)
        : false;
    case 'broker_paper':
      return available.hasAlpacaPaper;
    default: {
      const _exhaustive: never = descriptor.authMode;
      return false;
    }
  }
}

/**
 * Resolve ready source kinds. When requested is empty, returns every shipped kind
 * that is credential-ready (excluding internal kinds unless explicitly requested).
 * Caps at 24 kinds.
 */
export function selectReadySourceKinds(
  available: ResearchSourceAvailability,
  requested?: ResearchSourceKindType[],
): ResearchSourceKindType[] {
  const cap = 24;

  if (requested && requested.length > 0) {
    const out: ResearchSourceKindType[] = [];
    const seen = new Set<ResearchSourceKindType>();
    for (const kind of requested) {
      if (seen.has(kind)) continue;
      const descriptor = RESEARCH_SOURCE_REGISTRY[kind];
      if (!descriptor) continue;
      if (descriptor.implementation === 'researched') continue;
      if (!isSourceReady(descriptor, available)) continue;
      seen.add(kind);
      out.push(kind);
      if (out.length >= cap) break;
    }
    return out;
  }

  const out: ResearchSourceKindType[] = [];
  for (const kind of ResearchSourceKind.options) {
    const descriptor = RESEARCH_SOURCE_REGISTRY[kind];
    if (INTERNAL_KINDS.has(kind)) continue;
    if (descriptor.implementation !== 'shipped') continue;
    if (!descriptor.defaultEnabledWhenReady) continue;
    if (!isSourceReady(descriptor, available)) continue;
    out.push(kind);
    if (out.length >= cap) break;
  }
  return out;
}

export function listSourcesByDomain(
  domain: ResearchSourceDomain,
): ResearchSourceDescriptor[] {
  return Object.values(RESEARCH_SOURCE_REGISTRY).filter((d) => d.domain === domain);
}

export function listShippedSources(): ResearchSourceDescriptor[] {
  return Object.values(RESEARCH_SOURCE_REGISTRY).filter((d) => d.implementation === 'shipped');
}

export function getSourceDescriptor(kind: ResearchSourceKindType): ResearchSourceDescriptor {
  return RESEARCH_SOURCE_REGISTRY[kind];
}
