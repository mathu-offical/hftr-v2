import { z } from 'zod';
import { TradingMode } from './foundation';
import { SessionPhase } from './numeric';

/**
 * Dynamic operating limits and live-gate contracts.
 * Research baselines only — live arming requires fresh evidence (D-028).
 */

export const LimitDomain = z.enum([
  'buying_power',
  'session_legality',
  'daily_loss_remaining',
  'order_frequency',
]);
export type LimitDomain = z.infer<typeof LimitDomain>;

/** Immutable hard-cap reference from seeded guardrail/broker/session catalogs. */
export const HardEnvelopeRef = z.object({
  catalog: z.enum([
    'guardrail_packages',
    'broker_policy_envelopes',
    'session_constraints',
    'live_gate_threshold_bands',
  ]),
  entryKey: z.string().min(1),
  field: z.string().min(1),
  catalogVersion: z.string().min(1),
});
export type HardEnvelopeRef = z.infer<typeof HardEnvelopeRef>;

export const OperatingLimitStatus = z.enum(['pass', 'block', 'degraded']);
export type OperatingLimitStatus = z.infer<typeof OperatingLimitStatus>;

export const OperatingLimitResult = z.object({
  domain: LimitDomain,
  status: OperatingLimitStatus,
  /** Fixed-point integer in domain-specific units (cents, bps, count, or 0/1 legality). */
  valueInt: z.string().nullable(),
  unit: z.string(),
  evidence: z.string().min(1),
  hardEnvelopeRef: HardEnvelopeRef.nullable(),
  operatorCapInt: z.string().nullable(),
  calcValueInt: z.string().nullable(),
});
export type OperatingLimitResult = z.infer<typeof OperatingLimitResult>;

export const LimitsSnapshot = z.object({
  schemaVersion: z.literal(1),
  companyId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  mode: TradingMode,
  evaluatedAt: z.string().datetime(),
  sessionPhase: SessionPhase,
  limits: z.array(OperatingLimitResult),
  overallPass: z.boolean(),
});
export type LimitsSnapshot = z.infer<typeof LimitsSnapshot>;

export const LiveGateId = z.enum([
  'broker_connection_verified',
  'broker_entitlements_valid',
  'paper_maturity_threshold',
  'verification_pass_rate_threshold',
  'guardrail_packages_active',
  'evidence_freshness',
  'operator_explicit_armed',
]);
export type LiveGateId = z.infer<typeof LiveGateId>;

export const LIVE_GATE_IDS = LiveGateId.options;

export const LiveGateChecklistItem = z.object({
  gateId: LiveGateId,
  required: z.boolean(),
  pass: z.boolean(),
  evidence: z.string().min(1),
  requiredAction: z.string().nullable(),
});
export type LiveGateChecklistItem = z.infer<typeof LiveGateChecklistItem>;

export const LiveGateEvidence = z.object({
  schemaVersion: z.literal(1),
  companyId: z.string().uuid(),
  mode: z.literal('live'),
  catalogVersion: z.string().min(1),
  evaluatedAt: z.string().datetime(),
  checklist: z.array(LiveGateChecklistItem),
  overallPass: z.boolean(),
  /** Epoch ms of newest supporting artifact; stale if now - evaluatedAt > 24h. */
  evidenceAsOfMs: z.number().int().nonnegative(),
});
export type LiveGateEvidence = z.infer<typeof LiveGateEvidence>;

export const LIVE_GATE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Fail-closed: live dispatch allowed only when armed, evidence parses, and fresh (<24h). */
export function isLiveDispatchAllowed(
  evidence: LiveGateEvidence | null | undefined,
  nowMs: number,
  armedAtMs: number | null | undefined,
): boolean {
  if (!armedAtMs || armedAtMs <= 0) return false;
  if (!evidence) return false;
  const parsed = LiveGateEvidence.safeParse(evidence);
  if (!parsed.success) return false;
  const ageMs = nowMs - parsed.data.evidenceAsOfMs;
  if (ageMs < 0 || ageMs > LIVE_GATE_EVIDENCE_MAX_AGE_MS) return false;
  return parsed.data.overallPass;
}
