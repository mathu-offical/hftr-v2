import {
  scoreRelevanceBand,
  type CompoundSymbolScore,
  type QualitativeBand,
  type ResolvedSuggestionThresholds,
} from '@hftr/contracts';
import {
  bandAtLeast,
  bandRank,
  corroborationBandFromDomains,
  leadershipBandFromAbsBps,
  volumeBandFromRatio,
} from './suggestion-thresholds';

export type SymbolLinkBandsInput = {
  newsLinkBand?: QualitativeBand;
  libraryLinkBand?: QualitativeBand;
  trendLinkBand?: QualitativeBand;
  linkCoverageBand?: QualitativeBand;
};

export type CompoundLaneInput = {
  symbol: string;
  /** Absolute relative-strength vs benchmark in bps. */
  relStrengthAbsBps: number;
  direction: 'up' | 'down' | 'flat';
  volumeExpansionRatio: number;
  /** Distinct research domains supporting this symbol (0–n). */
  corroborationDomains: number;
  /** Query text for library Jaccard (symbol + sector phrases). */
  libraryQueryText: string;
  corpusTexts: string[];
  /** News/filing package texts mentioning the symbol/sector. */
  newsCorpusTexts: string[];
  /** Macro/fx/crypto qualitative context texts. */
  macroCorpusTexts: string[];
  /** true when open book already at diversification cap for new names. */
  bookAtCap: boolean;
  /** true when symbol already in open positions (continuity). */
  inOpenBook: boolean;
  /** Optional explicit awareness link bands (D-175); defaults low. */
  linkBands?: SymbolLinkBandsInput;
};

function topicScopeForSymbol(symbol: string): string {
  return `movers:${symbol}`;
}

/**
 * Score one symbol across compound lanes (model-free).
 */
export function scoreCompoundSymbol(
  input: CompoundLaneInput,
  thresholds: ResolvedSuggestionThresholds,
): CompoundSymbolScore {
  const leadershipBand = leadershipBandFromAbsBps(input.relStrengthAbsBps, thresholds);
  const volumeBand = volumeBandFromRatio(input.volumeExpansionRatio, thresholds);

  const libraryFit = scoreRelevanceBand({
    queryText: input.libraryQueryText,
    topicScope: topicScopeForSymbol(input.symbol),
    corpusTexts: input.corpusTexts.length > 0 ? input.corpusTexts : ['movers watch relative strength'],
  });
  const newsFit = scoreRelevanceBand({
    queryText: input.libraryQueryText,
    topicScope: topicScopeForSymbol(input.symbol),
    corpusTexts: input.newsCorpusTexts.length > 0 ? input.newsCorpusTexts : [' '],
  });
  const macroFit = scoreRelevanceBand({
    queryText: input.libraryQueryText,
    topicScope: topicScopeForSymbol(input.symbol),
    corpusTexts: input.macroCorpusTexts.length > 0 ? input.macroCorpusTexts : [' '],
  });

  let bookFitBand: QualitativeBand = input.inOpenBook ? 'medium' : 'high';
  if (input.bookAtCap && !input.inOpenBook) bookFitBand = 'low';

  const corroborationBand = corroborationBandFromDomains(input.corroborationDomains);

  const newsLinkBand = input.linkBands?.newsLinkBand ?? 'low';
  const libraryLinkBand = input.linkBands?.libraryLinkBand ?? 'low';
  const trendLinkBand = input.linkBands?.trendLinkBand ?? 'low';
  const linkCoverageBand = input.linkBands?.linkCoverageBand ?? 'low';

  const admitsSearch =
    (bandAtLeast(libraryFit.band, thresholds.libraryFitMinBand) ||
      bandAtLeast(leadershipBand, 'medium')) &&
    bookFitBand !== 'low';

  return {
    symbol: input.symbol.toUpperCase(),
    leadershipBand,
    volumeBand,
    libraryFitBand: libraryFit.band,
    newsFitBand: newsFit.band,
    macroAlignBand: macroFit.band,
    bookFitBand,
    corroborationBand,
    corroborationDomains: input.corroborationDomains,
    newsLinkBand,
    libraryLinkBand,
    trendLinkBand,
    linkCoverageBand,
    relStrengthAbsBps: input.relStrengthAbsBps,
    direction: input.direction,
    admitsSearch,
  };
}

