import type { BrokerAdapter, QuoteSnapshot } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';

export interface LookbackQuoteStatus {
  symbol: string;
  feedClass: string;
  ok: boolean;
}

export interface ResolveLookbackQuotesResult {
  statuses: LookbackQuoteStatus[];
  quotes: Map<string, QuoteSnapshot>;
}

export interface ResolveLookbackQuotesOptions {
  instruments: readonly string[];
  atMs: number;
  clock: Clock;
  adapter?: BrokerAdapter | null;
  maxSymbols?: number;
}

const DEFAULT_MAX_SYMBOLS = 8;

/**
 * Resolve quotes near a historical timestamp for trend lookback.
 * Prefers adapter.getQuoteAt when present; otherwise synthetic_sim.
 * Status rows stay qualitative (no price digits).
 */
export async function resolveLookbackQuotes(
  opts: ResolveLookbackQuotesOptions,
): Promise<ResolveLookbackQuotesResult> {
  const cap = opts.maxSymbols ?? DEFAULT_MAX_SYMBOLS;
  const statuses: LookbackQuoteStatus[] = [];
  const quotes = new Map<string, QuoteSnapshot>();
  const seen = new Set<string>();
  const atIso = new Date(opts.atMs).toISOString();
  const lookbackClock = {
    nowMs: () => opts.atMs,
    nowIso: () => atIso,
  } satisfies Clock;

  for (const raw of opts.instruments) {
    if (seen.size >= cap) break;
    const symbol = raw.trim().toUpperCase();
    if (symbol.length < 1 || symbol.length > 12) continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    if (opts.adapter?.getQuoteAt) {
      try {
        const quote = await opts.adapter.getQuoteAt(symbol, atIso);
        quotes.set(symbol, quote);
        statuses.push({
          symbol,
          feedClass: quote.feedClass,
          ok: true,
        });
        continue;
      } catch {
        statuses.push({
          symbol,
          feedClass: 'lookback_unavailable',
          ok: false,
        });
        continue;
      }
    }

    const quote = getSyntheticQuote(symbol, lookbackClock);
    quotes.set(symbol, quote);
    statuses.push({
      symbol,
      feedClass: quote.feedClass,
      ok: true,
    });
  }

  return { statuses, quotes };
}
