import { z } from 'zod';

/**
 * D-244: Order composition plan — trading desk decomposes one Lead/tree into
 * one or more ActionInstruction legs + policy binding.
 * Distinct from POV child-slice fill drain of a single instruction.
 */

export const CompositionMode = z.enum(['entry_only', 'entry_plus_exits', 'bracket']);
export type CompositionMode = z.infer<typeof CompositionMode>;

export const CompositionLegRole = z.enum([
  'primary_entry',
  'retest_entry',
  'scaled_exit',
  'trailing_exit',
  'thesis_invalidation_exit',
  'time_based_exit',
  'controlled_reentry',
  'replace',
]);
export type CompositionLegRole = z.infer<typeof CompositionLegRole>;

export const CompositionLegCompileStatus = z.enum([
  'pending',
  'ready',
  'blocked',
  'compiled',
  'dispatched',
  'done',
]);
export type CompositionLegCompileStatus = z.infer<typeof CompositionLegCompileStatus>;

export const CompositionLeg = z.object({
  legId: z.string().uuid(),
  role: CompositionLegRole,
  branchRef: z.string().min(1).max(120).optional(),
  guardrailRefs: z.array(z.string().min(1)).max(32).default([]),
  dependsOnLegIds: z.array(z.string().uuid()).max(8).optional(),
  compileStatus: CompositionLegCompileStatus.default('pending'),
  blockReasons: z.array(z.string().min(1).max(120)).max(16).optional(),
});
export type CompositionLeg = z.infer<typeof CompositionLeg>;

export const OrderCompositionPlan = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().uuid(),
  leadRef: z.string().uuid(),
  decisionTreeRef: z.string().uuid(),
  tradingModuleId: z.string().uuid(),
  policyEnvelopeRef: z.string().min(1).nullable().optional(),
  controlSnapshotRef: z.string().uuid().nullable().optional(),
  postureOrientationRef: z.string().uuid().nullable().optional(),
  compositionMode: CompositionMode.default('entry_only'),
  legs: z.array(CompositionLeg).min(1).max(16),
  createdAt: z.string().datetime(),
});
export type OrderCompositionPlan = z.infer<typeof OrderCompositionPlan>;

/**
 * D-244 trading path executable posture (gates compose/compile).
 * Uses pipeline ExecutableStateKind values; prefer `order` to proceed.
 */
export const TradingPathExecutableState = z.object({
  schemaVersion: z.literal(1),
  leadRef: z.string().uuid(),
  decisionTreeRef: z.string().uuid(),
  tradingModuleId: z.string().uuid(),
  /** Align with pipeline ExecutableStateKind: watch | wait | order | blocked | fallback */
  state: z.enum(['watch', 'wait', 'order', 'blocked', 'fallback']),
  reasonCodes: z.array(z.string().min(1).max(80)).max(16).default([]),
  updatedAt: z.string().datetime(),
});
export type TradingPathExecutableState = z.infer<typeof TradingPathExecutableState>;
