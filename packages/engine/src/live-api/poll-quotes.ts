import type { BrokerAdapter, QuoteSnapshot } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getSyntheticQuote } from '../dispatch/quotes';

const DEFAULT_MAX_SYMBOLS = 8;

/** Qualitative poll row — no raw price digits; safe for summaries and logs. */
export interface QuotePollStatus {
  symbol: string;
  feedClass: string;
  ok: boolean;
}

export interface PollQuotesResult {
  statuses: QuotePollStatus[];
  /** Engine-internal quotes keyed by uppercase symbol (includes prices for ValueRef path). */
  quotes: Map<string, QuoteSnapshot>;
}

export interface PollQuotesOptions {
  instruments: readonly string[];
  clock: Clock;
  adapter?: BrokerAdapter | null;
  maxSymbols?: number;
}

function normalizeSymbols(instruments: readonly string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of instruments) {
    const sym = raw.trim().toUpperCase();
    if (sym.length < 1 || sym.length > 12) continue;
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Poll latest quotes for trend / live_api symbol resolution.
 * Returns honest feedClass per symbol; prices stay inside QuoteSnapshot for
 * deterministic engine use only — never embed digits in status rows.
 */
export async function pollQuotes(opts: PollQuotesOptions): Promise<PollQuotesResult> {
  const cap = opts.maxSymbols ?? DEFAULT_MAX_SYMBOLS;
  const symbols = normalizeSymbols(opts.instruments, cap);
  const statuses: QuotePollStatus[] = [];
  const quotes = new Map<string, QuoteSnapshot>();

  for (const symbol of symbols) {
    if (opts.adapter) {
      try {
        const quote = await opts.adapter.getQuote(symbol);
        quotes.set(symbol, quote);
        statuses.push({
          symbol,
          feedClass: quote.feedClass,
          ok: true,
        });
      } catch {
        statuses.push({
          symbol,
          feedClass: 'quote_unavailable',
          ok: false,
        });
      }
      continue;
    }

    const quote = getSyntheticQuote(symbol, opts.clock);
    quotes.set(symbol, quote);
    statuses.push({
      symbol,
      feedClass: quote.feedClass,
      ok: true,
    });
  }

  return { statuses, quotes };
}
