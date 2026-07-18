import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { isExpired, loadLatestBySourceId, record } from './store';
import { atrStreamSourceId, computeAtrCents, type OhlcBarCents } from './atr';
import { syntheticAtrCents } from '../dispatch/position-exits';

/**
 * Prefer live atr_stream ValueRef; else compute from bars and record;
 * else synthetic ATR proxy.
 */
export async function resolveAtrCents(args: {
  db: Db;
  clock: Clock;
  symbol: string;
  markCents: number;
  companyId?: string;
  moduleId?: string;
  bars?: readonly OhlcBarCents[];
}): Promise<{ atrCents: number; source: 'atr_stream' | 'bars' | 'synthetic' }> {
  const sourceId = atrStreamSourceId(args.symbol);
  const existing = await loadLatestBySourceId(args.db, sourceId);
  if (existing && !isExpired(existing, args.clock) && existing.kind === 'price') {
    const v = Number(existing.valueInt);
    if (Number.isFinite(v) && v > 0) {
      return { atrCents: v, source: 'atr_stream' };
    }
  }

  if (args.bars && args.bars.length >= 15) {
    const atr = computeAtrCents(args.bars, 14);
    if (atr > 0) {
      await record(args.db, args.clock, {
        kind: 'price',
        unit: 'USD_cents',
        scale: 0,
        valueInt: BigInt(atr),
        sourceClass: 'live_feed',
        sourceId,
        ttlMs: 15 * 60_000,
        companyId: args.companyId ?? null,
        moduleId: args.moduleId ?? null,
      });
      return { atrCents: atr, source: 'bars' };
    }
  }

  return { atrCents: syntheticAtrCents(args.markCents), source: 'synthetic' };
}
