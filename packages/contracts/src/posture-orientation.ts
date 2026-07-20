import { z } from 'zod';

/**
 * D-234: Company posture orientation — sealed qualitative bias seed for engines.
 * Bands / symbols / refs only — no raw financial digits (D-008).
 */

export const PostureRegimeClass = z.enum([
  'momentum',
  'mean_reversion',
  'risk_off',
  'neutral',
]);
export type PostureRegimeClass = z.infer<typeof PostureRegimeClass>;

export const OrientationFreshness = z.enum(['fresh', 'stale', 'unknown']);
export type OrientationFreshness = z.infer<typeof OrientationFreshness>;

export const FamilyNominationBias = z.object({
  strategyFamilyId: z.string().min(1).max(80),
  bias: z.enum(['boost', 'suppress', 'neutral']),
});
export type FamilyNominationBias = z.infer<typeof FamilyNominationBias>;

export const OrientationLeverDelta = z.object({
  bandId: z.string().min(1).max(120),
  toPosition: z.enum(['min', 'typical', 'max']),
});
export type OrientationLeverDelta = z.infer<typeof OrientationLeverDelta>;

export const CompanyPostureOrientation = z.object({
  schemaVersion: z.literal(1),
  companyId: z.string().uuid(),
  orientationId: z.string().uuid(),
  analyzeRunId: z.string().uuid().nullable().optional(),
  sealRefs: z
    .array(
      z.object({
        sealId: z.string().min(1),
        kind: z.string().min(1),
        subjectKey: z.string().min(1),
        expiresAt: z.string().datetime().optional(),
      }),
    )
    .max(16)
    .default([]),
  regimeClass: PostureRegimeClass.default('neutral'),
  familyNominationBias: z.array(FamilyNominationBias).max(32).default([]),
  symbolFocus: z.array(z.string().min(1).max(32)).max(64).default([]),
  orientationLeverDeltas: z.array(OrientationLeverDelta).max(48).default([]),
  freshnessState: OrientationFreshness.default('unknown'),
  contentHash: z.string().min(1),
  capturedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});
export type CompanyPostureOrientation = z.infer<typeof CompanyPostureOrientation>;

/** Slim engine feed (D-243) — not the UI MarketHubResponse monolith. */
export const MarketPostureEngineFeed = z.object({
  schemaVersion: z.literal(1),
  companyId: z.string().uuid(),
  hubRevision: z.string().min(1),
  analyzePhase: z.string().nullable().optional(),
  orientationId: z.string().uuid().nullable().optional(),
  freshnessState: OrientationFreshness,
  seals: z
    .object({
      movers: z
        .object({
          sealId: z.string(),
          verifiedAt: z.string().datetime().optional(),
          expiresAt: z.string().datetime().optional(),
          corroborationBand: z.string().optional(),
        })
        .nullable()
        .optional(),
      sector: z
        .object({
          sealId: z.string(),
          verifiedAt: z.string().datetime().optional(),
          expiresAt: z.string().datetime().optional(),
        })
        .nullable()
        .optional(),
      dailyPhase: z
        .object({
          sealId: z.string(),
          verifiedAt: z.string().datetime().optional(),
          expiresAt: z.string().datetime().optional(),
        })
        .nullable()
        .optional(),
    })
    .default({}),
  symbolIndex: z.record(z.string(), z.number().int().nonnegative()).default({}),
  capturedAt: z.string().datetime(),
});
export type MarketPostureEngineFeed = z.infer<typeof MarketPostureEngineFeed>;
