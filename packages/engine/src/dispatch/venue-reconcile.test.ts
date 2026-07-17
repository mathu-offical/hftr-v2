import { describe, expect, it } from 'vitest';
import { buildFillVerificationFields } from './paper-trade';

describe('buildFillVerificationFields', () => {
  it('passes when fill matches quantity and quote deviation is within bound', () => {
    const fields = buildFillVerificationFields({
      quantity: 5,
      quantityInt: '5',
      fillPriceCents: 10_000,
      quoteLastCents: 10_010,
      actionVerb: 'buy',
      limitPriceCents: null,
    });
    expect(fields.every((f) => f.pass)).toBe(true);
  });

  it('fails limit check when buy fill exceeds limit', () => {
    const fields = buildFillVerificationFields({
      quantity: 5,
      quantityInt: '5',
      fillPriceCents: 10_500,
      quoteLastCents: 10_500,
      actionVerb: 'buy',
      limitPriceCents: 10_400,
    });
    const limit = fields.find((f) => f.field === 'limit_respected');
    expect(limit?.pass).toBe(false);
  });

  it('fails quantity check when fill qty does not match instruction', () => {
    const fields = buildFillVerificationFields({
      quantity: 5,
      quantityInt: '4',
      fillPriceCents: 10_000,
      quoteLastCents: 10_000,
      actionVerb: 'sell',
      limitPriceCents: null,
    });
    const qty = fields.find((f) => f.field === 'quantity');
    expect(qty?.pass).toBe(false);
  });
});
