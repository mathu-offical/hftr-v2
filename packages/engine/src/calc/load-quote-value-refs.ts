/**
 * Load recent price ValueRefs as MarketModel quote candidates (D-177).
 * Complements adapter / owner Alpaca teachers with entitled live_api / prior fill marks.
 */

import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import type { QuoteSnapshot } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { numericValues } from '@hftr/db/schema';
import type { Clock } from '../clock';

/** Quotes older than this are not used as MarketModel teachers (match dispatch TTL). */
export const MARKET_MODEL_QUOTE_TTL_MS = 90_000;

/** Half-spread proxy when ValueRef stores last/mark only (matches synthetic quote model). */
const HALF_SPREAD_BPS = 2;

export function quoteSourceIdsForSymbol(symbol: string): string[] {
  const sym = symbol.trim().toUpperCase();
  return [
    `alpaca_iex_paper:quote:${sym}`,
    `alpaca:quote:${sym}`,
    `live_api:quote:${sym}`,
    `paper_sim:quote:${sym}`,
    `synthetic_sim:${sym}`,
  ];
}

/**
 * Convert a stored price ValueRef into a QuoteSnapshot for MarketModel fusion.
 * Bid/ask synthesized ±2 bps when only last/mark is stored.
 */
export function valueRefPriceToQuoteSnapshot(args: {
  symbol: string;
  lastCents: number;
  asOfIso: string;
  sourceClass: string;
  sourceId: string;
}): QuoteSnapshot | null {
  if (!Number.isFinite(args.lastCents) || args.lastCents <= 0) return null;
  const half = Math.max(1, Math.floor((args.lastCents * HALF_SPREAD_BPS) / 10_000));
  const feedClass =
    args.sourceId.includes('alpaca_iex_paper')
      ? 'alpaca_iex_paper'
      : args.sourceId.startsWith('live_api:')
        ? 'live_api_mark'
        : args.sourceClass === 'synthetic_sim' || args.sourceId.startsWith('synthetic_sim')
          ? 'synthetic_sim'
          : args.sourceId.includes('alpaca')
            ? 'alpaca_iex_paper'
            : 'live_feed';
  return {
    symbol: args.symbol.trim().toUpperCase(),
    bidCents: Math.max(1, args.lastCents - half),
    askCents: args.lastCents + half,
    lastCents: args.lastCents,
    asOfIso: args.asOfIso,
    feedClass,
  };
}

/**
 * Load fresh company price ValueRefs for a symbol as MarketModel candidates.
 * Fail-open: empty array on error / no rows.
 */
export async function loadQuoteCandidatesFromValueRefs(
  db: Db,
  clock: Clock,
  opts: {
    companyId: string;
    symbol: string;
    ttlMs?: number;
  },
): Promise<QuoteSnapshot[]> {
  const sym = opts.symbol.trim().toUpperCase();
  const ttlMs = opts.ttlMs ?? MARKET_MODEL_QUOTE_TTL_MS;
  const since = new Date(clock.nowMs() - ttlMs);
  const sourceIds = quoteSourceIdsForSymbol(sym);

  try {
    const rows = await db
      .select({
        valueInt: numericValues.valueInt,
        sourceClass: numericValues.sourceClass,
        sourceId: numericValues.sourceId,
        capturedAt: numericValues.capturedAt,
      })
      .from(numericValues)
      .where(
        and(
          eq(numericValues.companyId, opts.companyId),
          eq(numericValues.kind, 'price'),
          inArray(numericValues.sourceId, sourceIds),
          gte(numericValues.capturedAt, since),
          isNotNull(numericValues.companyId),
        ),
      )
      .orderBy(desc(numericValues.capturedAt))
      .limit(12);

    const out: QuoteSnapshot[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const lastCents = Number(row.valueInt);
      const asOfIso = row.capturedAt.toISOString();
      const quote = valueRefPriceToQuoteSnapshot({
        symbol: sym,
        lastCents,
        asOfIso,
        sourceClass: row.sourceClass,
        sourceId: row.sourceId,
      });
      if (!quote) continue;
      const key = `${quote.feedClass}:${quote.lastCents}:${quote.asOfIso}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(quote);
    }
    return out;
  } catch {
    return [];
  }
}
