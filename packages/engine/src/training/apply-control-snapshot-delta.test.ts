import { describe, expect, it } from 'vitest';
import type { LeverState, WeightEnvelope } from '@hftr/contracts';
import { applyControlSnapshotDelta } from './apply-control-snapshot-delta';

describe('applyControlSnapshotDelta', () => {
  const leverState: LeverState = {
    risk_per_trade_pct_band: {
      mode: 'band',
      bandId: 'risk_per_trade_pct_band',
      position: 'typical',
    },
  };

  it('applies in-band band_position deltas', () => {
    const result = applyControlSnapshotDelta({
      leverState,
      delta: {
        mutationClass: 'band_position',
        bandId: 'risk_per_trade_pct_band',
        fromPosition: 'typical',
        toPosition: 'max',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const setting = result.leverState.risk_per_trade_pct_band;
      expect(setting?.mode).toBe('band');
      if (setting && setting.mode === 'band') {
        expect(setting.position).toBe('max');
      }
    }
  });

  it('rejects unknown bands fail-closed', () => {
    const result = applyControlSnapshotDelta({
      leverState,
      delta: {
        mutationClass: 'band_position',
        bandId: 'not_a_real_band',
        fromPosition: 'typical',
        toPosition: 'max',
      },
    });
    expect(result).toEqual({ ok: false, reason: 'unknown_band' });
  });

  it('clamps weight deltas inside runtime band', () => {
    const env: WeightEnvelope = {
      profileId: 'w1',
      scope: 'strategy',
      entityRefs: [],
      driverRefs: [],
      baselineWeight: 0.5,
      runtimeWeightBand: [0.2, 0.8],
      currentWeight: 0.5,
      freshnessState: 'fresh',
      provenanceRefs: [],
    };
    const ok = applyControlSnapshotDelta({
      leverState,
      weightEnvelopes: [env],
      delta: {
        mutationClass: 'weight_delta',
        profileId: 'w1',
        fromWeight: 0.5,
        toWeight: 0.7,
      },
    });
    expect(ok.ok).toBe(true);
    const bad = applyControlSnapshotDelta({
      leverState,
      weightEnvelopes: [env],
      delta: {
        mutationClass: 'weight_delta',
        profileId: 'w1',
        fromWeight: 0.5,
        toWeight: 0.95,
      },
    });
    expect(bad).toEqual({ ok: false, reason: 'out_of_band_weight' });
  });
});
