export interface DrainLatencyMetrics {
  /** Wall-clock ms from last drain invocation start. */
  drainedAtMs: number;
  claimToCompleteMs: {
    max: number;
    p95: number;
    sampleCount: number;
  };
}

let lastDrainMetrics: DrainLatencyMetrics | null = null;

export function recordDrainMetrics(metrics: DrainLatencyMetrics): void {
  lastDrainMetrics = metrics;
}

export function getLastDrainMetrics(): DrainLatencyMetrics | null {
  return lastDrainMetrics;
}

/** Approximate p95 from a small batch (no allocation on hot path beyond sort). */
export function percentileMs(samples: number[], pct: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(pct * sorted.length) - 1);
  return sorted[idx] ?? 0;
}
