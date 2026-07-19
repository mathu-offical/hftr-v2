import {
  type MarketAwarenessEvidenceRow,
  type MarketAwarenessFromKind,
  type MarketAwarenessLink,
  type MarketAwarenessTrendRow,
  type QualitativeBand,
} from '@hftr/contracts';
import { bandAtLeast, bandRank } from './suggestion-thresholds';
import { extractTickerCandidates } from './movers-compound';

const MAX_LINKS = 128;

export type AwarenessEvidencePkg = {
  digest: string;
  title: string;
  summary: string;
  sourceKind: string;
};

export type AwarenessTrendInput = {
  id: string;
  symbol: string;
  status: string;
};

export type AwarenessRecommendationInput = {
  id: string;
  symbol: string;
  tier: 'suggested_search' | 'suggested_verified' | 'watching';
};

export type BuildAwarenessLinksOpts = {
  asOfIso: string;
  universe: string[];
  newsPkgs: AwarenessEvidencePkg[];
  macroPkgs: AwarenessEvidencePkg[];
  libraryTitles: string[];
  trends: AwarenessTrendInput[];
  recommendations?: AwarenessRecommendationInput[];
};

export type SymbolLinkBands = {
  newsLinkBand: QualitativeBand;
  libraryLinkBand: QualitativeBand;
  trendLinkBand: QualitativeBand;
  linkCoverageBand: QualitativeBand;
};

export type BuildAwarenessLinksResult = {
  links: MarketAwarenessLink[];
  evidenceRows: MarketAwarenessEvidenceRow[];
  trendRows: MarketAwarenessTrendRow[];
};

function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 64) || 'concept';
}

