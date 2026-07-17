import { createHash } from 'node:crypto';
import type { QuoteSnapshot } from '@hftr/contracts';
import type { Clock } from '../clock';

/**
 * Deterministic synthetic quote source for the paper loop (M2). Prices are a
 * pure function of (symbol, minute bucket): a stable per-symbol base price
 * plus a bounded random walk. Replaced by real live_api feeds (Alpaca IEX)
 * without changing any downstream code — everything consumes QuoteSnapshot.
 * feedClass is honestly labeled 'synthetic_sim'.
 */

function hashInt(input: string): number {
  return createHash('sha256').update(input).digest().readUInt32BE(0);
}

export function getSyntheticQuote(symbol: string, clock: Clock): QuoteSnapshot {
  const upper = symbol.toUpperCase();
  // Stable base price between $5.00 and $505.00 per symbol.
  const baseCents = 500 + (hashInt(`base:${upper}`) % 50_000);

  // Bounded walk: ±0.75% per minute bucket, deterministic per (symbol, bucket).
  const bucket = Math.floor(clock.nowMs() / 60_000);
  const drift = ((hashInt(`walk:${upper}:${bucket}`) % 1500) - 750) / 100_000;
  const midCents = Math.max(100, Math.round(baseCents * (1 + drift)));

  // Spread: 4 bps, minimum 1 cent.
  const halfSpread = Math.max(1, Math.round((midCents * 2) / 10_000));
  return {
    symbol: upper,
    bidCents: midCents - halfSpread,
    askCents: midCents + halfSpread,
    lastCents: midCents,
    asOfIso: clock.nowIso(),
    feedClass: 'synthetic_sim',
  };
}
