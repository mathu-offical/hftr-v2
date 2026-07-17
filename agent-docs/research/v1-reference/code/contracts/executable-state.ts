// ============================================================
// Executable state — linkage between decision tree version,
// watch/wait intents, order instructions, and verified patterns.
// ============================================================

import type { LeverScope, LeverSetting } from "./levers.js";

export type ExecutableStatus = "watch" | "wait" | "order" | "blocked" | "fallback";

export interface WatchIntent {
  branchId: string;
  conditionEncoded: string;
  label: string;
  priority: number;
}

export interface WaitIntent {
  reason: string;
  untilRef: string | null;
  resumeCondition: string;
}

export interface OrderInstructionRef {
  instructionId: string;
  branchId: string;
  actionVerb: string;
  symbol: string;
  status: string;
}

export interface ExecutableState {
  id: string;
  workspaceId: string;
  runId: string;
  decisionTreeId: string;
  treeVersion: number;
  status: ExecutableStatus;
  watchIntents: WatchIntent[];
  waitIntents: WaitIntent[];
  orderInstructions: OrderInstructionRef[];
  lastVerifiedPatternRef: string | null;
  /** Set when status is fallback (e.g. tier overdue, stale analysis). */
  fallbackReason?: string | null;
  updatedAt: string;
}

// ── Control / query payloads ──────────────────────────────────

export interface TierRefreshRequest {
  scope: LeverScope;
}

export interface TierRefreshResult {
  treeId: string;
  scope: LeverScope;
  treeVersion: number;
  accepted: LeverSetting[];
  rejected: { key: string; reason: string }[];
}

export interface ApplyLeverBatchRequest {
  layer: LeverScope;
  settings: LeverSetting[];
}

export interface ApplyLeverBatchResult {
  treeId: string;
  treeVersion: number;
  accepted: LeverSetting[];
  rejected: { key: string; reason: string }[];
}

export interface SpawnRefineNodeRequest {
  treeId: string;
  spawnReason?: "loop_refine" | "verification_retry" | "manual_refine";
}

export interface SpawnRefineNodeResult {
  runId: string;
  nodeId: string;
  enqueued: boolean;
}

/** Compact operator/programmatic rollup for query APIs (progressive access). */
export interface ExecutableSummary {
  treeId: string;
  treeVersion: number;
  status: ExecutableStatus | null;
  watchCount: number;
  waitCount: number;
  orderCount: number;
  lastVerifiedPatternRef: string | null;
  primaryWaitReason: string | null;
  primaryResumeCondition: string | null;
  fallbackReason: string | null;
}