function normalizeUniverse(universe: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of universe) {
    const sym = raw.toUpperCase().replace(/[^A-Z.]/g, '');
    if (!sym || sym.length > 12 || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

/** Classify ticker mention strength in qualitative text (model-free). */
export function tickerStrengthInText(text: string, symbol: string): QualitativeBand {
  const sym = symbol.toUpperCase();
  const upper = text.toUpperCase();
  const tagged = new RegExp(`(?:\\$|NASDAQ:|NYSE:|AMEX:)${sym}\\b`);
  if (tagged.test(upper)) return 'high';
  const bare = new RegExp(`\\b${sym}\\b`);
  if (bare.test(upper)) return 'medium';
  const weak = new RegExp(`\\(${sym}\\)|${sym}'S\\b`);
  if (weak.test(upper)) return 'low';
  return 'low';
}

function maxBand(current: QualitativeBand, next: QualitativeBand): QualitativeBand {
  return bandRank(next) > bandRank(current) ? next : current;
}

function linkCoverageBandFromKindCount(kindCount: number): QualitativeBand {
  if (kindCount >= 3) return 'high';
  if (kindCount === 2) return 'medium';
  return 'low';
}

function recommendationStrengthBand(
  tier: AwarenessRecommendationInput['tier'],
): QualitativeBand {
  switch (tier) {
    case 'suggested_search':
      return 'medium';
    case 'suggested_verified':
    case 'watching':
      return 'high';
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

function pushLink(
  links: MarketAwarenessLink[],
  link: MarketAwarenessLink,
): boolean {
  if (links.length >= MAX_LINKS) return false;
  links.push(link);
  return true;
}

function extractUniverseTickers(text: string, universe: readonly string[]): string[] {
  if (universe.length === 0) return [];
  return extractTickerCandidates([text], universe.length, universe);
}

function emitPkgSymbolLinks(opts: {
  links: MarketAwarenessLink[];
  asOfIso: string;
  fromKind: 'news' | 'macro';
  pkg: AwarenessEvidencePkg;
  universe: readonly string[];
}): void {
  const text = [opts.pkg.title, opts.pkg.summary].filter((s) => s.length > 0).join(' ');
  if (text.trim().length === 0) return;
  const tickers = extractUniverseTickers(text, opts.universe);
  const label = opts.pkg.title.trim() || opts.pkg.sourceKind;
  for (const sym of tickers) {
    const strengthBand = tickerStrengthInText(text, sym);
    const idPrefix = opts.fromKind === 'news' ? 'news' : 'macro';
    const added = pushLink(opts.links, {
      id: `${idPrefix}:${opts.pkg.digest}:${sym}`,
      fromKind: opts.fromKind,
      fromId: opts.pkg.digest,
      fromLabel: label.slice(0, 300),
      toKind: 'symbol',
      toId: sym,
      strengthBand,
      asOfIso: opts.asOfIso,
    });
    if (!added) return;
  }
}

function emitLibrarySymbolLinks(opts: {
  links: MarketAwarenessLink[];
  asOfIso: string;
  title: string;
  universe: readonly string[];
}): void {
  const title = opts.title.trim();
  if (title.length === 0) return;
  const tickers = extractUniverseTickers(title, opts.universe);
  const fromId = slugFromTitle(title);
  for (const sym of tickers) {
    const strengthBand = tickerStrengthInText(title, sym);
    const added = pushLink(opts.links, {
      id: `library:${fromId}:${sym}`,
      fromKind: 'library_concept',
      fromId,
      fromLabel: title.slice(0, 300),
      toKind: 'symbol',
      toId: sym,
      strengthBand,
      asOfIso: opts.asOfIso,
    });
    if (!added) return;
  }
}

/**
 * Build model-free awareness pre-links for movers compound scoring (D-175).
 */
export function buildAwarenessLinks(opts: BuildAwarenessLinksOpts): BuildAwarenessLinksResult {
  const asOfIso = opts.asOfIso;
  const universe = normalizeUniverse(opts.universe);
  const universeSet = new Set(universe);
  const links: MarketAwarenessLink[] = [];

  for (const pkg of opts.newsPkgs) {
    if (links.length >= MAX_LINKS) break;
    emitPkgSymbolLinks({ links, asOfIso, fromKind: 'news', pkg, universe });
  }

  for (const pkg of opts.macroPkgs) {
    if (links.length >= MAX_LINKS) break;
    emitPkgSymbolLinks({ links, asOfIso, fromKind: 'macro', pkg, universe });
  }

  for (const title of opts.libraryTitles) {
    if (links.length >= MAX_LINKS) break;
    emitLibrarySymbolLinks({ links, asOfIso, title, universe });
  }

  for (const trend of opts.trends) {
    if (links.length >= MAX_LINKS) break;
    const sym = trend.symbol.toUpperCase().replace(/[^A-Z.]/g, '');
    if (!sym || !universeSet.has(sym)) continue;
    const added = pushLink(links, {
      id: `trend:${trend.id}:${sym}`,
      fromKind: 'trend',
      fromId: trend.id,
      fromLabel: `${sym} trend`.slice(0, 300),
      toKind: 'symbol',
      toId: sym,
      strengthBand: 'high',
      asOfIso,
    });
    if (!added) break;
  }

  for (const rec of opts.recommendations ?? []) {
    if (links.length >= MAX_LINKS) break;
    const sym = rec.symbol.toUpperCase().replace(/[^A-Z.]/g, '');
    if (!sym || !universeSet.has(sym)) continue;
    const added = pushLink(links, {
      id: `recommendation:${rec.id}:${sym}`,
      fromKind: 'trend',
      fromId: sym,
      fromLabel: sym,
      toKind: 'recommendation',
      toId: rec.id,
      strengthBand: recommendationStrengthBand(rec.tier),
      asOfIso,
    });
    if (!added) break;
  }

  links.sort((a, b) => a.id.localeCompare(b.id));

  return {
    links,
    evidenceRows: rollupEvidenceRows(links),
    trendRows: projectTrendRows(links, opts.trends),
  };
}

export function linkCoverageBandForKinds(kinds: Iterable<MarketAwarenessFromKind>): QualitativeBand {
  const distinct = new Set(kinds);
  return linkCoverageBandFromKindCount(distinct.size);
}

/** Per-symbol link bands for compound scoring (defaults low when absent). */
export function linkBandsForSymbol(
  links: readonly MarketAwarenessLink[],
  symbol: string,
): SymbolLinkBands {
  const sym = symbol.toUpperCase();
  const symbolLinks = links.filter(
    (link) => link.toKind === 'symbol' && link.toId.toUpperCase() === sym,
  );

  let newsLinkBand: QualitativeBand = 'low';
  let libraryLinkBand: QualitativeBand = 'low';
  let trendLinkBand: QualitativeBand = 'low';
  const coverageKinds = new Set<MarketAwarenessFromKind>();

  for (const link of symbolLinks) {
    coverageKinds.add(link.fromKind);
    switch (link.fromKind) {
      case 'news':
        newsLinkBand = maxBand(newsLinkBand, link.strengthBand);
        break;
      case 'macro':
        break;
      case 'library_concept':
        libraryLinkBand = maxBand(libraryLinkBand, link.strengthBand);
        break;
      case 'trend':
        trendLinkBand = maxBand(trendLinkBand, link.strengthBand);
        break;
      default: {
        const _exhaustive: never = link.fromKind;
        void _exhaustive;
      }
    }
  }

  return {
    newsLinkBand,
    libraryLinkBand,
    trendLinkBand,
    linkCoverageBand: linkCoverageBandForKinds(coverageKinds),
  };
}

/** Evidence rollup for Posture level 1 — one row per link source package/concept. */
export function rollupEvidenceRows(
  links: readonly MarketAwarenessLink[],
): MarketAwarenessEvidenceRow[] {
  const byKey = new Map<
    string,
    {
      kind: MarketAwarenessFromKind;
      label: string;
      symbols: Set<string>;
      strengthBand: QualitativeBand;
    }
  >();

  for (const link of links) {
    if (link.toKind !== 'symbol') continue;
    const key = `${link.fromKind}:${link.fromId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        kind: link.fromKind,
        label: link.fromLabel,
        symbols: new Set([link.toId.toUpperCase()]),
        strengthBand: link.strengthBand,
      });
      continue;
    }
    existing.symbols.add(link.toId.toUpperCase());
    existing.strengthBand = maxBand(existing.strengthBand, link.strengthBand);
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, row]) => ({
      id: key.slice(0, 128),
      kind: row.kind,
      label: row.label,
      linkedSymbolCount: row.symbols.size,
      strengthBand: row.strengthBand,
    }))
    .slice(0, 48);
}

/** Trend projection grounded by explicit trend→symbol links (Posture level 3). */
export function projectTrendRows(
  links: readonly MarketAwarenessLink[],
  trends: readonly AwarenessTrendInput[],
): MarketAwarenessTrendRow[] {
  const strengthByTrendId = new Map<string, QualitativeBand>();
  for (const link of links) {
    if (link.fromKind !== 'trend' || link.toKind !== 'symbol') continue;
    const prev = strengthByTrendId.get(link.fromId) ?? 'low';
    strengthByTrendId.set(link.fromId, maxBand(prev, link.strengthBand));
  }

  return trends
    .map((trend) => {
      const sym = trend.symbol.toUpperCase().replace(/[^A-Z.]/g, '');
      return {
        id: trend.id,
        symbol: sym,
        status: trend.status,
        linkStrengthBand: strengthByTrendId.get(trend.id) ?? 'low',
        label: `${sym} ${trend.status}`.trim().slice(0, 200),
      };
    })
    .slice(0, 48);
}

/** True when explicit link bands beat Jaccard-only fallback lanes. */
export function hasExplicitLinkSignal(bands: SymbolLinkBands): boolean {
  return (
    bandAtLeast(bands.newsLinkBand, 'medium') ||
    bandAtLeast(bands.libraryLinkBand, 'medium') ||
    bandAtLeast(bands.trendLinkBand, 'medium') ||
    bandAtLeast(bands.linkCoverageBand, 'medium')
  );
}
