import { z } from 'zod';

/**
 * Foundation enums and envelopes carried from hftr v1
 * (agent-docs/research/v1-carryover.md §3). Every cross-tier artifact travels
 * inside a HandoffEnvelope so authority, mutability, and lineage are explicit.
 */

export const AuthorityClass = z.enum([
  'DETERMINISTIC',
  'PROVIDER_ANALYZED',
  'CURATED_BACKGROUND',
  'TRAINING_DERIVED',
  'OPERATOR_INPUT',
]);
export type AuthorityClass = z.infer<typeof AuthorityClass>;

export const MutationClass = z.enum(['IMMUTABLE', 'BOUNDED_MUTABLE', 'READ_ONLY_DERIVED']);
export type MutationClass = z.infer<typeof MutationClass>;

export const QueueClass = z.enum([
  'RESEARCH',
  /** Library / topic research lane — separate from posture and execution (D-098). */
  'LIBRARY_RESEARCH',
  /** Market-posture / system-library research lane (movers, sector news, …). */
  'POSTURE_RESEARCH',
  'STRATEGIC',
  'TACTICAL',
  'COMPILE',
  'DISPATCH',
  'VERIFY',
  'TRAINING',
  'ASSISTANT',
  'BILLING',
  'MAINTENANCE',
]);
export type QueueClass = z.infer<typeof QueueClass>;

export const PriorityBand = z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
export type PriorityBand = z.infer<typeof PriorityBand>;

/** Numeric priority used by the queue claim ORDER BY (higher first). */
export const PRIORITY_VALUE: Record<PriorityBand, number> = {
  LOW: 0,
  NORMAL: 10,
  HIGH: 20,
  CRITICAL: 30,
};

export const TimeoutClass = z.enum(['SHORT', 'MEDIUM', 'LONG']);
export type TimeoutClass = z.infer<typeof TimeoutClass>;

/** Lease durations per timeout class (ms). */
export const TIMEOUT_LEASE_MS: Record<TimeoutClass, number> = {
  SHORT: 30_000,
  MEDIUM: 120_000,
  LONG: 600_000,
};

export const TradingMode = z.enum(['paper', 'live']);
export type TradingMode = z.infer<typeof TradingMode>;

/**
 * Failure code families. Guardrail families carried from v1; numeric families
 * added by D-008/D-009 (agent-docs/architecture/number-handling.md).
 */
export const FailureCode = z.enum([
  'session_legality_block',
  'broker_policy_block',
  'market_structure_block',
  'capital_limit_block',
  /** D-122: engine cannot spend another engine’s allocated capital without explicit share. */
  'capital_isolation_block',
  'verification_schema_block',
  'recovery_exhausted_escalation',
  'numeric_sanity_block',
  'numeric_leak',
  'stale_input',
  'unit_error',
  'out_of_scope',
  'out_of_range',
  'unknown_lever',
  'schema_validation_failed',
  'budget_exceeded',
  'live_gate_blocked',
]);
export type FailureCode = z.infer<typeof FailureCode>;

export const HandoffEnvelope = z.object({
  contractVersion: z.string(),
  producerRunId: z.string().uuid().nullable(),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  authorityClass: AuthorityClass,
  mutationClass: MutationClass,
  queueClass: QueueClass,
  priorityBand: PriorityBand,
  timeoutClass: TimeoutClass,
  idempotencyKey: z.string().min(8),
  replayHash: z.string().nullable(),
  controlSnapshotRef: z.string().uuid().nullable(),
  causationRefs: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().nullable(),
});
export type HandoffEnvelope = z.infer<typeof HandoffEnvelope>;
