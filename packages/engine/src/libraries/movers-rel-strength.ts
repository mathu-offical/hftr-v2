/**
 * Deterministic relative-strength + volume expansion from OHLC closes/volumes.
 * Numbers stay on the calculator path — never emitted to LLM prompts.
 */

export type SymbolBarSnapshot = {
  closes: number[];
  volumes: number[];
};

export type RelStrengthResult = {
  relStrengthAbsBps: number;
  /** Signed vs benchmark (positive = outperform). */
  relStrengthBps: number;
  direction: 'up' | 'down' | 'flat';
  volumeExpansionRatio: number;
};

function pctChangeBps(closes: number[]): number | null {
  if (closes.length < 2) return null;
  const first = closes[0]!;
  const last = closes[closes.length - 1]!;
  if (!(first > 0) || !Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.round(((last - first) / first) * 10_000);
}

function volumeRatio(volumes: number[]): number {
  if (volumes.length < 2) return 1;
  const mid = Math.floor(volumes.length / 2);
  const early = volumes.slice(0, mid);
  const late = volumes.slice(mid);
  const avg = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
  const e = avg(early);
  const l = avg(late);
  if (!(e > 0) || !Number.isFinite(e) || !Number.isFinite(l)) return 1;
  return Math.max(0, l / e);
}

/**
 * Relative strength vs SPY (or other benchmark) in integer bps.
 * Flat when |rel| below flatBps threshold (caller applies banding separately).
 */
export function computeRelStrength(
  symbol: SymbolBarSnapshot,
  benchmark: SymbolBarSnapshot | null,
  flatBps: number,
): RelStrengthResult {
  const symBps = pctChangeBps(symbol.closes);
  const benchBps = benchmark ? pctChangeBps(benchmark.closes) : 0;
  const vol = volumeRatio(symbol.volumes);

  if (symBps == null) {
    return {
      relStrengthAbsBps: 0,
      relStrengthBps: 0,
      direction: 'flat',
      volumeExpansionRatio: vol,
    };
  }

  const rel = symBps - (benchBps ?? 0);
  const abs = Math.abs(rel);
  let direction: 'up' | 'down' | 'flat' = 'flat';
  if (abs >= flatBps) {
    direction = rel >= 0 ? 'up' : 'down';
  }

  return {
    relStrengthAbsBps: abs,
    relStrengthBps: rel,
    direction,
    volumeExpansionRatio: vol,
  };
}
