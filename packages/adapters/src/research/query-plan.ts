import type { ResearchSourceKind } from '@hftr/contracts';
import { ResearchSourceKind as ResearchSourceKindSchema } from '@hftr/contracts';
import { mapSectorToQueryPhrases } from './sector-synonyms';
import { extractTickerSymbols } from './symbol-resolve';

// TODO(D-070): import ResearchQueryPlan from @hftr/contracts when the schema lands.
export interface ResearchQueryPlan {
  topicScope: string;
  topicSectors: string[];
  queryText: string;
  symbols: string[];
  cadence?: string;
  /** Per-source gather query strings. */
  bySource: Partial<Record<ResearchSourceKind, string>>;
  /** Fallback when a source has no tailored query. */
  baseQuery: string;
}

export interface BuildResearchQueryPlanInput {
  topicScope: string;
  topicSectors?: string[];
  queryText?: string;
  symbols?: string[];
  cadence?: string;
}

function joinQueryParts(parts: readonly (string | undefined | null)[], maxLen = 200): string {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const part of parts) {
    if (!part?.trim()) continue;
    for (const token of part.trim().split(/\s+/)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }

  return tokens.join(' ').slice(0, maxLen);
}

function sectorPhrases(topicSectors: readonly string[] | undefined): string[] {
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (const sector of topicSectors ?? []) {
    for (const phrase of mapSectorToQueryPhrases(sector)) {
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      phrases.push(phrase);
    }
  }
  return phrases;
}

function symbolTokens(symbols: readonly string[]): string[] {
  return symbols.map((symbol) => `$${symbol}`);
}

function newsStyleQuery(
  input: BuildResearchQueryPlanInput,
  sectors: string[],
  symbols: string[],
): string {
  return joinQueryParts([...sectors, input.queryText, ...symbolTokens(symbols)]);
}

function symbolFocusedQuery(symbols: string[], fallback: string): string {
  if (symbols.length > 0) {
    return joinQueryParts(symbols);
  }
  return fallback;
}

function macroQuery(topicScope: string, cadence?: string): string {
  return joinQueryParts(['macro economy indicators', topicScope, cadence]);
}

function secCompanyEventQuery(symbols: string[], queryText: string | undefined, topicScope: string): string {
  if (symbols.length > 0) {
    return joinQueryParts([...symbols, 'SEC filings', 'company events']);
  }
  return joinQueryParts([queryText, topicScope, 'SEC filings']);
}

/**
 * Deterministic per-source query plan for research gather (model-free).
 */
export function buildResearchQueryPlan(input: BuildResearchQueryPlanInput): ResearchQueryPlan {
  const topicScope = input.topicScope.trim();
  const queryText = input.queryText?.trim() ?? '';
  const sectors = sectorPhrases(input.topicSectors);
  const symbols =
    input.symbols && input.symbols.length > 0
      ? input.symbols.slice(0, 12)
      : extractTickerSymbols([queryText, topicScope].filter(Boolean).join(' '));

  const baseQuery = joinQueryParts([...sectors, queryText, topicScope, ...symbolTokens(symbols)]);
  const newsQuery = newsStyleQuery(input, sectors, symbols);
  const symbolQuery = symbolFocusedQuery(symbols, baseQuery);
  const macro = macroQuery(topicScope, input.cadence);
  const secQuery = secCompanyEventQuery(symbols, queryText, topicScope);
  const scopeQuery = joinQueryParts([topicScope]);

  const bySource: Partial<Record<ResearchSourceKind, string>> = {
    gdelt_news: newsQuery,
    market_news: newsQuery,
    brave_search: newsQuery,
    alpha_vantage_news: newsQuery,
    finnhub_news: newsQuery,
    polygon_news: newsQuery,
    alpaca_news: newsQuery,
    alpaca_bars: symbolQuery,
    twelve_data: symbolQuery,
    marketstack: symbolQuery,
    fred_macro: macro,
    world_bank_indicator: macro,
    sec_edgar: secQuery,
    library: scopeQuery,
    catalog: scopeQuery,
    frankfurter_fx: joinQueryParts(['foreign exchange rates', topicScope]),
    coingecko_crypto: joinQueryParts(['crypto digital assets', ...sectors, topicScope]),
  };

  for (const kind of ResearchSourceKindSchema.options) {
    if (bySource[kind] === undefined && kind !== 'operator') {
      bySource[kind] = baseQuery;
    }
  }

  return {
    topicScope,
    topicSectors: [...(input.topicSectors ?? [])],
    queryText,
    symbols,
    ...(input.cadence ? { cadence: input.cadence } : {}),
    bySource,
    baseQuery,
  };
}
