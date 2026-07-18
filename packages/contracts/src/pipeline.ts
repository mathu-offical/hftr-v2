import { z } from 'zod';
import { FailureCode, HandoffEnvelope } from './foundation';
import { ValueRefHandle } from './numeric';

/**
 * Pipeline artifact contracts, carried from v1
 * (agent-docs/research/v1-carryover.md §3) and adapted to the NRA rule that
 * value-bearing fields are ValueRefHandles, never raw numbers.
 */

export const RegimeSnapshot = z.object({
  trendUp: z.number().min(0).max(1),
  trendDown: z.number().min(0).max(1),
  meanReversion: z.number().min(0).max(1),
  volExpansion: z.number().min(0).max(1),
  liquidityStress: z.number().min(0).max(1),
  eventShock: z.number().min(0).max(1),
  riskOff: z.number().min(0).max(1),
  computedFrom: z.enum(['live_bars', 'seed_synthetic']),
  asOfRef: ValueRefHandle,
});
export type RegimeSnapshot = z.infer<typeof RegimeSnapshot>;

export const TrendStatus = z.enum(['proposed', 'active', 'completed', 'invalidated']);

export const TrendCandidate = z.object({
  title: z.string().min(1).max(200),
  thesis: z.string().min(1).max(4000),
  symbolRefs: z.array(z.string().min(1)).max(30),
  evidenceRefs: z.array(z.string()).default([]),
  confidenceClass: z.enum(['low', 'medium', 'high']),
});
export type TrendCandidate = z.infer<typeof TrendCandidate>;

export const GateResult = z.object({
  gate: z.enum([
    'regime_fit',
    'symbol_universe_fit',
    'session_fit',
    'broker_fit',
    'market_structure_fit',
    'evidence_fit',
  ]),
  pass: z.boolean(),
  reason: z.string(),
});
export type GateResult = z.infer<typeof GateResult>;

export const ActivationValidationResult = z.object({
  pass: z.boolean(),
  gates: z.array(GateResult).length(6),
});
export type ActivationValidationResult = z.infer<typeof ActivationValidationResult>;

export const LeadPackage = z.object({
  symbol: z.string().min(1),
  strategyFamilyRef: z.string(),
  confidenceClass: z.enum(['low', 'medium', 'high']),
  rationale: z.string().max(2000),
  activation: ActivationValidationResult.nullable(),
  envelope: HandoffEnvelope,
});
export type LeadPackage = z.infer<typeof LeadPackage>;

// ── Levers & decision trees ──────────────────────────────────────────────────

export const LeverLayer = z.enum(['strategic', 'tactical', 'execution']);
export type LeverLayer = z.infer<typeof LeverLayer>;

/**
 * A lever setting is a band position OR a calc plan — never a literal number
 * (number-handling.md §6).
 */
export const LeverSetting = z.union([
  z.object({
    mode: z.literal('band'),
    bandId: z.string(),
    position: z.enum(['min', 'typical', 'max']),
  }),
  z.object({
    mode: z.literal('calc'),
    bandId: z.string(),
    calcOpName: z.string(),
    args: z.record(z.string()),
  }),
]);
export type LeverSetting = z.infer<typeof LeverSetting>;

export const LeverState = z.record(LeverSetting);
export type LeverState = z.infer<typeof LeverState>;

export const ExecutableStateKind = z.enum(['watch', 'wait', 'order', 'blocked', 'fallback']);
export type ExecutableStateKind = z.infer<typeof ExecutableStateKind>;

export const BranchNode = z.object({
  id: z.string(),
  condition: z.string(), // deterministic condition DSL reference
  onTrue: z.string().nullable(),
  onFalse: z.string().nullable(),
  emits: ExecutableStateKind.nullable(),
});
export type BranchNode = z.infer<typeof BranchNode>;

export const DecisionTree = z.object({
  treeVersion: z.number().int().min(1),
  leadRef: z.string().uuid(),
  rootBranches: z.array(BranchNode).min(1),
  leverState: LeverState,
  recoveryLadderRef: z.string(),
  blockReasons: z.array(FailureCode).default([]),
  envelope: HandoffEnvelope,
});
export type DecisionTree = z.infer<typeof DecisionTree>;

