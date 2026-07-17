import { describe, expect, it } from 'vitest';
import { clampLimit, clampLossRemaining } from './clamp';
import { computeOperatingLimits } from './compute';
import type { LimitContext } from './context';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const NOW_MS = 1_750_000_000_000;

function baseContext(overrides: Partial<LimitContext> = {}): LimitContext {
  return {
    companyId: COMPANY_ID,
    moduleId: null,
    mode: 'paper',
    nowMs: NOW_MS,
    sessionPhase: 'open',
    virtualBalanceCents: 100_000n,
    brokerBuyingPowerCents: 80_000n,
    equityCents: 100_000n,
    realizedLossCents: 0n,
    brokerEnvelopeId: 'bpe-001',
    recentTraceTimestampsMs: [],
    ...overrides,
  };
}

describe('clampLimit', () => {
  it('returns min of calc, hard, and operator caps', () => {
    expect(clampLimit(90_000n, 80_000n, 100_000n)).toBe(80_000n);
    expect(clampLimit(50_000n, 80_000n, 60_000n)).toBe(50_000n);
    expect(clampLimit(-5n, 80_000n, 60_000n)).toBe(0n);
  });

  it('clamps loss remaining at zero floor', () => {
    expect(clampLossRemaining(-100n, 0n, 0n)).toBe(0n);
    expect(clampLossRemaining(500n, 0n, 0n)).toBe(500n);
  });

  it('tightens monotonically when hard envelope shrinks', () => {
    const calc = 100_000n;
    const operator = 95_000n;
    let prev = clampLimit(calc, 90_000n, operator);
    for (const hard of [80_000n, 70_000n, 50_000n, 10_000n] as const) {
      const next = clampLimit(calc, hard, operator);
      expect(next <= prev).toBe(true);
      expect(next <= hard).toBe(true);
      prev = next;
    }
  });

  it('never exceeds immutable hard ceiling (envelope immutability)', () => {
    const hard = 42_000n;
    for (const calc of [0n, 1n, 41_999n, 42_000n, 42_001n, 999_999n] as const) {
      for (const op of [0n, 10_000n, 42_000n, 100_000n] as const) {
        const out = clampLimit(calc, hard, op);
        expect(out <= hard).toBe(true);
        expect(out >= 0n).toBe(true);
      }
    }
  });
});

describe('computeOperatingLimits', () => {
  it('passes when all inputs are present', () => {
    const snapshot = computeOperatingLimits(baseContext());
    expect(snapshot.overallPass).toBe(true);
    expect(snapshot.limits).toHaveLength(4);
    const buyingPower = snapshot.limits.find((l) => l.domain === 'buying_power')!;
    expect(buyingPower.status).toBe('pass');
    expect(buyingPower.valueInt).toBe('80000');
  });

  it('blocks buying_power when inputs are missing', () => {
    const ctx = baseContext();
    delete (ctx as { virtualBalanceCents?: bigint }).virtualBalanceCents;
    delete (ctx as { brokerBuyingPowerCents?: bigint }).brokerBuyingPowerCents;
    const snapshot = computeOperatingLimits(ctx);
    const buyingPower = snapshot.limits.find((l) => l.domain === 'buying_power')!;
    expect(buyingPower.status).toBe('block');
    expect(buyingPower.evidence).toContain('missing');
    expect(snapshot.overallPass).toBe(false);
  });

  it('blocks daily_loss and order_frequency when inputs absent', () => {
    const ctx = baseContext();
    delete (ctx as { equityCents?: bigint }).equityCents;
    delete (ctx as { realizedLossCents?: bigint }).realizedLossCents;
    delete (ctx as { recentTraceTimestampsMs?: number[] }).recentTraceTimestampsMs;
    const snapshot = computeOperatingLimits(ctx);
    expect(snapshot.limits.find((l) => l.domain === 'daily_loss_remaining')!.status).toBe('block');
    expect(snapshot.limits.find((l) => l.domain === 'order_frequency')!.status).toBe('block');
  });

  it('blocks session legality in live mode when market closed', () => {
    const snapshot = computeOperatingLimits(
      baseContext({ mode: 'live', sessionPhase: 'overnight' }),
    );
    expect(snapshot.limits.find((l) => l.domain === 'session_legality')!.status).toBe('block');
  });
});
