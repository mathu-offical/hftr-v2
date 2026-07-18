import type {
  LeverState,
  PhilosophyBandPosition,
  TrainingFeedbackDelta,
  WeightEnvelope,
} from '@hftr/contracts';
import { clampWeightEnvelope } from '@hftr/contracts';
import { knownBandIds } from '../pipeline/levers';
import { proposeValvePositionDelta } from '../pipeline/weighted-valves';

/**
 * apply_control_snapshot_delta — training-tier, model-free.
 * Only in-band band positions / weight envelopes; fail-closed on unknown bands.
 */

export type ApplyDeltaResult =
  | {
      ok: true;
      leverState: LeverState;
      weightEnvelopes: WeightEnvelope[];
      applied: TrainingFeedbackDelta;
    }
  | { ok: false; reason: 'unknown_band' | 'out_of_band_weight' | 'unsupported_mutation' };

export function applyControlSnapshotDelta(args: {
  leverState: LeverState;
  weightEnvelopes?: WeightEnvelope[];
  delta: TrainingFeedbackDelta;
  /** Optional outcome score for band_position auto-step (-1..1). */
  outcomeScore?: number;
}): ApplyDeltaResult {
  const envelopes = [...(args.weightEnvelopes ?? [])];

  switch (args.delta.mutationClass) {
    case 'band_position': {
      if (!knownBandIds().includes(args.delta.bandId)) {
        return { ok: false, reason: 'unknown_band' };
      }
      const toPosition: PhilosophyBandPosition =
        args.outcomeScore != null
          ? proposeValvePositionDelta({
              current: args.delta.fromPosition,
              outcomeScore: args.outcomeScore,
            })
          : args.delta.toPosition;
      const next: LeverState = {
        ...args.leverState,
        [args.delta.bandId]: {
          mode: 'band',
          bandId: args.delta.bandId,
          position: toPosition,
        },
      };
      return {
        ok: true,
        leverState: next,
        weightEnvelopes: envelopes,
        applied: { ...args.delta, toPosition },
      };
    }
    case 'weight_delta': {
      const delta: Extract<TrainingFeedbackDelta, { mutationClass: 'weight_delta' }> =
        args.delta;
      const idx = envelopes.findIndex((e) => e.profileId === delta.profileId);
      if (idx < 0) {
        return { ok: false, reason: 'unsupported_mutation' };
      }
      const current = envelopes[idx]!;
      const [lo, hi] = current.runtimeWeightBand;
      const min = Math.min(lo, hi);
      const max = Math.max(lo, hi);
      if (delta.toWeight < min || delta.toWeight > max) {
        return { ok: false, reason: 'out_of_band_weight' };
      }
      const nextEnv = clampWeightEnvelope({
        ...current,
        currentWeight: delta.toWeight,
      });
      const nextEnvelopes = [...envelopes];
      nextEnvelopes[idx] = nextEnv;
      return {
        ok: true,
        leverState: args.leverState,
        weightEnvelopes: nextEnvelopes,
        applied: delta,
      };
    }
    default: {
      const _exhaustive: never = args.delta;
      return _exhaustive;
    }
  }
}
