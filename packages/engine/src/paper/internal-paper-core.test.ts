import { describe, expect, it } from 'vitest';
import { computeInternalPaperFill, DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS } from '@hftr/contracts';
import { computeInternalPaperCoreFill } from './internal-paper-core';
import type { DeterministicActionTask, QuoteSnapshot } from '@hftr/contracts';

describe('InternalPaperCore', () => {
  const quote: QuoteSnapshot = {
    symbol: 'AAPL',
    bidCents: 10_000,
    askCents: 10_020,
    lastCents: 10_010,
    asOfIso: '2026-07-18T12:00:00.000Z',
    feedClass: 'synthetic',
  };

  it('applies default 2 bps buy slippage to ask', () => {
    expect(DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS).toBe(2);
    const r = computeInternalPaperFill({
      actionVerb: 'buy',
      orderType: 'market',
      limitPriceCents: null,
      quote,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 10020 * 2 / 10000 = 2 → 10022
      expect(r.priceCents).toBe(10_022);
    }
  });

  it('rejects unmarketable buy limit', () => {
    const r = computeInternalPaperFill({
      actionVerb: 'buy',
      orderType: 'limit',
      limitPriceCents: 10_000,
      quote,
    });
    expect(r).toEqual({ ok: false, reason: 'unmarketable' });
  });

  it('computeInternalPaperCoreFill adds venueOrderId', () => {
    const task = {
      instructionRef: '00000000-0000-4000-8000-000000000010',
      symbol: 'AAPL',
      actionVerb: 'buy',
      orderType: 'market',
      timeInForce: 'day',
      quantityInt: '1',
      quantityScale: 0,
      limitPriceCents: null,
      stopPriceCents: null,
      fillTimeoutMs: 5_000,
      idempotencyKey: 'idempotency_key_abcdefgh',
      lineage: { quantityRef: 'nv_q', limitPriceRef: null, fillTimeoutRef: 'nv_t' },
    } satisfies DeterministicActionTask;
    const r = computeInternalPaperCoreFill(task, quote);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.venueOrderId.startsWith('psim_')).toBe(true);
      expect(r.priceCents).toBe(10_022);
    }
  });
});
