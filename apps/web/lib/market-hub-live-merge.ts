import type { MarketHubLiveResponse, MarketHubResponse } from '@hftr/contracts';

/**
 * Merge live equity/marks into a full hub snapshot without replacing static
 * seals, reports, charts, sources, Model inputs (D-112).
 * Preserves D-155 sourceChips on equity / positions / watchlists across deltas.
 */
export function mergeMarketHubLive(
  hub: MarketHubResponse,
  live: MarketHubLiveResponse,
): MarketHubResponse {
  const byId = new Map(live.positions.map((p) => [p.id, p]));
  const positions = hub.positions.map((p) => {
    const livePos = byId.get(p.id);
    if (!livePos) return p;
    return {
      ...p,
      qty: livePos.qty,
      avgCostCents: livePos.avgCostCents,
      markCents: livePos.markCents,
      unrealizedPnlCents: livePos.unrealizedPnlCents,
      viz: livePos.viz,
      // Keep verifying-source chips from last full hub (delta-safe).
      sourceChips: p.sourceChips ?? [],
    };
  });

  // Held symbols on watch/trend tickers: refresh mark path when same symbol held.
  const heldBySymbol = new Map(live.positions.map((p) => [p.symbol.toUpperCase(), p]));
  const watchlists = hub.watchlists.map((w) => {
    const held = heldBySymbol.get(w.symbol.toUpperCase());
    if (!held || !w.viz) return w;
    return {
      ...w,
      viz: {
        ...held.viz,
        // Keep watch relevance bands from static hub; held tone wins via heldVsCost.
        strengthBand: w.viz.strengthBand,
        strengthTicks: w.viz.strengthTicks,
        relevanceBand: w.viz.relevanceBand,
        direction: w.viz.direction,
      },
      sourceChips: w.sourceChips ?? [],
    };
  });
  const trendCandidates = hub.trendCandidates.map((t) => {
    const held = heldBySymbol.get(t.symbol.toUpperCase());
    if (!held || !t.viz) return t;
    return {
      ...t,
      viz: {
        ...held.viz,
        strengthBand: t.viz.strengthBand,
        strengthTicks: t.viz.strengthTicks,
        relevanceBand: t.viz.relevanceBand,
        direction: t.direction,
      },
    };
  });

  return {
    ...hub,
    equity: {
      ...live.equity,
      sourceChips: hub.equity.sourceChips ?? live.equity.sourceChips ?? [],
    },
    positions,
    watchlists,
    trendCandidates,
    freshness: {
      ...hub.freshness,
      fetchedAt: live.fetchedAt,
    },
  };
}
