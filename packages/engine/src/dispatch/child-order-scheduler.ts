/**
 * POV / child-slice planner (Almgren–Chriss style participation).
 * Deterministic, model-free. Does not place orders — returns qty schedule
 * for dispatch to drain as child instructions.
 */

export interface ChildSlicePlanInput {
  parentQty: number;
  /** POV % of interval volume (catalog participation_rate_band). */
  participationPct: number;
  /** Urgency scalar 0.2–3 (is_urgency_scalar_band). */
  urgencyScalar: number;
  /**
   * Max fraction of parent per child slice (child_slice_band as 0.1–1.0).
   * Catalog may store pct 10/60/100 — pass already normalized to 0–1.
   */
  childSliceFraction: number;
  /** Optional ADV/interval volume in shares; when omitted, time-slices parent. */
  intervalVolumeShares?: number;
}

export interface ChildSlicePlan {
  slices: number[];
  sliceCount: number;
  participationPct: number;
  urgencyScalar: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Plan child quantities that sum to parentQty.
 * Higher urgency → fewer, larger front-loaded slices.
 * Participation caps slice size vs interval volume when provided.
 */
export function planChildSlices(input: ChildSlicePlanInput): ChildSlicePlan {
  const parentQty = Math.max(0, Math.floor(input.parentQty));
  if (parentQty <= 0) {
    return {
      slices: [],
      sliceCount: 0,
      participationPct: input.participationPct,
      urgencyScalar: input.urgencyScalar,
    };
  }

  const participationPct = clamp(input.participationPct, 1, 100);
  const urgency = clamp(input.urgencyScalar, 0.2, 3);
  const maxFrac = clamp(input.childSliceFraction, 0.05, 1);

  // Urgency 0.2 → ~8 slices; urgency 3 → ~2 slices.
  const sliceCount = clamp(Math.round(9 - urgency * 2.2), 2, 8);
  const maxPerSliceByFrac = Math.max(1, Math.floor(parentQty * maxFrac));
  const maxPerSliceByPov =
    input.intervalVolumeShares != null && input.intervalVolumeShares > 0
      ? Math.max(1, Math.floor((input.intervalVolumeShares * participationPct) / 100))
      : maxPerSliceByFrac;
  const maxPerSlice = Math.min(maxPerSliceByFrac, maxPerSliceByPov, parentQty);

  // Front-load weights: urgency raises first-slice share.
  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < sliceCount; i++) {
    const decay = Math.pow(0.75, i);
    const frontBoost = i === 0 ? 0.5 + urgency / 3 : 1;
    const w = decay * frontBoost;
    weights.push(w);
    weightSum += w;
  }

  const slices: number[] = [];
  let remaining = parentQty;
  for (let i = 0; i < sliceCount; i++) {
    if (remaining <= 0) break;
    const isLastPlanned = i === sliceCount - 1;
    let qty = isLastPlanned
      ? Math.min(remaining, maxPerSlice)
      : Math.max(1, Math.floor((parentQty * weights[i]!) / weightSum));
    qty = Math.min(qty, maxPerSlice, remaining);
    if (qty <= 0) continue;
    slices.push(qty);
    remaining -= qty;
  }
  while (remaining > 0) {
    const qty = Math.min(maxPerSlice, remaining);
    slices.push(qty);
    remaining -= qty;
  }

  return {
    slices,
    sliceCount: slices.length,
    participationPct,
    urgencyScalar: urgency,
  };
}

/**
 * Delay between POV child-slice drain jobs. Higher urgency → shorter interval.
 * Maps ~30_000ms at urgency 0.2 → ~5_000ms at urgency 3.
 */
export function sliceDrainIntervalMs(urgencyScalar: number): number {
  const urgency = clamp(urgencyScalar, 0.2, 3);
  const t = (urgency - 0.2) / (3 - 0.2);
  return Math.round(30_000 - t * 25_000);
}

/** Normalize catalog child_slice pct (10/60/100) or fraction to 0–1. */
export function normalizeChildSliceFraction(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0.6;
  if (raw > 1) return clamp(raw / 100, 0.05, 1);
  return clamp(raw, 0.05, 1);
}