/** Lexicographic compound order (desc). */
export function compareCompoundScores(a: CompoundSymbolScore, b: CompoundSymbolScore): number {
  const keys: (keyof CompoundSymbolScore)[] = [
    'corroborationBand',
    'linkCoverageBand',
    'newsLinkBand',
    'leadershipBand',
    'libraryFitBand',
    'newsFitBand',
    'volumeBand',
  ];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (typeof av === 'string' && typeof bv === 'string') {
      const d = bandRank(bv as QualitativeBand) - bandRank(av as QualitativeBand);
      if (d !== 0) return d;
    }
  }
  if (b.relStrengthAbsBps !== a.relStrengthAbsBps) {
    return b.relStrengthAbsBps - a.relStrengthAbsBps;
  }
  return a.symbol.localeCompare(b.symbol);
}

export function rankCompoundScores(scores: CompoundSymbolScore[]): CompoundSymbolScore[] {
  return [...scores].sort(compareCompoundScores);
}

export function passesVerifyCorroboration(
  score: CompoundSymbolScore,
  thresholds: ResolvedSuggestionThresholds,
): boolean {
  return score.corroborationDomains >= thresholds.corroborationMinDomains;
}

/** Build universe with SPY benchmark and dynamic cap. */
export function buildMoversUniverse(opts: {
  sectorPeers: string[];
  evidenceSymbols: string[];
  trendSymbols: string[];
  positionSymbols: string[];
  fallbackLiquid: readonly string[];
  universeCap: number;
}): string[] {
  const spy = 'SPY';
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const u = s.toUpperCase().replace(/[^A-Z.]/g, '');
    if (!u || u.length > 12 || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  push(spy);
  for (const s of opts.sectorPeers) push(s);
  for (const s of opts.evidenceSymbols) push(s);
  for (const s of opts.trendSymbols) push(s);
  for (const s of opts.positionSymbols) push(s);
  if (out.length <= 1) {
    for (const s of opts.fallbackLiquid) push(s);
  }
  return out.slice(0, Math.max(4, opts.universeCap));
}

export const DEFAULT_LIQUID_FALLBACK = [
  'SPY',
  'QQQ',
  'IWM',
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'META',
] as const;

/** Extract ticker-like tokens from qualitative evidence text (capped). */
export function extractTickerCandidates(
  texts: string[],
  cap: number,
  /** When set, only return symbols in this set (case-insensitive). */
  allowlist: readonly string[] = DEFAULT_LIQUID_FALLBACK,
): string[] {
  const allow = new Set(allowlist.map((s) => s.toUpperCase()));
  // Prefer $TICKER / exchange:TICKER forms, then bare uppercase tokens in the allowlist.
  const tagged = /(?:\$|NASDAQ:|NYSE:|AMEX:)([A-Z]{1,5})\b/g;
  const bare = /\b([A-Z]{2,5})\b/g;
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (sym: string) => {
    if (!allow.has(sym) || seen.has(sym)) return;
    seen.add(sym);
    out.push(sym);
  };

  for (const t of texts) {
    const upper = t.toUpperCase();
    for (const m of upper.matchAll(tagged)) {
      push(m[1]!);
      if (out.length >= cap) return out;
    }
  }
  for (const t of texts) {
    const upper = t.toUpperCase();
    for (const m of upper.matchAll(bare)) {
      push(m[1]!);
      if (out.length >= cap) return out;
    }
  }
  return out;
}
