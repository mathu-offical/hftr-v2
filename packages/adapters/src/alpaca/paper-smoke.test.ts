import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DeterministicActionTask } from '@hftr/contracts';
import { createAlpacaPaperAdapter } from './adapter';
import { fetchBars } from './bars';

const smokeEnabled = process.env.ALPACA_PAPER_SMOKE === '1';
const keyId = process.env.ALPACA_PAPER_KEY ?? process.env.ALPACA_PAPER_KEY_ID ?? '';
const secret = process.env.ALPACA_PAPER_SECRET ?? '';
const hasCreds = keyId.length >= 8 && secret.length >= 8;

function smokeTask(overrides: Partial<DeterministicActionTask> = {}): DeterministicActionTask {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return {
    instructionRef: randomUUID(),
    symbol: 'SPY',
    actionVerb: 'buy',
    orderType: 'market',
    timeInForce: 'day',
    quantityInt: '1',
    quantityScale: 0,
    limitPriceCents: null,
    stopPriceCents: null,
    fillTimeoutMs: 30_000,
    idempotencyKey: `smoke${suffix}`,
    clientOrderId: `smk_${suffix}`,
    lineage: { quantityRef: 'smoke_q', limitPriceRef: null, fillTimeoutRef: 'smoke_t' },
    ...overrides,
  };
}

describe.skipIf(!smokeEnabled || !hasCreds)('alpaca paper smoke (opt-in)', () => {
  const nowMs = () => Date.now();
  const credentials = { keyId, secret };

  it('verifyConnection returns connected against paper trading API', async () => {
    const adapter = createAlpacaPaperAdapter({ keyId, secret, nowMs });
    expect(await adapter.verifyConnection()).toBe('connected');
  });

  it('fetchBars returns alpaca_iex_paper bars', async () => {
    const result = await fetchBars({ symbol: 'SPY', limit: 3, credentials });
    expect(result.symbol).toBe('SPY');
    expect(result.feedClass).toBe('alpaca_iex_paper');
    expect(result.bars.length).toBeGreaterThan(0);
    expect(result.bars[0]?.close).toBeGreaterThan(0);
  });

  it('getBalances returns a buying-power snapshot', async () => {
    const adapter = createAlpacaPaperAdapter({ keyId, secret, nowMs });
    const balances = await adapter.getBalances();
    expect(balances.buyingPowerCents).toBeGreaterThanOrEqual(0);
    expect(balances.asOfIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it.skipIf(process.env.ALPACA_PAPER_SUBMIT !== '1')(
    'submitOrder places a tiny paper market order then reconciles by client id',
    async () => {
      const adapter = createAlpacaPaperAdapter({ keyId, secret, nowMs });
      const task = smokeTask();
      const clientOrderId = task.clientOrderId!;

      const submit = await adapter.submitOrder(task);
      expect(submit.clientOrderId).toBe(clientOrderId);

      if (submit.accepted && submit.venueOrderId) {
        const snapshot = await adapter.getOrderByClientId?.(clientOrderId);
        expect(snapshot?.clientOrderId).toBe(clientOrderId);
        await adapter.cancelOrder(submit.venueOrderId);
      }
    },
  );
});
