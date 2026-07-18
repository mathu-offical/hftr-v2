/**
 * Wilder-style ATR from OHLC bars (cents). Model-free calculator input for
 * atr_stream ValueRefs — live bars when available, else caller falls back
 * to syntheticAtrCents.
 */

export interface OhlcBarCents {
  highCents: number;
  lowCents: number;
  closeCents: number;
}

/** True range in cents for bar i given prior close. */
export function trueRangeCents(bar: OhlcBarCents, prevCloseCents: number): number {
  const hl = Math.abs(bar.highCents - bar.lowCents);
  const hc = Math.abs(bar.highCents - prevCloseCents);
  const lc = Math.abs(bar.lowCents - prevCloseCents);
  return Math.max(hl, hc, lc);
}

/**
 * Average true range over the last `period` bars (default 14).
 * Returns 0 when insufficient bars.
 */
export function computeAtrCents(bars: readonly OhlcBarCents[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const start = bars.length - period;
  let sum = 0;
  for (let i = start; i < bars.length; i++) {
    const prev = bars[i - 1]!;
    const bar = bars[i]!;
    sum += trueRangeCents(bar, prev.closeCents);
  }
  return Math.max(1, Math.floor(sum / period));
}

export function atrStreamSourceId(symbol: string): string {
  return `atr_stream:${symbol.toUpperCase()}`;
}
