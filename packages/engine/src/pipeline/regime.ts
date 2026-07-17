import { createHash } from 'node:crypto';
import type { OhlcBar } from '@hftr/adapters';
import type { RegimeSnapshot, ValueRefHandle } from '@hftr/contracts';

/** Router thresholds from seeded trend-lead-pattern-library (v1 carryover). */
const HURST_TREND = 0.55;
const HURST_REVERT = 0.45;
const ADX_TREND = 25;
const ADX_RANGE = 20;

export interface RegimeBarInput {
  bars: readonly OhlcBar[];
  asOfRef: ValueRefHandle;
}

export type RegimeStrengthBand = 'weak' | 'moderate' | 'strong';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function hashUnit(seed: string): number {
  const h = createHash('sha256').update(seed).digest().readUInt32BE(0);
  return h / 0xffff_ffff;
}

function closes(bars: readonly OhlcBar[]): number[] {
  return bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0);
}

function returnsFromCloses(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    if (prev === 0) continue;
    out.push((closes[i]! - prev) / prev);
  }
  return out;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Simplified Hurst proxy via lag-1 autocorrelation of returns. */
function hurstProxy(returns: number[]): number {
  if (returns.length < 4) return 0.5;
  const lagged: number[] = [];
  const base: number[] = [];
  for (let i = 1; i < returns.length; i++) {
    base.push(returns[i - 1]!);
    lagged.push(returns[i]!);
  }
  const mb = mean(base);
  const ml = mean(lagged);
  let num = 0;
  let denB = 0;
  let denL = 0;
  for (let i = 0; i < base.length; i++) {
    const db = base[i]! - mb;
    const dl = lagged[i]! - ml;
    num += db * dl;
    denB += db * db;
    denL += dl * dl;
  }
  const denom = Math.sqrt(denB * denL);
  const ac = denom === 0 ? 0 : num / denom;
  return clamp01(0.5 + ac * 0.25);
}

/** Simplified ADX from true range over OHLC bars. */
function simplifiedAdx(bars: readonly OhlcBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trs.push(tr);
  }
  const window = trs.slice(-period);
  const avgTr = mean(window);
  const price = bars[bars.length - 1]!.close;
  if (price <= 0 || avgTr === 0) return 0;
  return clamp01((avgTr / price) * 1000) * 100;
}

function volRatio(returns: number[]): number {
  if (returns.length < 8) return 0.5;
  const quarter = Math.max(2, Math.floor(returns.length / 4));
  const recent = returns.slice(-quarter);
  const full = returns;
  const recentVol = stdDev(recent);
  const fullVol = stdDev(full);
  if (fullVol === 0) return 0.5;
  return clamp01(recentVol / fullVol);
}

function maxAbsReturn(returns: number[]): number {
  if (returns.length === 0) return 0;
  return Math.max(...returns.map((r) => Math.abs(r)));
}

function volumeStress(bars: readonly OhlcBar[]): number {
  if (bars.length < 4) return 0.3;
  const vols = bars.map((b) => b.volume).filter((v) => Number.isFinite(v) && v >= 0);
  if (vols.length < 4) return 0.3;
  const quarter = Math.max(2, Math.floor(vols.length / 4));
  const recent = mean(vols.slice(-quarter));
  const baseline = mean(vols);
  if (baseline === 0) return 0.5;
  return clamp01(1 - recent / baseline);
}

/**
 * Deterministic regime vector from live OHLC bars. Numeric scores stay in the
 * engine; model tiers only see qualitative bands via {@link regimeTrendBand}.
 */
export function buildRegimeFromBars(input: RegimeBarInput): RegimeSnapshot {
  const priceCloses = closes(input.bars);
  const returns = returnsFromCloses(priceCloses);
  const netReturn = priceCloses.length >= 2 ? returns.reduce((a, b) => a + b, 0) : 0;
  const hurst = hurstProxy(returns);
  const adx = simplifiedAdx(input.bars);

  const momentumSignal =
    hurst > HURST_TREND && adx > ADX_TREND
      ? clamp01(0.55 + netReturn * 8)
      : clamp01(0.5 + netReturn * 5);
  const revertSignal =
    hurst < HURST_REVERT && adx <= ADX_RANGE
      ? clamp01(0.55 - netReturn * 5)
      : clamp01(0.35 - netReturn * 3);

  const volExp = volRatio(returns);
  const shock = clamp01(maxAbsReturn(returns) * 25);
  const liqStress = volumeStress(input.bars);
  const riskOff = clamp01(
    volExp * 0.5 + (netReturn < 0 ? Math.abs(netReturn) * 10 : 0) + shock * 0.3,
  );

  return {
    trendUp: momentumSignal,
    trendDown: clamp01(1 - momentumSignal),
    meanReversion: revertSignal,
    volExpansion: volExp,
    liquidityStress: liqStress,
    eventShock: shock,
    riskOff,
    computedFrom: 'live_bars',
    asOfRef: input.asOfRef,
  };
}

/** Deterministic seed_synthetic regime for paper loop when live bars are unavailable. */
export function buildRegimeSynthetic(input: {
  seed: string;
  asOfRef: ValueRefHandle;
}): RegimeSnapshot {
  const trendUp = clamp01(0.35 + hashUnit(`regime-trend:${input.seed}`) * 0.35);
  const meanRev = clamp01(0.25 + hashUnit(`regime-mr:${input.seed}`) * 0.4);
  const volExp = clamp01(0.2 + hashUnit(`regime-vol:${input.seed}`) * 0.5);
  const shock = clamp01(hashUnit(`regime-shock:${input.seed}`) * 0.25);
  const liq = clamp01(hashUnit(`regime-liq:${input.seed}`) * 0.4);
  const riskOff = clamp01(volExp * 0.4 + shock * 0.35 + liq * 0.25);

  return {
    trendUp,
    trendDown: clamp01(1 - trendUp),
    meanReversion: meanRev,
    volExpansion: volExp,
    liquidityStress: liq,
    eventShock: shock,
    riskOff,
    computedFrom: 'seed_synthetic',
    asOfRef: input.asOfRef,
  };
}

/** Qualitative band for model-facing regime trend strength (no raw numbers). */
export function regimeTrendBand(trendUp: number): RegimeStrengthBand {
  if (trendUp >= 0.65) return 'strong';
  if (trendUp >= 0.45) return 'moderate';
  return 'weak';
}
