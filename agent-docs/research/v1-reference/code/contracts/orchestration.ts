// ============================================================
// Orchestration contracts — runs, leads, decision trees, trends
// ============================================================

import type { HandoffEnvelope, BrokerMode } from "./foundation.js";

export type RunPhase =
  | "evidence_gather"
  | "strategic"
  | "tactical"
  | "compile"
  | "dispatch"
  | "complete"
  | "failed"
  | "cancelled";

export type RunStatus = "active" | "complete" | "failed" | "cancelled";

// ── OrchestrationRun ─────────────────────────────────────────
export interface OrchestrationRun {
  id: string;
  workspaceId: string;
  brokerCycleId: string;
  brokerMode: BrokerMode;
  phase: RunPhase;
  status: RunStatus;
  controlSnapshotRef: string;
  deterministicSeed: string;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
  strategyFamilyRefs: string[];
  sectorRefs: string[];
  brokerPolicyRef: string;
}

// ── OrchestrationSignal ───────────────────────────────────────
export type SignalVerb =
  | "run_started"
  | "phase_transition"
  | "evidence_ready"
  | "lead_generated"
  | "tree_expanded"
  | "compile_blocked"
  | "compile_ready"
  | "dispatch_admitted"
  | "dispatch_rejected"
  | "position_opened"
  | "position_closed"
  | "guardrail_breach"
  | "recovery_triggered"
  | "run_complete"
  | "run_failed";

export interface OrchestrationSignal {
  id: string;
  runId: string;
  workspaceId: string;
  verb: SignalVerb;
  subjectType: string;
  subjectId: string;
  causationRef: string | null;
  payload: Record<string, unknown>;
  emittedAt: string;
}

// ── LeadPackage ───────────────────────────────────────────────
export type LeadStatus = "active" | "stale" | "expired" | "resolved" | "cancelled";
export type LeadConfidenceClass = "high" | "medium" | "low";

export interface LeadPackage {
  id: string;
  workspaceId: string;
  runId: string;
  strategyFamilyRef: string;
  strategyVariantRef: string | null;
  primarySymbol: string;
  secondarySymbols: string[];
  sectorRef: string;
  triggerDescription: string;
  triggerConditionEncoded: string;
  evidenceRefs: string[];
  confidenceClass: LeadConfidenceClass;
  status: LeadStatus;
  brokerMode: BrokerMode;
  controlSnapshotRef: string;
  handoffEnvelope: HandoffEnvelope;
  generatedAt: string;
  expiresAt: string;
}

// ── DecisionTree ──────────────────────────────────────────────
export type TreeStatus = "draft" | "complete" | "compile_blocked" | "dispatching" | "exhausted" | "cancelled";

export interface DecisionTreeBranch {
  branchId: string;
  label: string;
  conditionDescription: string;
  conditionEncoded: string;
  priority: number;
  actionTemplateRef: string;
  expectedOutcome: string;
  recoveryLadderRef: string | null;
  children: DecisionTreeBranch[];
}

export interface RecoveryProtocol {
  protocolId: string;
  guardrailPackageRef: string;
  failureCodes: string[];
  steps: RecoveryStep[];
}

export interface RecoveryStep {
  stepId: string;
  order: number;
  actionVerb: string;
  condition: string;
  timeoutMs: number;
  escalatesToStepId: string | null;
}

export interface DecisionTree {
  id: string;
  workspaceId: string;
  leadPackageId: string;
  runId: string;
  status: TreeStatus;
  rootBranches: DecisionTreeBranch[];
  recoveryProtocol: RecoveryProtocol;
  controlSnapshotRef: string;
  handoffEnvelope: HandoffEnvelope;
  expandedAt: string;
  completedAt: string | null;
  blockReasons: string[];
}

// ── Trend ─────────────────────────────────────────────────────
export type TrendStatus = "active" | "expired" | "superseded" | "cancelled";

export interface Trend {
  id: string;
  workspaceId: string;
  runId: string;
  runNodeId: string | null;
  researchTopicId: string | null;
  sectorRef: string;
  trendLabel: string;
  vectorDescription: string;
  evidenceRefs: string[];
  strategyFamilyAffinity: string[];
  symbolRefs: string[];
  temporalScope: string;
  status: TrendStatus;
  computedAt: string;
}

// ── Lead (lightweight reference) ──────────────────────────────
export interface Lead {
  id: string;
  workspaceId: string;
  primarySymbol: string;
  strategyFamilyRef: string;
  status: LeadStatus;
  generatedAt: string;
  expiresAt: string;
}
