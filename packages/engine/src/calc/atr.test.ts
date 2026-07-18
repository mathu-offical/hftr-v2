import { describe, expect, it } from 'vitest';
import { atrStreamSourceId, computeAtrCents, trueRangeCents } from './atr';

describe('atr', () => {
  it('computes true range from high/low/prior close', () => {
    expect(trueRangeCents({ highCents: 110, lowCents: 90, closeCents: 100 }, 100)).toBe(20);
    expect(trueRangeCents({ highCents: 105, lowCents: 95, closeCents: 100 }, 80)).toBe(25);
  });

  it('computes ATR over period when enough bars', () => {
    const bars = Array.from({ length: 20 }, (_, i) => ({
      highCents: 10_100 + i,
      lowCents: 9_900 + i,
      closeCents: 10_000 + i,
    }));
    const atr = computeAtrCents(bars, 14);
    expect(atr).toBeGreaterThan(0);
    expect(atr).toBe(200); // hl span always 200
  });

  it('returns 0 when bars insufficient', () => {
    expect(computeAtrCents([{ highCents: 1, lowCents: 1, closeCents: 1 }], 14)).toBe(0);
  });

  it('builds atr_stream source id', () => {
    expect(atrStreamSourceId('aapl')).toBe('atr_stream:AAPL');
  });
});
