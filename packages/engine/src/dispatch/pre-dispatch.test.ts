import { describe, expect, it } from 'vitest';
import type { DeterministicActionTask, GuardrailEvaluation, LimitsSnapshot } from '@hftr/contracts';
import { preDispatchGauntlet } from './pre-dispatch';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const MODULE_ID = '00000000-0000-4000-8000-000000000002';

function task(overrides: Partial<DeterministicActionTask> = {}): DeterministicActionTask {
  return {
    instructionRef: '11111111-1111-1111-1111-111111111111',
    symbol: 'AAPL',
    actionVerb: 'buy',
    orderType: 'market',
    timeInForce: 'day',
    quantityInt: '10',
    quantityScale: 0,
    limitPriceCents: null,
    stopPriceCents: null,
    fillTimeoutMs: 60_000,
    idempotencyKey: 'test-key-12345678',
    clientOrderId: 'co_test_order_01',
    lineage: {
      quantityRef: 'qty-ref',
      limitPriceRef: null,
      fillTimeoutRef: 'tif-ref',
    },
    ...overrides,
  };
}

function baseCtx() {
  return {
    mode: 'paper' as const,
    sessionPhase: 'open' as const,
    effectiveCapCents: 1_000_000n,
    priceCents: 15_000,
    liveGateBlocked: true,
  };
}

function limitsSnapshot(overrides: Partial<LimitsSnapshot> = {}): LimitsSnapshot {
  return {
    schemaVersion: 1,
    companyId: COMPANY_ID,
    moduleId: MODULE_ID,
    mode: 'paper',
    evaluatedAt: new Date(1_750_000_000_000).toISOString(),
    sessionPhase: 'open',
    limits: [],
    overallPass: true,
    ...overrides,
  };
}

function guardrailEvaluation(overrides: Partial<GuardrailEvaluation> = {}): GuardrailEvaluation {
  return {
    schemaVersion: 1,
    packageRef: {
      packageId: 'grd-003',
      catalogVersion: 'v1_snapshot_2026_07_16',
      name: 'Liquidity and quote quality',
      class: 'microstructure',
    },
    outcome: 'pass',
    firedTriggers: [],
    failureCodes: [],
    evidence: 'guardrail pass',
    evaluatedAt: new Date(1_750_000_000_000).toISOString(),
    ...overrides,
  };
}

describe('preDispatchGauntlet', () => {
  it('passes a valid paper buy within cap', () => {
    const result = preDispatchGauntlet(task(), {
      ...baseCtx(),
      sessionPhase: 'closed',
    });
    expect(result.ok).toBe(true);
  });

  it('passes when limits and guardrails both pass', () => {
    const result = preDispatchGauntlet(task(), {
      ...baseCtx(),
      limitsSnapshot: limitsSnapshot({
        limits: [
          {
            domain: 'buying_power',
            status: 'pass',
            valueInt: '1000000',
            unit: 'USD_cents',
            evidence: 'buying power ok',
            hardEnvelopeRef: null,
            operatorCapInt: null,
            calcValueInt: null,
          },
        ],
      }),
      guardrailEvaluations: [guardrailEvaluation()],
    });
    expect(result.ok).toBe(true);
    expect(result.detail).toBe('pre_dispatch_pass');
  });

  it('blocks when operating limits snapshot fails overallPass', () => {
    const result = preDispatchGauntlet(task(), {
      ...baseCtx(),
      limitsSnapshot: limitsSnapshot({
        overallPass: false,
        limits: [
          {
            domain: 'order_frequency',
            status: 'block',
            valueInt: '0',
            unit: 'orders_per_min',
            evidence: 'order frequency cap reached: 10/10 requests in last minute',
            hardEnvelopeRef: null,
            operatorCapInt: null,
            calcValueInt: null,
          },
        ],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('limits_block');
    expect(result.detail).toContain('order frequency');
  });

  it('maps buying_power limit blocks to capital_limit_block', () => {
    const result = preDispatchGauntlet(task(), {
      ...baseCtx(),
      limitsSnapshot: limitsSnapshot({
        overallPass: false,
        limits: [
          {
            domain: 'buying_power',
            status: 'block',
            valueInt: null,
            unit: 'USD_cents',
            evidence: 'buying_power inputs missing',
            hardEnvelopeRef: null,
            operatorCapInt: null,
            calcValueInt: null,
          },
        ],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('capital_limit_block');
  });

  it('blocks when any guardrail evaluation outcome is block', () => {
    const result = preDispatchGauntlet(task(), {
      ...baseCtx(),
      limitsSnapshot: limitsSnapshot(),
      guardrailEvaluations: [
        guardrailEvaluation(),
        guardrailEvaluation({
          outcome: 'block',
          firedTriggers: ['spread_above_ceiling'],
          failureCodes: ['SPREAD_CEILING_BREACH'],
          evidence: 'guardrail Liquidity fired triggers: spread_above_ceiling',
        }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('guardrail_block');
    expect(result.detail).toContain('spread_above_ceiling');
  });

  it('blocks live when gate is not armed', () => {
    const result = preDispatchGauntlet(task(), {
      ...baseCtx(),
      mode: 'live',
    });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('live_gate_blocked');
  });

  it('blocks buys that exceed effective cap', () => {
    const result = preDispatchGauntlet(task({ quantityInt: '100' }), {
      ...baseCtx(),
      effectiveCapCents: 10_000n,
    });
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('capital_limit_block');
  });
});
