import { describe, expect, it } from 'vitest';
import { feeCentsFromNotional, roundTripFeeBpsFromAmounts } from './fees';

describe('fees', () => {
  it('computes fee cents from notional bps', () => {
    // 100_000 * 5 / 10000 = 50
    expect(feeCentsFromNotional(100_000, 5)).toBe(50);
    expect(feeCentsFromNotional(0, 5)).toBe(0);
  });

  it('derives round-trip fee bps from ledger amounts', () => {
    expect(roundTripFeeBpsFromAmounts(50, 100_000, 5)).toBe(5);
    expect(roundTripFeeBpsFromAmounts(0, 100_000, 5)).toBe(5);
  });
});
