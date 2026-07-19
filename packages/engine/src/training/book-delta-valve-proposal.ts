import type { PhilosophyBandPosition, TrainingFeedbackDelta } from '@hftr/contracts';
import { proposeValvePositionDelta } from '../pipeline/weighted-valves';

/** Default band driven by fill-realism observations (execution aggression). */
export const BOOK_DELTA_VALVE_BAND_ID = 'participation_rate_band';

export type BookDeltaValveObservation = {
  fillPriceDeltaBps?: number | null;
  /** True when shadow verify recorded reject_code / timeout / pending. */
  providerReject?: boolean;
};

export type ProposeBookDeltaValveResult =
  | {
      ok: true;
      delta: Extract<TrainingFeedbackDelta, { mutationClass: 'band_position' }>;
      medianAbsBps: number | null;
      sampleCount: number;
      outcomeScore: number;
    }
  | {
      ok: false;
      reason: 'insufficient_samples' | 'no_step' | 'unknown_band';
      sampleCount: number;
      medianAbsBps: number | null;
    };

function medianAbs(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].map(Math.abs).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

/**
 * Map observed fill-price deltas / provider rejects → outcome score for valves.
 * Positive score → more aggressive participation; negative → less.
 * Model-free; thresholds are fixed (D-205).
 */
export function outcomeScoreFromBookDeltaObservations(
  observations: readonly BookDeltaValveObservation[],
): { outcomeScore: number; medianAbsBps: number | null; sampleCount: number } {
  const bps = observations
    .map((o) => o.fillPriceDeltaBps)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const rejects = observations.filter((o) => o.providerReject === true).length;
  const sampleCount = observations.length;
  const medianAbsBps = medianAbs(bps);

  if (bps.length > 0 && medianAbsBps != null) {
    // Large provider vs internal gap → reduce participation.
    if (medianAbsBps >= 50) return { outcomeScore: -1, medianAbsBps, sampleCount };
    if (medianAbsBps >= 15) return { outcomeScore: -0.5, medianAbsBps, sampleCount };
    if (medianAbsBps <= 5) return { outcomeScore: 0.5, medianAbsBps, sampleCount };
    return { outcomeScore: 0, medianAbsBps, sampleCount };
  }

  // Weekend / closed-market shadow often only yields reject_code rows.
  if (rejects > 0) {
    return { outcomeScore: -0.5, medianAbsBps: null, sampleCount };
  }

  return { outcomeScore: 0, medianAbsBps: null, sampleCount };
}

/**
 * Pure: propose a participation_rate_band step from BookDelta observations.
 */
export function proposeBandPositionFromBookDeltas(args: {
  observations: readonly BookDeltaValveObservation[];
  currentPosition: PhilosophyBandPosition;
  minSamples?: number;
  bandId?: string;
}): ProposeBookDeltaValveResult {
  const minSamples = args.minSamples ?? 3;
  const bandId = args.bandId ?? BOOK_DELTA_VALVE_BAND_ID;
  const { outcomeScore, medianAbsBps, sampleCount } = outcomeScoreFromBookDeltaObservations(
    args.observations,
  );

  if (sampleCount < minSamples) {
    return { ok: false, reason: 'insufficient_samples', sampleCount, medianAbsBps };
  }

  const toPosition = proposeValvePositionDelta({
    current: args.currentPosition,
    outcomeScore,
  });

  if (toPosition === args.currentPosition) {
    return { ok: false, reason: 'no_step', sampleCount, medianAbsBps };
  }

  return {
    ok: true,
    medianAbsBps,
    sampleCount,
    outcomeScore,
    delta: {
      mutationClass: 'band_position',
      bandId,
      fromPosition: args.currentPosition,
      toPosition,
    },
  };
}
