import { describe, expect, it } from 'vitest';
import type { LeverState } from '@hftr/contracts';
import { philosophyProfileToLeverState, DEFAULT_PHILOSOPHY_PROFILE } from '@hftr/contracts';
import { resolveAtrStopMultiplier, resolveBandPosition, resolveLeverSetting, resolveRiskPerTradePct, resolveSizingBasisBps } from './lever-resolver';

describe('lever-resolver', () => {
  const typicalState = philosophyProfileToLeverState(DEFAULT_PHILOSOPHY_PROFILE);

  it('returns lever settings by band id', () => {
    const setting = resolveLeverSetting(typicalState, 'risk_per_trade_pct_band');
    expect(setting).toEqual({
      mode: 'band',
      bandId: 'risk_per_trade_pct_band',
      position: 'typical',
    });
    expect(resolveLeverSetting(typicalState, 'missing_band')).toBeNull();
  });

  it('resolves band positions with typical fallback', () => {
    expect(resolveBandPosition(typicalState, 'risk_per_trade_pct_band')).toBe('typical');
    expect(resolveBandPosition({}, 'risk_per_trade_pct_band')).toBe('typical');
  });

  it('maps risk_per_trade_pct_band to RISK_APPETITE_SIZING_BPS', () => {
    expect(resolveSizingBasisBps(typicalState)).toBe(75);

    const minState: LeverState = {
      risk_per_trade_pct_band: {
        mode: 'band',
        bandId: 'risk_per_trade_pct_band',
        position: 'min',
      },
    };
    const maxState: LeverState = {
      risk_per_trade_pct_band: {
        mode: 'band',
        bandId: 'risk_per_trade_pct_band',
        position: 'max',
      },
    };
    expect(resolveSizingBasisBps(minState)).toBe(25);
    expect(resolveSizingBasisBps(maxState)).toBe(200);
  });

  it('resolves catalog risk_per_trade_pct and atr_stop_multiplier anchors', () => {
    expect(resolveRiskPerTradePct(typicalState)).toBe(0.75);
    expect(resolveAtrStopMultiplier(typicalState)).toBe(2.25);
    expect(resolveRiskPerTradePct(null)).toBe(0.75);
    expect(resolveAtrStopMultiplier(null)).toBe(2.25);
  });
});
