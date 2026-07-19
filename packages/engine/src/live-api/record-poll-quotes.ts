/**
 * Persist live_api / trend poll quotes as price ValueRefs for MarketModel fusion (D-172).
 */

import type { QuoteSnapshot } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { record } from '../calc/store';
import { MARKET_MODEL_QUOTE_TTL_MS } from '../calc/load-quote-value-refs';

/**
 * Record polled quotes as append-only price ValueRefs.
 * sourceId: live_api:quote:{SYMBOL} (module-agnostic mark for company fusion).
 * Never throws — fail-open per symbol.
 */
export async function recordPolledQuotesAsValueRefs(opts: {
  db: Db;
  clock: Clock;
  companyId: string;
  moduleId?: string | null;
  quotes: ReadonlyMap<string, QuoteSnapshot> | Iterable<[string, QuoteSnapshot]>;
  ttlMs?: number;
}): Promise<{ recorded: number; skipped: number }> {
  const ttlMs = opts.ttlMs ?? MARKET_MODEL_QUOTE_TTL_MS;
  let recorded = 0;
  let skipped = 0;
  const entries =
    opts.quotes instanceof Map ? opts.quotes.entries() : opts.quotes;

  for (const [rawSym, quote] of entries) {
    const symbol = rawSym.trim().toUpperCase();
    const lastCents = quote.lastCents ?? quote.askCents ?? quote.bidCents;
    if (lastCents === null || !Number.isFinite(lastCents) || lastCents <= 0) {
      skipped += 1;
      continue;
    }
    const feed = quote.feedClass ?? 'live_feed';
    const sourceClass =
      feed.includes('synthetic') ? 'synthetic_sim' : feed.includes('alpaca') || feed.includes('paper')
        ? 'broker_state'
        : 'live_feed';
    try {
      await record(opts.db, opts.clock, {
        kind: 'price',
        unit: 'USD_cents',
        scale: 0,
        valueInt: BigInt(Math.round(lastCents)),
        sourceClass,
        sourceId: `live_api:quote:${symbol}`,
        ttlMs,
        companyId: opts.companyId,
        moduleId: opts.moduleId ?? null,
      });
      recorded += 1;
    } catch {
      skipped += 1;
    }
  }
  return { recorded, skipped };
}
