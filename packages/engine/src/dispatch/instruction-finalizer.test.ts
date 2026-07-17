import { describe, expect, it, vi } from 'vitest';
import { actionInstructions } from '@hftr/db/schema';
import { createFixedClock } from '../clock';
import * as store from '../calc/store';
import type { StoredRow } from '../calc/store';
import {
  InstructionFinalizeError,
  finalizeErrorToFailureCode,
  resolveInstructionFromRefs,
} from './instruction-finalizer';

const INSTRUCTION_ID = '11111111-1111-4111-8111-111111111111';
const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const MODULE_ID = '00000000-0000-4000-8000-000000000002';
const CLOCK_MS = 1_750_000_000_000;

function valueRow(overrides: {
  ref: string;
  kind: 'quantity' | 'duration_ms' | 'price';
  valueInt: bigint;
  sourceClass?: string;
  ttlMs?: bigint;
  capturedAt?: Date;
  sanityEnvelope?: Record<string, unknown>;
}): StoredRow {
  return {
    ref: overrides.ref,
    kind: overrides.kind,
    unit:
      overrides.kind === 'quantity' ? 'shares' : overrides.kind === 'price' ? 'USD_cents' : 'ms',
    scale: 0,
    valueInt: overrides.valueInt,
    timezone: overrides.kind === 'duration_ms' ? 'UTC' : null,
    sourceClass: overrides.sourceClass ?? 'derived',
    sourceId: `test:${overrides.ref}`,
    capturedAt: overrides.capturedAt ?? new Date(CLOCK_MS),
    ttlMs: overrides.ttlMs ?? 600_000n,
    parentRefs: [],
    sanityEnvelope: overrides.sanityEnvelope ?? {
      minInt: '1',
      maxInt: '100000',
      maxAgeMs: null,
      mustBePositive: true,
    },
    companyId: COMPANY_ID,
    moduleId: MODULE_ID,
    lineageHash: 'test',
    createdAt: overrides.capturedAt ?? new Date(CLOCK_MS),
  } as StoredRow;
}

function mockDb(instruction: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === actionInstructions) {
              return instruction ? [instruction] : [];
            }
            return [];
          },
        }),
      }),
    }),
  } as never;
}

function baseInstruction(refs: {
  quantityRef: string;
  fillTimeoutRef: string;
  limitPriceRef?: string | null;
}) {
  return {
    id: INSTRUCTION_ID,
    companyId: COMPANY_ID,
    moduleId: MODULE_ID,
    actionVerb: 'buy' as const,
    symbol: 'AAPL',
    orderType: 'market' as const,
    timeInForce: 'day' as const,
    quantityRef: refs.quantityRef,
    limitPriceRef: refs.limitPriceRef ?? null,
    stopPriceRef: null,
    fillTimeoutRef: refs.fillTimeoutRef,
    guardrailRefs: ['capital_limit_v1'],
    verificationSchemaVersion: 'trade_verify_v1',
    clientOrderId: 'co_test_order_01',
    status: 'pending' as const,
    envelope: {
      contractVersion: '1.0.0',
      producerRunId: INSTRUCTION_ID,
      companyId: COMPANY_ID,
      moduleId: MODULE_ID,
      authorityClass: 'DETERMINISTIC',
      mutationClass: 'IMMUTABLE',
      queueClass: 'DISPATCH',
      priorityBand: 'HIGH',
      timeoutClass: 'SHORT',
      idempotencyKey: 'promote-test-key',
      replayHash: null,
      controlSnapshotRef: null,
      causationRefs: [],
      expiresAt: null,
    },
    createdAt: new Date(CLOCK_MS),
    updatedAt: new Date(CLOCK_MS),
  };
}

