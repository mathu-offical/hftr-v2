import { z } from 'zod';

/**
 * Guardrail package evaluation contracts. Packages are immutable at runtime;
 * only band positions inside seeded envelopes may move (D-028).
 */

export const GuardrailPackageRef = z.object({
  packageId: z.string().min(1),
  catalogVersion: z.string().min(1),
  name: z.string().min(1),
  class: z.string().min(1),
});
export type GuardrailPackageRef = z.infer<typeof GuardrailPackageRef>;

export const GuardrailOutcome = z.enum(['pass', 'block', 'defer']);
export type GuardrailOutcome = z.infer<typeof GuardrailOutcome>;

export const GuardrailEvaluation = z.object({
  schemaVersion: z.literal(1),
  packageRef: GuardrailPackageRef,
  outcome: GuardrailOutcome,
  /** Trigger ids from the catalog that fired (empty when pass). */
  firedTriggers: z.array(z.string()),
  failureCodes: z.array(z.string()),
  evidence: z.string().min(1),
  evaluatedAt: z.string().datetime(),
});
export type GuardrailEvaluation = z.infer<typeof GuardrailEvaluation>;
