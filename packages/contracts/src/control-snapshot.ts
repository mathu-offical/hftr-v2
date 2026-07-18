import { z } from 'zod';
import { LeverState } from './pipeline';
import { PhilosophyProfile } from './philosophy';
import { WeightEnvelope } from './weight-envelope';

/**
 * Replayable control-plane snapshot: philosophy axes, lever state, and
 * immutable envelope versions bound at evaluation time.
 */

export const ControlSnapshot = z.object({
  schemaVersion: z.literal(1),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  philosophyProfile: PhilosophyProfile,
  leverState: LeverState,
  /** Optional ranking/sizing weight envelopes (D-126). */
  weightEnvelopes: z.array(WeightEnvelope).optional(),
  envelopeVersions: z.object({
    policyEnvelopeVersion: z.string().min(1),
    brokerEnvelopeVersion: z.string().min(1),
    sessionCatalogVersion: z.string().min(1),
    guardrailCatalogVersion: z.string().min(1),
    liveGateBandsVersion: z.string().min(1),
  }),
  /** Deterministic hash of canonical JSON payload (hex sha256). */
  contentHash: z.string().min(1),
  capturedAt: z.string().datetime(),
});
export type ControlSnapshot = z.infer<typeof ControlSnapshot>;
