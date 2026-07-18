import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFixedClock } from '../clock';
import { sliceDrainIntervalMs } from './child-order-scheduler';
import { enqueueNextChildSlice, type ChildDrainState } from './paper-trade-child-drain';

const enqueueMock = vi.fn();

vi.mock('../queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}));

function baseDrainState(slices: number[]): ChildDrainState {
  return {
    slices,
    filledThroughIndex: 0,
    basePriceCents: 100,
    venueOrderId: 'psim_test',
    quoteRef: 'nv_q',
    actionVerb: 'buy',
    urgencyScalar: 1.2,
    fills: [],
    companyId: '00000000-0000-4000-8000-000000000001',
    moduleId: '00000000-0000-4000-8000-000000000002',
    instructionId: '11111111-1111-4111-8111-111111111111',
    symbol: 'AAPL',
    parentQty: slices.reduce((a, b) => a + b, 0),
    limitPriceCents: null,
    sessionSnapshot: {},
    venue: 'paper_sim',
    brokerConnectionId: null,
    quoteLastCents: 100,
    usedLiveMarketQuote: false,
    routingMode: 'funds_only',
  };
}

describe('enqueueNextChildSlice', () => {
  const clock = createFixedClock(1_750_000_000_000);

  beforeEach(() => {
    enqueueMock.mockReset();
  });

  it('enqueues child slice job with idempotency key and runAfterMs from urgency', async () => {
    const state = baseDrainState([3, 2, 1]);
    const taskId = '22222222-2222-4222-8222-222222222222';

    await enqueueNextChildSlice({} as never, clock, state, taskId, 1);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [, , def] = enqueueMock.mock.calls[0] as [
      unknown,
      unknown,
      {
        kind: string;
        idempotencyKey: string;
        runAfterMs: number;
        payload: { sliceIndex: number; taskId: string };
      },
    ];
    expect(def.kind).toBe('dispatch.paper_trade_child_slice');
    expect(def.idempotencyKey).toBe(`child-drain-${taskId}-s1`);
    expect(def.payload.sliceIndex).toBe(1);
    expect(def.runAfterMs).toBe(clock.nowMs() + sliceDrainIntervalMs(state.urgencyScalar));
  });
});
