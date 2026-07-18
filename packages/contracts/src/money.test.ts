import { describe, expect, it } from 'vitest';
import { formatUsdFromCents } from './money';

describe('formatUsdFromCents', () => {
  it('formats bigint cents with thousands separators', () => {
    expect(formatUsdFromCents(1_000_000n)).toBe('$10,000.00');
    expect(formatUsdFromCents(1_024_530n)).toBe('$10,245.30');
  });

  it('accepts decimal string cents', () => {
    expect(formatUsdFromCents('1000000')).toBe('$10,000.00');
    expect(formatUsdFromCents('99')).toBe('$0.99');
  });

  it('returns null for null input', () => {
    expect(formatUsdFromCents(null)).toBeNull();
  });

  it('formats negative values', () => {
    expect(formatUsdFromCents(-250n)).toBe('-$2.50');
  });
});
