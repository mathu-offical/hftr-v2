import type { BrokerAdapter, QuoteSnapshot } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';

/**
 * MarketModel quote resolution (D-122 Phase 1–2).
 * Prefer entitled live quotes; fuse multiple candidates by freshness; honest feedClass.
 * Does not submit orders — quotes / marks only.
 */

export interface ResolveMarketQuoteOpts {
  symbol: string;
  clock: Clock;
  /** Live/adapter quote when entitled; null → synthetic. */
  liveQuote?: QuoteSnapshot | null;
  /** Additional candidates (e.g. ValueRef-derived marks) — fused with liveQuote. */
  candidates?: readonly QuoteSnapshot[];
}

export interface ResolvedMarketQuote {
  quote: QuoteSnapshot;
  sourceClass: 'broker_state' | 'live_feed' | 'synthetic_sim';
  usedLive: boolean;
}

function hasPrice(q: QuoteSnapshot): boolean {
  return q.lastCents != null || q.askCents != null || q.bidCents != null;
}

function sourceClassForFeed(feed: string): ResolvedMarketQuote['sourceClass'] {
  if (feed.includes('synthetic') || feed === 'synthetic_sim') return 'synthetic_sim';
  if (feed.includes('paper') || feed.includes('alpaca') || feed.includes('iex')) {
    return 'broker_state';
  }
  return 'live_feed';
}

function quoteAsOfMs(q: QuoteSnapshot): number {
  const t = Date.parse(q.asOfIso);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer newest non-synthetic quote with a price; else best synthetic; else null. */
export function fuseQuoteCandidates(
  candidates: readonly QuoteSnapshot[],
): QuoteSnapshot | null {
  const priced = candidates.filter(hasPrice);
  if (priced.length === 0) return null;
  const live = priced
    .filter((q) => sourceClassForFeed(q.feedClass ?? 'live_feed') !== 'synthetic_sim')
    .sort((a, b) => quoteAsOfMs(b) - quoteAsOfMs(a));
  if (live[0]) return live[0]!;
  return [...priced].sort((a, b) => quoteAsOfMs(b) - quoteAsOfMs(a))[0] ?? null;
}

export function resolveMarketQuote(opts: ResolveMarketQuoteOpts): ResolvedMarketQuote {
  const pooled: QuoteSnapshot[] = [];
  if (opts.liveQuote) pooled.push(opts.liveQuote);
  if (opts.candidates) pooled.push(...opts.candidates);
  const fused = fuseQuoteCandidates(pooled);

  if (fused) {
    const feed = fused.feedClass ?? 'live_feed';
    const sourceClass = sourceClassForFeed(feed);
    return {
      quote: {
        ...fused,
        symbol: fused.symbol.toUpperCase(),
        feedClass: feed,
      },
      sourceClass,
      usedLive: sourceClass !== 'synthetic_sim',
    };
  }
  return {
    quote: getSyntheticQuote(opts.symbol, opts.clock),
    sourceClass: 'synthetic_sim',
    usedLive: false,
  };
}

/** Best-effort adapter quote for MarketModel (never throws). */
export async function loadAdapterMarketQuote(
  adapter: BrokerAdapter | null | undefined,
  symbol: string,
): Promise<QuoteSnapshot | null> {
  if (!adapter || adapter.venue === 'paper_sim') return null;
  try {
    return await adapter.getQuote(symbol);
  } catch {
    return null;
  }
}

/**
 * Resolve a mark/quote for dispatch, exits, or equity using optional live adapter.
 */
export async function resolveMarketQuoteWithAdapter(opts: {
  symbol: string;
  clock: Clock;
  adapter?: BrokerAdapter | null;
  candidates?: readonly QuoteSnapshot[];
}): Promise<ResolvedMarketQuote> {
  const liveQuote = await loadAdapterMarketQuote(opts.adapter, opts.symbol);
  return resolveMarketQuote({
    symbol: opts.symbol,
    clock: opts.clock,
    liveQuote,
    ...(opts.candidates !== undefined ? { candidates: opts.candidates } : {}),
  });
}
