import { describe, expect, it, vi } from 'vitest';
import type { BrokerAdapter, DeterministicActionTask } from '@hftr/contracts';
import { fillPriceDeltaBps } from '@hftr/contracts';
import { createFixedClock } from '../clock';
import { shadowVerifyAndPersistBookDelta } from './book-delta';

function baseTask(): DeterministicActionTask {
  return {
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
    idempotencyKey: 'idem_test_shadow_01',
    clientOrderId: 'client_order_shadow_01',
    lineage: {
      quantityRef: 'nv_q',
      limitPriceRef: null,
      fillTimeoutRef: 'nv_t',
    },
  };
}

describe('fillPriceDeltaBps', () => {
  it('measures provider vs internal divergence', () => {
    expect(fillPriceDeltaBps({ internalPriceCents: 10_000, referencePriceCents: 10_100 })).toBe(
      100,
    );
  });
});

describe('shadowVerifyAndPersistBookDelta', () => {
  const clock = createFixedClock(1_750_000_000_000);

  it('persists fill_price BookDelta when provider fills', async () => {
    let insertCount = 0;
    const db = {
      insert: () => {
        insertCount += 1;
        if (insertCount === 1) {
          return {
            values: () => ({
              returning: async () => [{ id: '00000000-0000-4000-8000-000000000099' }],
            }),
          };
        }
        return {
          values: async () => undefined,
        };
      },
    } as never;

    const adapter = {
      venue: 'alpaca_paper',
      getQuote: async () => null,
      submitOrder: async () => ({
        accepted: true,
        venueOrderId: 'vo_1',
        rejectReason: null,
        clientOrderId: 'bv_client_order_shadow_01',
        requestId: 'req_1',
      }),
      cancelOrder: async () => ({
        accepted: true,
        venueOrderId: 'vo_1',
        rejectReason: null,
      }),
      getFills: async () => [],
      getOrderByClientId: async () => ({
        venueOrderId: 'vo_1',
        clientOrderId: 'bv_client_order_shadow_01',
        status: 'filled',
        avgFillPriceCents: 10_050,
        filledQtyInt: '1',
        filledQtyScale: 0,
        updatedAtMs: clock.nowMs(),
      }),
    } as unknown as BrokerAdapter;

    const result = await shadowVerifyAndPersistBookDelta(db, clock, {
      adapter,
      task: baseTask(),
      shadowClientOrderId: 'bv_client_order_shadow_01',
      internalPriceCents: 10_000,
      companyId: '00000000-0000-4000-8000-000000000001',
      engineModuleId: '00000000-0000-4000-8000-000000000002',
      instructionId: '00000000-0000-4000-8000-000000000003',
      traceId: '00000000-0000-4000-8000-000000000004',
      routingMode: 'both_verify',
      fillTimeoutMs: 5_000,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deltaBps).toBe(50);
      expect(result.bookDeltaId).toBe('00000000-0000-4000-8000-000000000099');
    }
    expect(insertCount).toBe(2);
    void vi;
  });
});
