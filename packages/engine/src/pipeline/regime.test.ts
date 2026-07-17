import { describe, expect, it } from 'vitest';
import type { OhlcBar } from '@hftr/adapters';
import { buildRegimeFromBars, buildRegimeSynthetic, regimeTrendBand } from './regime';

const AS_OF_REF = { ref: 'nv_test_regime_asof_ref_001' };

function trendingBars(count: number, start = 100, step = 0.5): OhlcBar[] {
  const bars: OhlcBar[] = [];
  for (let i = 0; i < count; i++) {
    const close = start + i * step;
    bars.push({
      timestamp: new Date(1_750_000_000_000 + i * 60_000).toISOString(),
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 1000 + i * 10,
    });
  }
  return bars;
}

describe('buildRegimeFromBars', () => {
  it('labels computedFrom live_bars and returns bounded regime vector', () => {
    const snapshot = buildRegimeFromBars({
      bars: trendingBars(40),
      asOfRef: AS_OF_REF,
    });

    expect(snapshot.computedFrom).toBe('live_bars');
    expect(snapshot.asOfRef).toEqual(AS_OF_REF);
    expect(snapshot.trendUp).toBeGreaterThan(0.45);
    expect(snapshot.trendDown).toBeLessThan(0.55);
    expect(snapshot.meanReversion).toBeGreaterThanOrEqual(0);
    expect(snapshot.meanReversion).toBeLessThanOrEqual(1);
    expect(snapshot.volExpansion).toBeGreaterThanOrEqual(0);
    expect(snapshot.volExpansion).toBeLessThanOrEqual(1);
    expect(snapshot.liquidityStress).toBeGreaterThanOrEqual(0);
    expect(snapshot.eventShock).toBeGreaterThanOrEqual(0);
    expect(snapshot.riskOff).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for the same bar series', () => {
    const bars = trendingBars(30, 50, 0.25);
    const a = buildRegimeFromBars({ bars, asOfRef: AS_OF_REF });
    const b = buildRegimeFromBars({ bars, asOfRef: AS_OF_REF });
    expect(a).toEqual(b);
  });
});

describe('buildRegimeSynthetic', () => {
  it('labels computedFrom seed_synthetic with deterministic output', () => {
    const a = buildRegimeSynthetic({ seed: 'company:module:SPY', asOfRef: AS_OF_REF });
    const b = buildRegimeSynthetic({ seed: 'company:module:SPY', asOfRef: AS_OF_REF });

    expect(a.computedFrom).toBe('seed_synthetic');
    expect(a).toEqual(b);
    expect(a.trendUp).toBeGreaterThanOrEqual(0);
    expect(a.trendUp).toBeLessThanOrEqual(1);
  });
});

describe('regimeTrendBand', () => {
  it('maps numeric trendUp to qualitative bands for model-facing output', () => {
    expect(regimeTrendBand(0.2)).toBe('weak');
    expect(regimeTrendBand(0.5)).toBe('moderate');
    expect(regimeTrendBand(0.8)).toBe('strong');
  });
});
