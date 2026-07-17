import { describe, expect, it } from 'vitest';
import type { DeterministicActionTask, QuoteSnapshot } from '@hftr/contracts';
import { createPaperSimAdapter } from './paper-sim';

const T0 = 1_752_700_000_000;

function quote(symbol: string): QuoteSnapshot {
  return {
    symbol,
    bidCents: 9_990,
    askCents: 10_010,
    lastCents: 10_000,
    asOfIso: new Date(T0).toISOString(),
    feedClass: 'fixture',
  };
}

function task(overrides: Partial<DeterministicActionTask> = {}): DeterministicActionTask {
  return {
    instructionRef: '00000000-0000-4000-8000-000000000001',
    symbol: 'TEST',
    actionVerb: 'buy',
    orderType: 'market',
    timeInForce: 'day',
    quantityInt: '10',
    quantityScale: 0,
    limitPriceCents: null,
    stopPriceCents: null,
    fillTimeoutMs: 30_000,
    idempotencyKey: 'testkey-0001',
    lineage: { quantityRef: 'nv_q', limitPriceRef: null, fillTimeoutRef: 'nv_t' },
    ...overrides,
  };
}

describe('paper-sim adapter', () => {
  it('fills a market buy with slippage against the ask and debits cash', async () => {
    const adapter = createPaperSimAdapter({
      nowMs: () => T0,
      getQuote: quote,
      startingCashCents: 1_000_000,
    });
    const result = await adapter.submitOrder(task());
    expect(result.accepted).toBe(true);

    const fills = await adapter.getFills(new Date(T0 - 1000).toISOString());
    expect(fills).toHaveLength(1);
    expect(fills[0]!.priceCents).toBeGreaterThanOrEqual(10_010); // ask + slippage

    const balances = await adapter.getBalances();
    expect(balances.cashCents).toBeLessThan(1_000_000);
  });

  it('rejects an unmarketable limit buy', async () => {
    const adapter = createPaperSimAdapter({
      nowMs: () => T0,
      getQuote: quote,
      startingCashCents: 1_000_000,
    });
    const result = await adapter.submitOrder(task({ orderType: 'limit', limitPriceCents: 9_000 }));
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('unmarketable');
  });

  it('rejects buys beyond available cash', async () => {
    const adapter = createPaperSimAdapter({
      nowMs: () => T0,
      getQuote: quote,
      startingCashCents: 100, // $1
    });
    const result = await adapter.submitOrder(task());
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('insufficient_funds');
  });

  it('fails closed when a non-order action reaches order submission', async () => {
    const adapter = createPaperSimAdapter({
      nowMs: () => T0,
      getQuote: quote,
      startingCashCents: 1_000_000,
    });

    const result = await adapter.submitOrder(task({ actionVerb: 'cancel' }));

    expect(result).toMatchObject({
      accepted: false,
      venueOrderId: null,
      rejectReason: 'unsupported_action_verb',
    });
    expect(await adapter.getFills(new Date(T0 - 1000).toISOString())).toHaveLength(0);
    expect((await adapter.getBalances()).cashCents).toBe(1_000_000);
  });

  it('is deterministic for identical inputs', async () => {
    const run = async () => {
      const adapter = createPaperSimAdapter({
        nowMs: () => T0,
        getQuote: quote,
        startingCashCents: 1_000_000,
      });
      await adapter.submitOrder(task());
      return (await adapter.getBalances()).cashCents;
    };
    expect(await run()).toBe(await run());
  });
});
