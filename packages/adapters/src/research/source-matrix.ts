import {
  RESEARCH_SOURCE_FEED_CLASS,
  type ResearchSourceKind,
} from '@hftr/contracts';

/** Feed-class aliases that map back to a ResearchSourceKind for allow/block matching. */
const FEED_CLASS_ALIASES: Record<string, ResearchSourceKind> = {
  brave_search: 'brave_search',
  sec_edgar_free: 'sec_edgar',
  sec_edgar: 'sec_edgar',
  market_news_public: 'market_news',
  market_news_public_stub: 'market_news',
  alpaca_benzinga_news: 'alpaca_news',
  alpaca_iex_paper: 'alpaca_bars',
  finnhub_company_news: 'finnhub_news',
  polygon_reference_news: 'polygon_news',
  seed_catalog: 'catalog',
  company_library: 'library',
  operator_input: 'operator',
};

function aliasesForKind(kind: ResearchSourceKind): string[] {
  const canonical = RESEARCH_SOURCE_FEED_CLASS[kind];
  const extras = Object.entries(FEED_CLASS_ALIASES)
    .filter(([, k]) => k === kind)
    .map(([alias]) => alias);
  return [...new Set([kind, canonical, ...extras])];
}

function tokenMatchesKind(token: string, kind: ResearchSourceKind): boolean {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return false;
  return aliasesForKind(kind).some((alias) => alias.toLowerCase() === normalized);
}

function isBlocked(kind: ResearchSourceKind, blocklist: string[]): boolean {
  return blocklist.some((token) => tokenMatchesKind(token, kind));
}

function isAllowed(kind: ResearchSourceKind, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((token) => tokenMatchesKind(token, kind));
}

/**
 * Filter research source kinds by allowlist/blocklist.
 * Empty allowlist permits all (minus blocklist). Blocklist always wins.
 */
export function filterSourceKinds(
  kinds: ResearchSourceKind[],
  allowlist: string[],
  blocklist: string[],
): ResearchSourceKind[] {
  const seen = new Set<ResearchSourceKind>();
  const out: ResearchSourceKind[] = [];

  for (const kind of kinds) {
    if (seen.has(kind)) continue;
    if (isBlocked(kind, blocklist)) continue;
    if (!isAllowed(kind, allowlist)) continue;
    seen.add(kind);
    out.push(kind);
  }

  return out;
}
