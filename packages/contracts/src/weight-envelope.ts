import { z } from 'zod';

/**
 * Weight envelope — continuous ranking/sizing weight inside a runtime band.
 * Learning may move currentWeight inside [min,max]; never outside (D-126).
 * Ported from v1 seeds WeightEnvelope; v2 Zod contract.
 */

export const WeightEnvelope = z.object({
  profileId: z.string().min(1),
  scope: z.string().min(1),
  entityRefs: z.array(z.string()).default([]),
  driverRefs: z.array(z.string()).default([]),
  baselineWeight: z.number().finite(),
  runtimeWeightBand: z.tuple([z.number().finite(), z.number().finite()]),
  currentWeight: z.number().finite(),
  freshnessState: z.enum(['fresh', 'stale', 'unknown']).default('unknown'),
  provenanceRefs: z.array(z.string()).default([]),
});
export type WeightEnvelope = z.infer<typeof WeightEnvelope>;

/** Clamp currentWeight into runtimeWeightBand; fail-closed if band inverted. */
export function clampWeightEnvelope(env: WeightEnvelope): WeightEnvelope {
  const [lo, hi] = env.runtimeWeightBand;
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  const currentWeight = Math.min(max, Math.max(min, env.currentWeight));
  return { ...env, runtimeWeightBand: [min, max], currentWeight };
}

export const TrainingFeedbackDelta = z.discriminatedUnion('mutationClass', [
  z.object({
    mutationClass: z.literal('band_position'),
    bandId: z.string().min(1),
    fromPosition: z.enum(['min', 'typical', 'max']),
    toPosition: z.enum(['min', 'typical', 'max']),
  }),
  z.object({
    mutationClass: z.literal('weight_delta'),
    profileId: z.string().min(1),
    fromWeight: z.number().finite(),
    toWeight: z.number().finite(),
  }),
  /**
   * Observation link from both_verify BookDelta (D-122 Phase 4).
   * Not applied directly by applyControlSnapshotDelta — D-205 valve jobs
   * aggregate these into band_position mutations.
   */
  z.object({
    mutationClass: z.literal('book_delta'),
    bookDeltaId: z.string().uuid(),
    fillPriceDeltaBps: z.number().finite().optional(),
  }),
]);
export type TrainingFeedbackDelta = z.infer<typeof TrainingFeedbackDelta>;
