import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import * as fx from './fixed';
import { leakLint } from './leak-lint';
import { checkEnvelope } from './sanity';
import { mulUnit, divUnit, requireSameUnit, UnitError } from './units';

describe('fixed-point', () => {
  it('adds across scales without float error', () => {
    // 0.1 + 0.2 == 0.3 exactly at scale 2
    const a = { valueInt: 10n, scale: 2 };
    const b = { valueInt: 20n, scale: 2 };
    expect(fx.toDisplayString(fx.add(a, b))).toBe('0.30');
  });

  it('multiplies price × qty correctly', () => {
    // $123.45 (scale 2) × 3 shares (scale 0) = $370.35
    const price = { valueInt: 12345n, scale: 2 };
    const qty = { valueInt: 3n, scale: 0 };
    expect(fx.toDisplayString(fx.mul(price, qty))).toBe('370.35');
  });

  it('divides at explicit scale, truncating', () => {
    const a = { valueInt: 10n, scale: 0 };
    const b = { valueInt: 3n, scale: 0 };
    expect(fx.toDisplayString(fx.div(a, b, 4))).toBe('3.3333');
  });

  it('clamps into bounds', () => {
    const v = { valueInt: 500n, scale: 0 };
    const lo = { valueInt: 0n, scale: 0 };
    const hi = { valueInt: 100n, scale: 0 };
    expect(fx.clamp(v, lo, hi).valueInt).toBe(100n);
  });

  it('rejects division by zero', () => {
    expect(() => fx.div({ valueInt: 1n, scale: 0 }, { valueInt: 0n, scale: 0 }, 2)).toThrow();
  });
});

describe('unit algebra', () => {
  it('requires same units for add', () => {
    expect(() => requireSameUnit('add', ['USD_cents', 'shares'])).toThrow(UnitError);
  });
  it('cancels units on division', () => {
    expect(divUnit('USD_cents', 'USD_cents')).toBe('ratio');
  });
  it('preserves unit when multiplying by dimensionless', () => {
    expect(mulUnit('USD_cents', 'ratio')).toBe('USD_cents');
  });
});

describe('sanity envelope', () => {
  it('blocks values outside bounds', () => {
    const result = checkEnvelope(
      -5n,
      { minInt: '0', maxInt: '100', maxAgeMs: null, mustBePositive: true },
      'nv_test',
    );
    expect(result.ok).toBe(false);
  });
});

describe('leak lint', () => {
  it('passes ref-only output', () => {
    const out = { rationale: 'momentum breakout with typical volatility', quantityRef: 'nv_abc' };
    expect(leakLint(out, []).ok).toBe(true);
  });

  it('catches raw numbers and datetimes', () => {
    const out = { rationale: 'buy 100 shares before 15:30 on 2026-07-16' };
    const result = leakLint(out, []);
    expect(result.ok).toBe(false);
    expect(result.leaks.length).toBeGreaterThan(0);
  });

  it('respects whitelisted paths', () => {
    const out = { display: { title: 'Q2 2026 earnings' }, thesis: 'strong momentum' };
    expect(leakLint(out, ['$.display']).ok).toBe(true);
  });

  it('rejects raw numeric typed values anywhere', () => {
    expect(leakLint({ qty: 100 }, []).ok).toBe(false);
  });
});

describe('clock', () => {
  it('fixed clock is deterministic', () => {
    const clock = createFixedClock(1_752_700_000_000);
    expect(clock.nowMs()).toBe(1_752_700_000_000);
    expect(clock.nowIso()).toBe(new Date(1_752_700_000_000).toISOString());
  });
});
