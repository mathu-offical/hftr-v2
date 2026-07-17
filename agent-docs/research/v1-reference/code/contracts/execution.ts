// ============================================================
// Execution contracts — compile, dispatch, verification, traces
// Deterministic tool matrix layer: NO model inference here.
// ============================================================

import type { BrokerMode } from "./foundation.js";
import type { HandoffEnvelope } from "./foundation.js";

// ── Compile phase ─────────────────────────────────────────────
export type CompileBlockReason =
  | "missing_gate_evidence"
  | "stale_entitlement"
  | "session_incompatible"
  | "missing_precision_safe_mapping"
  | "guardrail_veto"
  | "policy_mismatch";

export interface CompileRequest {
  requestId: string;
  workspaceId: string;
  decisionTreeId: string;
  leadPackageId: string;
  runId: string;
  branchIds: string[];
  controlSnapshotRef: string;
  requestedAt: string;
}

export interface CompileResult {
  resultId: string;
  requestId: string;
  workspaceId: string;
  success: boolean;
  blockReasons: CompileBlockReason[];
  actionInstructionIds: string[];
  compiledAt: string;
}

// ── ActionInstruction ─────────────────────────────────────────
export type OrderClass = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
export type OrderSide = "buy" | "sell" | "sell_short" | "buy_to_cover";
export type TifClass = "day" | "gtc" | "ioc" | "fok" | "opg" | "cls";
export type ActionInstructionStatus =
  | "compiled"
  | "admitted"
  | "rejected"
  | "dispatched"
  | "filled"
  | "partial_fill"
  | "cancelled"
  | "expired"
  | "error";

export interface PrecisionSafeOrderSpec {
  symbol: string;
  orderClass: OrderClass;
  side: OrderSide;
  qty: string;                   // decimal string to avoid float rounding
  limitPrice: string | null;     // decimal string
  stopPrice: string | null;      // decimal string
  tif: TifClass;
  extendedHours: boolean;
  clientOrderId: string;
}

export interface ActionInstruction {
  id: string;
  workspaceId: string;
  runId: string;
  decisionTreeId: string;
  branchId: string;
  leadPackageId: string;
  brokerMode: BrokerMode;
  actionVerb: string;
  orderSpec: PrecisionSafeOrderSpec;
  guardrailPolicyRefs: string[];
  verificationSchemaVersion: string;
  controlSnapshotRef: string;
  handoffEnvelope: HandoffEnvelope;
  status: ActionInstructionStatus;
  compiledAt: string;
  expiresAt: string;
}

// ── DeterministicActionTask ───────────────────────────────────
// This is the final dispatch packet. No model inference after this point.
export interface DeterministicActionTask {
  taskId: string;
  actionInstructionId: string;
  workspaceId: string;
  brokerLabel: string;
  brokerMode: BrokerMode;
  orderSpec: PrecisionSafeOrderSpec;
  legalityCheckVersion: string;
  guardrailSummary: string;
  correlationId: string;
  idempotencyKey: string;
  admittedAt: string;
  expiresAt: string;
}

// ── VerificationRecord ────────────────────────────────────────
export type VerificationStatus = "passed" | "failed" | "error";

export interface VerificationRecord {
  id: string;
  workspaceId: string;
  taskId: string;
  actionInstructionId: string;
  schemaVersion: string;
  status: VerificationStatus;
  fieldResults: VerificationFieldResult[];
  guardrailResults: GuardrailResult[];
  verifiedAt: string;
}

export interface VerificationFieldResult {
  field: string;
  passed: boolean;
  failureCode: string | null;
  actualValue: string;
  expectedConstraint: string;
}

export interface GuardrailResult {
  guardrailId: string;
  scope: string;
  passed: boolean;
  triggerValue: string | null;
  thresholdValue: string;
  onBreachAction: string;
  evaluatedAt: string;
}

// ── ActionTrace ───────────────────────────────────────────────
// Immutable once written. Records full provenance chain.
export interface ActionTrace {
  id: string;
  workspaceId: string;
  runId: string;
  traceClass: "compile" | "dispatch" | "fill" | "cancel" | "guardrail_breach" | "recovery";
  leadPackageId: string;
  decisionTreeId: string;
  actionInstructionId: string;
  taskId: string | null;
  brokerOrderId: string | null;
  brokerMode: BrokerMode;
  symbol: string;
  side: OrderSide;
  orderedQty: string;
  filledQty: string | null;
  avgFillPrice: string | null;
  slippageBps: number | null;
  guardrailRefs: string[];
  outcomeStatus: "filled" | "partial_fill" | "cancelled" | "expired" | "error" | "blocked";
  blockReasonCodes: string[];
  verificationRecordId: string | null;
  provenance: ActionTraceProvenance;
  tracedAt: string;
}

export interface ActionTraceProvenance {
  strategyFamilyRef: string;
  strategyVariantRef: string | null;
  evidencePackageRefs: string[];
  controlSnapshotRef: string;
  deterministicSeed: string;
  replayHash: string;
}

// ── DispatchReconciliationEvent ───────────────────────────────
export type ReconciliationOutcome = "confirmed" | "cancelled" | "replaced" | "expired" | "error";

export interface DispatchReconciliationEvent {
  id: string;
  workspaceId: string;
  taskId: string;
  brokerOrderId: string | null;
  reconciliationTrigger: "timeout" | "fill" | "cancel_ack" | "replace_ack" | "error_ack";
  outcome: ReconciliationOutcome;
  recoveryStepRef: string | null;
  detail: Record<string, unknown>;
  reconciledAt: string;
}
