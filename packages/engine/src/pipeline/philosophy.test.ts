import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHILOSOPHY_PROFILE,
  philosophyProfileToLeverState,
  philosophySizingBasisBps,
} from '@hftr/contracts';
import { computeQuantity } from './compile';
import { enforceAllLayers, enforceScopeStrict } from './levers';
import { resolvePhilosophyControl } from './philosophy-control';

describe('philosophy → lever mapping', () => {
  it('maps default profile to known band positions', () => {
    const state = philosophyProfileToLeverState(DEFAULT_PHILOSOPHY_PROFILE);
    expect(state.risk_per_trade_pct_band).toEqual({
      mode: 'band',
      bandId: 'risk_per_trade_pct_band',
      position: 'typical',
    });
    expect(enforceAllLayers(state).risk_per_trade_pct_band?.mode).toBe('band');
  });

  it('sizes compile quantity from risk_appetite axis', () => {
    const conservative = resolvePhilosophyControl({
      philosophyProfile: {
        ...DEFAULT_PHILOSOPHY_PROFILE,
        axes: { ...DEFAULT_PHILOSOPHY_PROFILE.axes, risk_appetite: 'min' },
      },
    });
    const aggressive = resolvePhilosophyControl({
      philosophyProfile: {
        ...DEFAULT_PHILOSOPHY_PROFILE,
        axes: { ...DEFAULT_PHILOSOPHY_PROFILE.axes, risk_appetite: 'max' },
      },
    });
    expect(conservative.sizingBasisBps).toBe(25);
    expect(aggressive.sizingBasisBps).toBe(200);
    expect(philosophySizingBasisBps(aggressive.philosophyProfile)).toBe(200);

    const balance = 1_000_000n; // $10,000
    const price = 10_000; // $100
    const qtyMin = computeQuantity(balance, price, conservative.sizingBasisBps);
    const qtyMax = computeQuantity(balance, price, aggressive.sizingBasisBps);
    expect(qtyMax).toBeGreaterThan(qtyMin);
  });

  it('uses trading module strategy family and policy envelope when provided', () => {
    const snap = resolvePhilosophyControl({
      philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE,
      strategyFamily: 'opening_range_breakout',
      policyEnvelopeRef: 'paper_balanced_general_v1',
    });
    expect(snap.strategyFamily).toBe('opening_range_breakout');
    expect(snap.policyEnvelopeVersion).toBe('paper_balanced_general_v1');
  });

  it('fail-closes on unknown or out-of-scope levers', () => {
    expect(() =>
      enforceScopeStrict('strategic', {
        unknown_band: { mode: 'band', bandId: 'unknown_band', position: 'typical' },
      }),
    ).toThrow(/unknown_lever/);

    expect(() =>
      enforceScopeStrict('strategic', {
        fill_timeout_ms_band: {
          mode: 'band',
          bandId: 'fill_timeout_ms_band',
          position: 'typical',
        },
      }),
    ).toThrow(/out_of_scope/);
  });

  it('identical profiles produce identical control snapshots', () => {
    const a = resolvePhilosophyControl({ philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE });
    const b = resolvePhilosophyControl({ philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE });
    expect(a).toEqual(b);
  });
});