// ── Instructions, tasks, traces ──────────────────────────────────────────────

export const ActionVerb = z.enum(['buy', 'sell', 'cancel', 'replace', 'close_position']);
export type ActionVerb = z.infer<typeof ActionVerb>;

export const OrderType = z.enum(['market', 'limit', 'stop', 'stop_limit']);
export const TimeInForce = z.enum(['day', 'gtc', 'ioc', 'fok']);

/** Compile output: all value fields are refs (resolved by the finalizer). */
export const ActionInstruction = z.object({
  actionVerb: ActionVerb,
  symbol: z.string().min(1),
  orderType: OrderType,
  timeInForce: TimeInForce,
  quantityRef: ValueRefHandle,
  limitPriceRef: ValueRefHandle.nullable(),
  stopPriceRef: ValueRefHandle.nullable(),
  fillTimeoutRef: ValueRefHandle,
  guardrailRefs: z.array(z.string()).min(1),
  verificationSchemaVersion: z.string(),
  clientOrderId: z.string().min(8),
  envelope: HandoffEnvelope,
});
export type ActionInstruction = z.infer<typeof ActionInstruction>;

/** Finalized, ref-resolved order the deterministic core hands to an adapter. */
export const DeterministicActionTask = z.object({
  instructionRef: z.string().uuid(),
  symbol: z.string(),
  actionVerb: ActionVerb,
  orderType: OrderType,
  timeInForce: TimeInForce,
  quantityInt: z.string(), // fixed-point bigint as string
  quantityScale: z.number().int(),
  limitPriceCents: z.number().int().nullable(),
  stopPriceCents: z.number().int().nullable(),
  fillTimeoutMs: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
  clientOrderId: z.string().min(8).optional(),
  lineage: z.object({
    quantityRef: z.string(),
    limitPriceRef: z.string().nullable(),
    fillTimeoutRef: z.string(),
  }),
});
export type DeterministicActionTask = z.infer<typeof DeterministicActionTask>;

/** ValueRef handles exposed on a trace timeline for Values-tab deep links. */
export const TraceValueRefs = z.object({
  quantityRef: z.string().min(1),
  limitPriceRef: z.string().min(1).nullable(),
  fillTimeoutRef: z.string().min(1),
});
export type TraceValueRefs = z.infer<typeof TraceValueRefs>;

export const TraceTimelineStage = z.object({
  stage: z.enum(['lead', 'tree', 'compile', 'task', 'trace', 'verification', 'ledger']),
  at: z.string(),
  status: z.string(),
  summary: z.string(),
  refId: z.string(),
});

export const TraceTimelineResponse = z.object({
  timeline: z.array(TraceTimelineStage),
  valueRefs: TraceValueRefs.nullable(),
});
export type TraceTimelineResponse = z.infer<typeof TraceTimelineResponse>;

export const TraceOutcome = z.enum([
  'filled',
  'partial',
  'canceled',
  'replaced',
  'rejected',
  'blocked',
  'recovered',
]);

export const ActionTrace = z.object({
  taskRef: z.string().uuid().nullable(),
  venue: z.string(),
  mode: z.enum(['paper', 'live']),
  outcome: TraceOutcome,
  fills: z.array(
    z.object({
      qtyInt: z.string(),
      qtyScale: z.number().int(),
      priceCents: z.number().int(),
      atRef: z.string(),
    }),
  ),
  simulatorGapTags: z.array(z.string()).default([]),
  sessionLegalitySnapshot: z.record(z.unknown()),
  policyEnvelopeVersion: z.string(),
  failureCode: FailureCode.nullable(),
});
export type ActionTrace = z.infer<typeof ActionTrace>;

export const VerificationRecord = z.object({
  traceRef: z.string().uuid().nullable(),
  taskRef: z.string().uuid().nullable(),
  result: z.enum(['pass', 'fail', 'blocked']),
  fieldResults: z.array(z.object({ field: z.string(), pass: z.boolean(), detail: z.string() })),
  failureCode: FailureCode.nullable(),
  recoveryProtocolId: z.string().nullable(),
});
export type VerificationRecord = z.infer<typeof VerificationRecord>;
