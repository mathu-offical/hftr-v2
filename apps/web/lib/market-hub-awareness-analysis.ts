/**
 * Project sealed awareness links into Posture multi-level analysis (D-175).
 */

import type {
  MarketAwarenessEvidenceRow,
  MarketAwarenessLink,
  MarketAwarenessRecommendationRow,
  MarketAwarenessTrendRow,
  MarketHubAwarenessAnalysis,
  MarketHubTrendCandidate,
  MarketHubWatchlistItem,
  QualitativeBand,
  VerifiedNormalizedBundle,
} from '@hftr/contracts';

const BAND_RANK: Record<QualitativeBand, number> = { low: 1, medium: 2, high: 3 };

function rollupEvidence(links: MarketAwarenessLink[]): MarketAwarenessEvidenceRow[] {
  const byFrom = new Map<
    string,
    {
      id: string;
      kind: MarketAwarenessLink['fromKind'];
      label: string;
      symbols: Set<string>;
      strength: QualitativeBand;
    }
  >();
  for (const link of links) {
    if (link.toKind !== 'symbol') continue;
    if (
      link.fromKind !== 'news' &&
      link.fromKind !== 'library_concept' &&
      link.fromKind !== 'macro'
    ) {
      continue;
    }
    const key = `${link.fromKind}:${link.fromId}`;
    const cur = byFrom.get(key);
    if (!cur) {
      byFrom.set(key, {
        id: link.fromId,
        kind: link.fromKind,
        label: link.fromLabel,
        symbols: new Set([link.toId.toUpperCase()]),
        strength: link.strengthBand,
      });
      continue;
    }
    cur.symbols.add(link.toId.toUpperCase());
    if (BAND_RANK[link.strengthBand] > BAND_RANK[cur.strength]) {
      cur.strength = link.strengthBand;
    }
  }
  return [...byFrom.values()]
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      linkedSymbolCount: r.symbols.size,
      strengthBand: r.strength,
    }))
    .sort((a, b) => b.linkedSymbolCount - a.linkedSymbolCount)
    .slice(0, 48);
}

function projectTrends(
  links: MarketAwarenessLink[],
  hubTrends: MarketHubTrendCandidate[],
): MarketAwarenessTrendRow[] {
  const bySym = new Map<string, QualitativeBand>();
  for (const link of links) {
    if (link.fromKind !== 'trend' || link.toKind !== 'symbol') continue;
    const sym = link.toId.toUpperCase();
    const prev = bySym.get(sym);
    if (!prev || BAND_RANK[link.strengthBand] > BAND_RANK[prev]) {
      bySym.set(sym, link.strengthBand);
    }
  }
  const out: MarketAwarenessTrendRow[] = [];
  for (const t of hubTrends) {
    const band = bySym.get(t.symbol.toUpperCase());
    if (!band) continue;
    out.push({
      id: t.id,
      symbol: t.symbol.toUpperCase(),
      status: t.status,
      linkStrengthBand: band,
      label: `${t.direction} · ${t.strengthBand}`,
    });
  }
  for (const link of links) {
    if (link.fromKind !== 'trend' || link.toKind !== 'symbol') continue;
    if (out.some((r) => r.symbol === link.toId.toUpperCase())) continue;
    out.push({
      id: link.fromId,
      symbol: link.toId.toUpperCase(),
      status: 'linked',
      linkStrengthBand: link.strengthBand,
      label: link.fromLabel.slice(0, 200),
    });
  }
  return out.slice(0, 48);
}

function projectRecommendations(
  links: MarketAwarenessLink[],
  watchlists: MarketHubWatchlistItem[],
): MarketAwarenessRecommendationRow[] {
  const linkBySym = new Map<
    string,
    { news?: QualitativeBand; library?: QualitativeBand; trend?: QualitativeBand }
  >();
  for (const link of links) {
    const symbol =
      link.toKind === 'recommendation'
        ? link.toId.replace(/^movers:/i, '').toUpperCase()
        : link.toKind === 'symbol'
          ? link.toId.toUpperCase()
          : null;
    if (!symbol) continue;
    const cur = linkBySym.get(symbol) ?? {};
    if (link.fromKind === 'news') cur.news = link.strengthBand;
    if (link.fromKind === 'library_concept') cur.library = link.strengthBand;
    if (link.fromKind === 'trend') cur.trend = link.strengthBand;
    linkBySym.set(symbol, cur);
  }

  const out: MarketAwarenessRecommendationRow[] = [];
  for (const w of watchlists.slice(0, 48)) {
    const tier =
      w.status === 'watching'
        ? ('watching' as const)
        : w.status === 'suggested_verified'
          ? ('suggested_verified' as const)
          : w.status === 'suggested_search'
            ? ('suggested_search' as const)
            : null;
    if (!tier) continue;
    if (w.sourceClass !== 'movers_rank' && tier === 'watching' && w.sourceClass === 'operator') {
      // keep operator watching visible only when linked
      if (!linkBySym.has(w.symbol.toUpperCase())) continue;
    }
    const bands = linkBySym.get(w.symbol.toUpperCase()) ?? {};
    out.push({
      id: w.id,
      symbol: w.symbol.toUpperCase(),
      tier,
      newsLinkBand: bands.news,
      libraryLinkBand: bands.library,
      trendLinkBand: bands.trend,
      note: w.note ? w.note.slice(0, 300) : undefined,
    });
  }

  for (const link of links) {
    if (link.toKind !== 'recommendation') continue;
    const symbol = link.toId.replace(/^movers:/i, '').toUpperCase();
    if (out.some((r) => r.symbol === symbol)) continue;
    out.push({
      id: link.id,
      symbol,
      tier: 'suggested_search',
      note: link.fromLabel.slice(0, 300),
    });
  }
  return out.slice(0, 48);
}

export function projectMarketHubAwarenessAnalysis(opts: {
  seal: VerifiedNormalizedBundle | null;
  watchlists: MarketHubWatchlistItem[];
  trendCandidates: MarketHubTrendCandidate[];
}): MarketHubAwarenessAnalysis | undefined {
  const links = opts.seal?.awarenessLinks ?? [];
  const evidence = rollupEvidence(links);
  const trends = projectTrends(links, opts.trendCandidates);
  const recommendations = projectRecommendations(links, opts.watchlists);

  if (links.length === 0 && evidence.length === 0 && trends.length === 0 && recommendations.length === 0) {
    return undefined;
  }

  const kinds = new Set(links.map((l) => l.fromKind));
  const coverageSummary =
    links.length === 0
      ? 'No sealed awareness links yet — Analyze to build news↔symbol↔trend edges.'
      : `${links.length} links · ${evidence.length} evidence · ${trends.length} grounded trends · ${recommendations.length} recommendations · kinds ${[...kinds].join(',') || 'none'}`;

  return {
    asOfIso: opts.seal?.verifiedAt ?? null,
    evidence,
    links: links.slice(0, 128),
    trends,
    recommendations,
    coverageSummary,
  };
}
