import { describe, expect, it } from 'vitest';
import type { LeverLayer, LeverSetting, LeverState } from '@hftr/contracts';
import { knownBandIds, enforceScope, enforceScopeStrict, enforceAllLayers } from '../levers';

function bandSetting(
  bandId: string,
  position: 'min' | 'typical' | 'max' = 'typical',
): LeverSetting {
  return { mode: 'band', bandId, position };
}

const STRATEGIC_BANDS = [
  'risk_per_trade_pct_band',
  'portfolio_heat_pct_band',
  'portfolio_vol_target_band',
  'sector_concentration_pct_band',
  'max_concurrent_names_band',
  'regime_router_thresholds',
  'vol_shock_regime_band',
  'correlation_health_band',
  'momentum_lookback_band',
  'max_slippage_bps_band',
] as const;

const TACTICAL_BANDS = ['time_stop_band', 'reentry_band', 'recovery_backoff_ms_band'] as const;

const EXECUTION_BANDS = [
  'participation_rate_band',
  'is_urgency_scalar_band',
  'fill_timeout_ms_band',
] as const;

describe('v1-parity enforceScopeStrict', () => {
  it('exposes every philosophy-catalog band as known', () => {
    const known = new Set(knownBandIds());
    for (const bandId of [...STRATEGIC_BANDS, ...TACTICAL_BANDS, ...EXECUTION_BANDS]) {
      expect(known.has(bandId), `missing ${bandId}`).toBe(true);
    }
  });

  it.each(STRATEGIC_BANDS.map((bandId) => [bandId] as const))(
    'accepts strategic band %s at strategic layer',
    (bandId) => {
      const result = enforceScope('strategic', { [bandId]: bandSetting(bandId) });
      expect(result.ok).toBe(true);
      expect(result.rejected).toHaveLength(0);
      expect(result.accepted[bandId]).toEqual(bandSetting(bandId));
    },
  );

  it.each(TACTICAL_BANDS.map((bandId) => [bandId] as const))(
    'accepts tactical band %s at tactical layer',
    (bandId) => {
      const result = enforceScope('tactical', { [bandId]: bandSetting(bandId) });
      expect(result.ok).toBe(true);
      expect(result.rejected).toHaveLength(0);
    },
  );

  it.each(EXECUTION_BANDS.map((bandId) => [bandId] as const))(
    'accepts execution band %s at execution layer',
    (bandId) => {
      const result = enforceScope('execution', { [bandId]: bandSetting(bandId) });
      expect(result.ok).toBe(true);
      expect(result.rejected).toHaveLength(0);
    },
  );

  it.each(
    STRATEGIC_BANDS.flatMap((bandId) =>
      (['tactical', 'execution'] as const).map((layer) => [bandId, layer] as const),
    ),
  )('rejects strategic band %s at %s layer (out_of_scope)', (bandId, layer) => {
    const result = enforceScope(layer, { [bandId]: bandSetting(bandId) });
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual([{ bandId, reason: 'out_of_scope' }]);
  });

  it.each(
    TACTICAL_BANDS.flatMap((bandId) =>
      (['strategic', 'execution'] as const).map((layer) => [bandId, layer] as const),
    ),
  )('rejects tactical band %s at %s layer (out_of_scope)', (bandId, layer) => {
    const result = enforceScope(layer, { [bandId]: bandSetting(bandId) });
    expect(result.ok).toBe(false);
    expect(result.rejected[0]).toEqual({ bandId, reason: 'out_of_scope' });
  });

  it.each(
    EXECUTION_BANDS.flatMap((bandId) =>
      (['strategic', 'tactical'] as const).map((layer) => [bandId, layer] as const),
    ),
  )('rejects execution band %s at %s layer (out_of_scope)', (bandId, layer) => {
    const result = enforceScope(layer, { [bandId]: bandSetting(bandId) });
    expect(result.ok).toBe(false);
    expect(result.rejected[0]?.reason).toBe('out_of_scope');
  });

  it.each(['unknown_lever_xyz', 'not_a_real_band', ''] as const)(
    'rejects unknown band %j (unknown_lever)',
    (bandId) => {
      const result = enforceScope('strategic', {
        [bandId]: bandSetting('risk_per_trade_pct_band'),
      });
      expect(result.ok).toBe(false);
      expect(result.rejected[0]).toEqual({ bandId, reason: 'unknown_lever' });
    },
  );

  it('rejects bandId mismatch as invalid_value', () => {
    const result = enforceScope('strategic', {
      risk_per_trade_pct_band: {
        mode: 'band',
        bandId: 'portfolio_heat_pct_band',
        position: 'typical',
      },
    });
    expect(result.ok).toBe(false);
    expect(result.rejected[0]).toEqual({
      bandId: 'risk_per_trade_pct_band',
      reason: 'invalid_value',
    });
  });

  it.each(['min', 'typical', 'max'] as const)(
    'accepts all valid band positions (%s)',
    (position) => {
      const result = enforceScope('strategic', {
        risk_per_trade_pct_band: bandSetting('risk_per_trade_pct_band', position),
      });
      expect(result.ok).toBe(true);
    },
  );

  it('rejects invalid band position', () => {
    const result = enforceScope('strategic', {
      risk_per_trade_pct_band: {
        mode: 'band',
        bandId: 'risk_per_trade_pct_band',
        position: 'high' as 'typical',
      },
    });
    expect(result.ok).toBe(false);
    expect(result.rejected[0]?.reason).toBe('invalid_value');
  });

  it('accepts calc-mode lever with non-empty calcOpName', () => {
    const result = enforceScope('strategic', {
      risk_per_trade_pct_band: {
        mode: 'calc',
        bandId: 'risk_per_trade_pct_band',
        calcOpName: 'risk_budget_from_equity',
        args: {},
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects calc-mode lever with empty calcOpName', () => {
    const result = enforceScope('strategic', {
      risk_per_trade_pct_band: {
        mode: 'calc',
        bandId: 'risk_per_trade_pct_band',
        calcOpName: '',
        args: {},
      },
    });
    expect(result.ok).toBe(false);
    expect(result.rejected[0]?.reason).toBe('invalid_value');
  });

  it('rejects mixed batch: accepts valid, rejects invalid without silent clamp', () => {
    const result = enforceScope('strategic', {
      risk_per_trade_pct_band: bandSetting('risk_per_trade_pct_band'),
      bogus_band: bandSetting('risk_per_trade_pct_band'),
    });
    expect(result.ok).toBe(false);
    expect(result.accepted.risk_per_trade_pct_band).toBeDefined();
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.bandId).toBe('bogus_band');
  });

  it('momentum_lookback_band is strategic-owned (horizon axis wins over tactical)', () => {
    expect(
      enforceScope('strategic', { momentum_lookback_band: bandSetting('momentum_lookback_band') })
        .ok,
    ).toBe(true);
    expect(
      enforceScope('tactical', { momentum_lookback_band: bandSetting('momentum_lookback_band') })
        .ok,
    ).toBe(false);
  });

  it.each([
    ['strategic', 'unknown_lever'],
    ['tactical', 'out_of_scope'],
    ['execution', 'out_of_scope'],
  ] as const)('enforceScopeStrict throws on %s violation (%s)', (layer, reasonFragment) => {
    const state: LeverState =
      reasonFragment === 'unknown_lever'
        ? { fake: bandSetting('risk_per_trade_pct_band') }
        : layer === 'execution'
          ? { risk_per_trade_pct_band: bandSetting('risk_per_trade_pct_band') }
          : {
              fill_timeout_ms_band: bandSetting('fill_timeout_ms_band'),
            };
    expect(() => enforceScopeStrict(layer as LeverLayer, state)).toThrow(
      new RegExp(reasonFragment),
    );
  });

  it('enforceAllLayers merges per-layer slices', () => {
    const state: LeverState = {
      risk_per_trade_pct_band: bandSetting('risk_per_trade_pct_band'),
      time_stop_band: bandSetting('time_stop_band'),
      fill_timeout_ms_band: bandSetting('fill_timeout_ms_band'),
    };
    const merged = enforceAllLayers(state);
    expect(Object.keys(merged).sort()).toEqual(
      ['fill_timeout_ms_band', 'risk_per_trade_pct_band', 'time_stop_band'].sort(),
    );
  });

  it('enforceAllLayers throws on unknown lever in full state', () => {
    expect(() =>
      enforceAllLayers({
        totally_unknown: bandSetting('risk_per_trade_pct_band'),
      }),
    ).toThrow(/unknown_lever/);
  });
});
