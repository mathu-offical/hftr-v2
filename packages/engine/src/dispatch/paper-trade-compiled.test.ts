import { describe, expect, it, vi } from 'vitest';
import { createFixedClock } from '../clock';
import * as finalizer from './instruction-finalizer';
import { executePaperTradeFromInstruction } from './paper-trade';

vi.mock('./execution-context', () => ({
  resolveExecutionContext: vi.fn(async () => {
    throw new Error('live_gate_blocked');
  }),
}));

describe('executePaperTradeFromInstruction', () => {
  const clock = createFixedClock(1_750_000_000_000);

  it('maps InstructionFinalizeError to blocked failure codes', async () => {
    vi.spyOn(finalizer, 'resolveInstructionFromRefs').mockRejectedValueOnce(
      new finalizer.InstructionFinalizeError('ref_missing', 'unknown ValueRef: nv_x', 'nv_x'),
    );

    const result = await executePaperTradeFromInstruction({} as never, clock, {
      instructionId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.outcome).toBe('blocked');
    expect(result.failureCode).toBe('broker_policy_block');
    expect(result.detail).toContain('unknown ValueRef');
  });

  it('blocks non buy/sell compiled verbs before venue path', async () => {
    vi.spyOn(finalizer, 'resolveInstructionFromRefs').mockResolvedValueOnce({
      instructionId: '11111111-1111-4111-8111-111111111111',
      companyId: '00000000-0000-4000-8000-000000000001',
      moduleId: '00000000-0000-4000-8000-000000000002',
      actionVerb: 'cancel',
      symbol: 'AAPL',
      orderType: 'market',
      timeInForce: 'day',
      quantityInt: '1',
      quantityScale: 0,
      limitPriceCents: null,
      stopPriceCents: null,
      fillTimeoutMs: 30_000,
      clientOrderId: 'co_test',
      envelope: {
        contractVersion: '1.0.0',
        producerRunId: null,
        companyId: '00000000-0000-4000-8000-000000000001',
        moduleId: '00000000-0000-4000-8000-000000000002',
        authorityClass: 'DETERMINISTIC',
        mutationClass: 'IMMUTABLE',
        queueClass: 'DISPATCH',
        priorityBand: 'HIGH',
        timeoutClass: 'SHORT',
        idempotencyKey: 'promote-test',
        replayHash: null,
        controlSnapshotRef: null,
        causationRefs: [],
        expiresAt: null,
      },
      lineage: {
        quantityRef: 'nv_q',
        limitPriceRef: null,
        fillTimeoutRef: 'nv_t',
      },
    });

    const result = await executePaperTradeFromInstruction({} as never, clock, {
      instructionId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.outcome).toBe('blocked');
    expect(result.failureCode).toBe('broker_policy_block');
    expect(result.detail).toContain('cancel');
  });
});