describe('resolveInstructionFromRefs', () => {
  const clock = createFixedClock(CLOCK_MS);

  it('resolves quantity and fill timeout refs into task fields', async () => {
    const quantityRef = 'nv_qty_test';
    const timeoutRef = 'nv_timeout_test';
    const values: Record<string, StoredRow> = {
      [quantityRef]: valueRow({ ref: quantityRef, kind: 'quantity', valueInt: 12n }),
      [timeoutRef]: valueRow({
        ref: timeoutRef,
        kind: 'duration_ms',
        valueInt: 45_000n,
        sourceClass: 'band_seed',
        sanityEnvelope: { minInt: null, maxInt: null, maxAgeMs: null, mustBePositive: false },
      }),
    };
    vi.spyOn(store, 'load').mockImplementation(async (_db, ref) => {
      const row = values[ref];
      if (!row) throw new Error(`unknown ValueRef: ${ref}`);
      return row;
    });

    const db = mockDb(baseInstruction({ quantityRef, fillTimeoutRef: timeoutRef }));
    const resolved = await resolveInstructionFromRefs(db, clock, INSTRUCTION_ID);
    expect(resolved.quantityInt).toBe('12');
    expect(resolved.quantityScale).toBe(0);
    expect(resolved.fillTimeoutMs).toBe(45_000);
    expect(resolved.limitPriceCents).toBeNull();
    expect(resolved.lineage.quantityRef).toBe(quantityRef);
    vi.restoreAllMocks();
  });

  it('resolves optional limit price ref', async () => {
    const quantityRef = 'nv_qty_test';
    const timeoutRef = 'nv_timeout_test';
    const limitRef = 'nv_limit_test';
    const values: Record<string, StoredRow> = {
      [quantityRef]: valueRow({ ref: quantityRef, kind: 'quantity', valueInt: 5n }),
      [timeoutRef]: valueRow({
        ref: timeoutRef,
        kind: 'duration_ms',
        valueInt: 30_000n,
        sanityEnvelope: { minInt: null, maxInt: null, maxAgeMs: null, mustBePositive: false },
      }),
      [limitRef]: valueRow({
        ref: limitRef,
        kind: 'price',
        valueInt: 15_000n,
        sanityEnvelope: { minInt: null, maxInt: null, maxAgeMs: null, mustBePositive: false },
      }),
    };
    vi.spyOn(store, 'load').mockImplementation(async (_db, ref) => {
      const row = values[ref];
      if (!row) throw new Error(`unknown ValueRef: ${ref}`);
      return row;
    });

    const db = mockDb(
      baseInstruction({ quantityRef, fillTimeoutRef: timeoutRef, limitPriceRef: limitRef }),
    );
    const resolved = await resolveInstructionFromRefs(db, clock, INSTRUCTION_ID);
    expect(resolved.limitPriceCents).toBe(15_000);
    expect(resolved.lineage.limitPriceRef).toBe(limitRef);
    vi.restoreAllMocks();
  });

  it('fails closed when instruction row is missing', async () => {
    const db = mockDb(null);
    await expect(resolveInstructionFromRefs(db, clock, INSTRUCTION_ID)).rejects.toMatchObject({
      code: 'instruction_not_found',
    });
  });

  it('fails closed when a ValueRef is missing', async () => {
    const quantityRef = 'nv_missing_qty';
    const timeoutRef = 'nv_timeout_test';
    vi.spyOn(store, 'load').mockImplementation(async (_db, ref) => {
      if (ref === timeoutRef) {
        return valueRow({
          ref: timeoutRef,
          kind: 'duration_ms',
          valueInt: 30_000n,
          sanityEnvelope: { minInt: null, maxInt: null, maxAgeMs: null, mustBePositive: false },
        });
      }
      throw new Error(`unknown ValueRef: ${ref}`);
    });

    const db = mockDb(baseInstruction({ quantityRef, fillTimeoutRef: timeoutRef }));
    await expect(resolveInstructionFromRefs(db, clock, INSTRUCTION_ID)).rejects.toMatchObject({
      code: 'ref_missing',
      ref: quantityRef,
    });
    vi.restoreAllMocks();
  });

  it('fails closed when a ValueRef is stale', async () => {
    const quantityRef = 'nv_stale_qty';
    const timeoutRef = 'nv_timeout_test';
    vi.spyOn(store, 'load').mockImplementation(async (_db, ref) => {
      if (ref === quantityRef) {
        return valueRow({
          ref: quantityRef,
          kind: 'quantity',
          valueInt: 3n,
          capturedAt: new Date(CLOCK_MS - 600_000),
          ttlMs: 1n,
        });
      }
      return valueRow({
        ref: timeoutRef,
        kind: 'duration_ms',
        valueInt: 30_000n,
        sanityEnvelope: { minInt: null, maxInt: null, maxAgeMs: null, mustBePositive: false },
      });
    });

    const db = mockDb(baseInstruction({ quantityRef, fillTimeoutRef: timeoutRef }));
    await expect(resolveInstructionFromRefs(db, clock, INSTRUCTION_ID)).rejects.toMatchObject({
      code: 'stale_input',
    });
    vi.restoreAllMocks();
  });
});

describe('finalizeErrorToFailureCode', () => {
  it('maps finalize codes to dispatch failure codes', () => {
    expect(finalizeErrorToFailureCode('stale_input')).toBe('stale_input');
    expect(finalizeErrorToFailureCode('sanity_block')).toBe('numeric_sanity_block');
    expect(finalizeErrorToFailureCode('ref_missing')).toBe('broker_policy_block');
    expect(finalizeErrorToFailureCode('instruction_not_found')).toBe('broker_policy_block');
  });

  it('InstructionFinalizeError carries code and ref', () => {
    const err = new InstructionFinalizeError('ref_missing', 'missing', 'nv_abc');
    expect(err.code).toBe('ref_missing');
    expect(err.ref).toBe('nv_abc');
  });
});
