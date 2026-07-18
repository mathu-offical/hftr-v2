import type { QuoteSnapshot } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';

/**
 * MarketModel quote resolution (D-122 Phase 1).
 * Prefer an entitled live quote when provided; otherwise honest synthetic fallback.
 * Does not submit orders — quotes only.
 */

export interface ResolveMarketQuoteOpts {
  symbol: string;
  clock: Clock;
  /** Live/adapter quote when entitled; null → synthetic. */
  liveQuote?: QuoteSnapshot | null;
}

export interface ResolvedMarketQuote {
  quote: QuoteSnapshot;
  sourceClass: 'broker_state' | 'live_feed' | 'synthetic_sim';
  usedLive: boolean;
}

export function resolveMarketQuote(opts: ResolveMarketQuoteOpts): ResolvedMarketQuote {
  const live = opts.liveQuote ?? null;
  if (live && (live.lastCents != null || live.askCents != null || live.bidCents != null)) {
    const feed = live.feedClass ?? 'live_feed';
    const sourceClass =
      feed.includes('synthetic') || feed === 'synthetic_sim'
        ? 'synthetic_sim'
        : feed.includes('paper') || feed.includes('alpaca') || feed.includes('iex')
          ? 'broker_state'
          : 'live_feed';
    return {
      quote: {
        ...live,
        symbol: live.symbol.toUpperCase(),
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
