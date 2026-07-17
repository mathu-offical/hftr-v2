// ============================================================
// Training contracts — paper runs, replay drills, datasets
// ============================================================

import type { BrokerMode } from "./foundation.js";

// ── PaperTrainingRun ──────────────────────────────────────────
export type TrainingRunStatus = "queued" | "running" | "complete" | "failed" | "cancelled";

export interface PaperTrainingRun {
  id: string;
  workspaceId: string;
  orchestrationRunId: string;
  runNodeId: string | null;
  brokerMode: Extract<BrokerMode, "paper">;
  strategyFamilyRef: string;
  sectorRefs: string[];
  startedAt: string;
  completedAt: string | null;
  status: TrainingRunStatus;
  tradeCount: number;
  filledCount: number;
  cancelledCount: number;
  grossPnlUsd: string;
  netPnlUsd: string;
  totalSlippageBps: number;
  maxDrawdownUsd: string;
  maxDrawdownPct: number;
  deterministicSeed: string;
}

// ── ReplayDrillRun ────────────────────────────────────────────
export interface ReplayDrillRun {
  id: string;
  workspaceId: string;
  datasetManifestId: string;
  strategyFamilyRef: string;
  deterministicSeed: string;
  status: TrainingRunStatus;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  tradeCount: number;
  outcomeDigest: string | null;
  errorCode: string | null;
  errorDetail: string | null;
}

// ── DatasetManifest ───────────────────────────────────────────
export interface DatasetManifest {
  id: string;
  workspaceId: string;
  label: string;
  description: string;
  symbolRefs: string[];
  sectorRefs: string[];
  dateRangeStart: string;
  dateRangeEnd: string;
  totalRows: number;
  digest: string;
  createdAt: string;
  sourceRef: string;
  status: "draft" | "ready" | "archived";
}

// ── TrainingFeedbackRecord ────────────────────────────────────
export interface TrainingFeedbackRecord {
  id: string;
  workspaceId: string;
  runId: string;
  traceId: string;
  strategyFamilyRef: string;
  symbol: string;
  pnlUsd: string;
  slippageBps: number;
  fillQuality: "good" | "partial" | "poor";
  guardrailBreachCount: number;
  feedbackFlags: string[];
  createdAt: string;
}

// ── PromotionDecision ─────────────────────────────────────────
export type PromotionDecisionStatus = "pending" | "approved" | "rejected" | "applied";

export interface PromotionDecision {
  id: string;
  workspaceId: string;
  runId: string;
  strategyFamilyRef: string;
  proposedWeightDelta: Record<string, number>;
  proposedRangeDelta: Record<string, [number, number]>;
  evidenceRefs: string[];
  status: PromotionDecisionStatus;
  reviewerUserId: string | null;
  reviewNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

// ── CurationPromotionReview ───────────────────────────────────
export interface CurationPromotionReview {
  id: string;
  workspaceId: string;
  promotionDecisionId: string;
  reviewType: "nightly_auto" | "manual_operator";
  gatePassed: boolean;
  reviewFindings: string[];
  appliedAt: string | null;
  reviewedAt: string;
}
