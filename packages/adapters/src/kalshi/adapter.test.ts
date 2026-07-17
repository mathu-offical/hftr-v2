import { describe, expect, it } from 'vitest';
import type { DeterministicActionTask } from '@hftr/contracts';
import {
  createKalshiDemoAdapter,
  KALSHI_DEMO_STARTING_CASH_CENTS,
  KALSHI_DEMO_SYNTHETIC_MID_CENTS,
} from './adapter';

const T0 = 1_752_700_000_000;

function task(overrides: Partial<DeterministicActionTask> = {}): DeterministicActionTask {
  return {
    instructionRef: '00000000-0000-4000-8000-000000000001',
    symbol: 'KXHIGHNY-26JUL-T75',
    actionVerb: 'buy',
    orderType: 'limit',
    timeInForce: 'day',
    quantityInt: '10',
    quantityScale: 0,
    limitPriceCents: KALSHI_DEMO_SYNTHETIC_MID_CENTS + 5,
    stopPriceCents: null,
    fillTimeoutMs: 30_000,
    idempotencyKey: 'kalshi-demo-01',
    lineage: { quantityRef: 'nv_q', limitPriceRef: 'nv_p', fillTimeoutRef: 'nv_t' },
    ...overrides,
  };
}

describe('kalshi demo adapter', () => {
  it('throws when demoMode is false (live fail-closed)', () => {
    expect(() => createKalshiDemoAdapter({ nowMs: () => T0, demoMode: false })).toThrow(
      'kalshi_live_not_supported',
    );
  });

  it('returns synthetic 50¢ mid quote labeled as demo simulation', async () => {
    const adapter = createKalshiDemoAdapter({ nowMs: () => T0, demoMode: true });
    const quote = await adapter.getQuote('KXHIGHNY-26JUL-T75');
    expect(quote.lastCents).toBe(KALSHI_DEMO_SYNTHETIC_MID_CENTS);
    expect(quote.feedClass).toBe('kalshi_demo_simulation');
  });

  it('starts with $10,000 demo cash and buying power', async () => {
    const adapter = createKalshiDemoAdapter({ nowMs: () => T0, demoMode: true });
    const balances = await adapter.getBalances();
    expect(balances.cashCents).toBe(KALSHI_DEMO_STARTING_CASH_CENTS);
    expect(balances.buyingPowerCents).toBe(KALSHI_DEMO_STARTING_CASH_CENTS);
  });

  it('accepts a limit buy, records fill, and debits cash', async () => {
    const adapter = createKalshiDemoAdapter({ nowMs: () => T0, demoMode: true });
    const result = await adapter.submitOrder(task());
    expect(result.accepted).toBe(true);
    expect(result.venueOrderId).toMatch(/^kdemo_/);

    const fills = await adapter.getFills(new Date(T0 - 1000).toISOString());
    expect(fills).toHaveLength(1);
    expect(fills[0]!.priceCents).toBe(KALSHI_DEMO_SYNTHETIC_MID_CENTS + 1);

    const balances = await adapter.getBalances();
    const expectedDebit = 10 * (KALSHI_DEMO_SYNTHETIC_MID_CENTS + 1);
    expect(balances.cashCents).toBe(KALSHI_DEMO_STARTING_CASH_CENTS - expectedDebit);
  });

  it('rejects unmarketable limit buys', async () => {
    const adapter = createKalshiDemoAdapter({ nowMs: () => T0, demoMode: true });
    const result = await adapter.submitOrder(
      task({ limitPriceCents: KALSHI_DEMO_SYNTHETIC_MID_CENTS - 10 }),
    );
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('unmarketable');
  });

  it('rejects non-limit order types', async () => {
    const adapter = createKalshiDemoAdapter({ nowMs: () => T0, demoMode: true });
    const result = await adapter.submitOrder(task({ orderType: 'market', limitPriceCents: null }));
    expect(result.accepted).toBe(false);
    expect(result.rejectReason).toBe('unsupported_order_type');
  });

  it('is deterministic for identical inputs', async () => {
    const run = async () => {
      const adapter = createKalshiDemoAdapter({ nowMs: () => T0, demoMode: true });
      await adapter.submitOrder(task());
      return (await adapter.getBalances()).cashCents;
    };
    expect(await run()).toBe(await run());
  });
});
