import { describe, expect, it } from 'vitest';
import type { PhilosophyBandPosition } from '@hftr/contracts';
import {
  bandValueAtPosition,
  clampToBand,
  getBoundedRangeBand,
  loadBoundedRangeBands,
  pickInBand,
} from '../bands';

const CORE_BANDS = [
  'risk_per_trade_pct_band',
  'portfolio_heat_pct_band',
  'atr_stop_multiplier_band',
  'participation_rate_band',
  'max_slippage_bps_band',
  'fill_timeout_ms_band',
  'reentry_band',
] as const;

describe('v1-parity bands', () => {
  it('loads numeric bands from seeded-strategy-catalog', () => {
    const bands = loadBoundedRangeBands();
    expect(bands.size).toBeGreaterThan(15);
    for (const bandId of [
      'risk_per_trade_pct_band',
      'portfolio_heat_pct_band',
      'participation_rate_band',
    ]) {
      expect(bands.has(bandId), `missing flat ${bandId}`).toBe(true);
    }
    for (const bandId of ['max_slippage_bps_band', 'fill_timeout_ms_band', 'reentry_band']) {
      expect(getBoundedRangeBand(bandId), `missing nested ${bandId}`).toBeDefined();
    }
  });

  it.each(CORE_BANDS)('catalog band %s satisfies min <= typical <= max', (bandId) => {
    const b = getBoundedRangeBand(bandId)!;
    expect(b.min).toBeLessThanOrEqual(b.typical);
    expect(b.typical).toBeLessThanOrEqual(b.max);
  });

  it.each(CORE_BANDS)('bandValueAtPosition maps positions for %s', (bandId) => {
    const b = getBoundedRangeBand(bandId)!;
    expect(bandValueAtPosition(b, 'min')).toBe(b.min);
    expect(bandValueAtPosition(b, 'typical')).toBe(b.typical);
    expect(bandValueAtPosition(b, 'max')).toBe(b.max);
  });

  it.each([
    ['below min', -999, 'typical'],
    ['above max', 999_999, 'typical'],
    ['NaN', Number.NaN, 'typical'],
    ['Infinity', Number.POSITIVE_INFINITY, 'typical'],
  ] as const)('clampToBand returns in-envelope for %s input', (_label, value, anchor) => {
    const b = getBoundedRangeBand('risk_per_trade_pct_band')!;
    const clamped = clampToBand(b, value);
    expect(clamped).toBeGreaterThanOrEqual(b.min);
    expect(clamped).toBeLessThanOrEqual(b.max);
    if (!Number.isFinite(value)) {
      expect(clamped).toBe(b[anchor as PhilosophyBandPosition]);
    }
  });

  it('clampToBand preserves in-range values', () => {
    const b = getBoundedRangeBand('risk_per_trade_pct_band')!;
    expect(clampToBand(b, b.typical)).toBe(b.typical);
    expect(clampToBand(b, b.min)).toBe(b.min);
    expect(clampToBand(b, b.max)).toBe(b.max);
  });

  it.each([0, 0.25, 0.5, 0.75, 0.99] as const)('pickInBand(u=%s) stays inside [min,max]', (u) => {
    const b = getBoundedRangeBand('participation_rate_band')!;
    const picked = pickInBand(b, u);
    expect(picked).toBeGreaterThanOrEqual(b.min);
    expect(picked).toBeLessThanOrEqual(b.max);
  });

  it('pickInBand clusters near typical for mid-range u', () => {
    const b = getBoundedRangeBand('atr_stop_multiplier_band')!;
    const nearTypical = pickInBand(b, 0.5);
    const span = b.max - b.min;
    expect(Math.abs(nearTypical - b.typical)).toBeLessThanOrEqual(span * 0.6);
  });

  it('pickInBand is deterministic for identical u', () => {
    const b = getBoundedRangeBand('trail_multiplier_band')!;
    expect(pickInBand(b, 0.42)).toBe(pickInBand(b, 0.42));
  });

  it.each([
    [0, 'min'],
    [0.999, 'max'],
  ] as const)('pickInBand endpoints: u=%s stays inside envelope toward %s', (u, anchor) => {
    const b = getBoundedRangeBand('scale_out_fraction_band')!;
    const picked = pickInBand(b, u);
    expect(picked).toBeGreaterThanOrEqual(b.min);
    expect(picked).toBeLessThanOrEqual(b.max);
    if (anchor === 'min') expect(picked).toBe(b.min);
    if (anchor === 'max') expect(Math.abs(picked - b.max)).toBeLessThan(0.05);
  });

  it('risk_per_trade_pct_band matches v1 seeded anchors', () => {
    const b = getBoundedRangeBand('risk_per_trade_pct_band')!;
    expect(b).toEqual({ min: 0.25, typical: 0.75, max: 2.0, unit: 'pct_equity' });
  });

  it('portfolio_heat_pct_band matches v1 seeded anchors', () => {
    const b = getBoundedRangeBand('portfolio_heat_pct_band')!;
    expect(b.min).toBe(1.5);
    expect(b.typical).toBe(4.0);
    expect(b.max).toBe(8.0);
  });

  it('fill_timeout_ms_band liquid_intraday profile spans execution recovery envelope', () => {
    const b = getBoundedRangeBand('fill_timeout_ms_band')!;
    expect(b?.min).toBe(2000);
    expect(b?.typical).toBe(8000);
    expect(b?.max).toBe(30000);
  });

  it('max_slippage_bps_band liquid_regular profile matches v1 anchors', () => {
    const b = getBoundedRangeBand('max_slippage_bps_band')!;
    expect(b).toEqual({ min: 5, typical: 12, max: 25 });
  });

  it('reentry_band max_reentry_count profile matches v1 anchors', () => {
    const b = getBoundedRangeBand('reentry_band')!;
    expect(b).toEqual({ min: 0, typical: 1, max: 3 });
  });

  it('getBoundedRangeBand returns undefined for non-numeric catalog keys', () => {
    expect(getBoundedRangeBand('rr_target_ladder')).toBeUndefined();
    expect(getBoundedRangeBand('not_in_catalog')).toBeUndefined();
  });
});
