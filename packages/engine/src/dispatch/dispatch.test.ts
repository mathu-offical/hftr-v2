import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import { nextAverageCost, realizedOnSell } from './positions';
import { getSyntheticQuote } from './quotes';

describe('synthetic quotes', () => {
  const clock = createFixedClock(1_750_000_000_000);

  it('is deterministic for the same symbol and minute bucket', () => {
    const a = getSyntheticQuote('AAPL', clock);
    const b = getSyntheticQuote('aapl', clock);
    expect(a).toEqual(b);
    expect(a.symbol).toBe('AAPL');
  });

  it('produces a positive bid/ask spread around a sane price', () => {
    const q = getSyntheticQuote('TSLA', clock);
    expect(q.bidCents).not.toBeNull();
    expect(q.askCents).not.toBeNull();
    expect(q.askCents!).toBeGreaterThan(q.bidCents!);
    expect(q.lastCents!).toBeGreaterThanOrEqual(100);
    expect(q.feedClass).toBe('synthetic_sim');
  });

  it('differs across symbols', () => {
    expect(getSyntheticQuote('AAPL', clock).lastCents).not.toBe(
      getSyntheticQuote('MSFT', clock).lastCents,
    );
  });

  it('moves across minute buckets but stays bounded', () => {
    const later = createFixedClock(1_750_000_000_000 + 60_000);
    const a = getSyntheticQuote('NVDA', clock).lastCents!;
    const b = getSyntheticQuote('NVDA', later).lastCents!;
    expect(Math.abs(b - a) / a).toBeLessThan(0.02);
  });
});

describe('position math', () => {
  it('averages cost on accumulating buys with rounding', () => {
    // 10 @ $100.00, then 10 @ $110.00 → avg $105.00
    expect(nextAverageCost(10n, 10_000, 10n, 11_000)).toBe(10_500);
    // 1 @ $1.00, then 2 @ $1.01 → 302/3 = 100.67 → rounds to 101
    expect(nextAverageCost(1n, 100, 2n, 101)).toBe(101);
  });

  it('opens a fresh position at the fill price', () => {
    expect(nextAverageCost(0n, 0, 5n, 25_000)).toBe(25_000);
  });

  it('computes realized PnL against average cost, both directions', () => {
    expect(realizedOnSell(10n, 11_000, 10_000)).toBe(10_000n); // +$100.00
    expect(realizedOnSell(4n, 9_500, 10_000)).toBe(-2_000n); // -$20.00
    expect(realizedOnSell(3n, 10_000, 10_000)).toBe(0n);
  });
});
