// ============================================================
// Research contracts — evidence, knowledge, market-data queries
// ============================================================

import type { SixGateType } from "./seeds.js";

export type EvidenceClass =
  | "market_regime"
  | "symbol_liquidity"
  | "macro_event"
  | "company_event"
  | "compliance_check"
  | "session_constraint"
  | "broker_eligibility";

export type EvidenceStatus = "fresh" | "stale" | "expired" | "invalid";

// ── EvidencePackage ──────────────────────────────────────────
export interface EvidencePackage {
  id: string;
  workspaceId: string;
  orchestrationRunId: string;
  evidenceClass: EvidenceClass;
  symbolRefs: string[];
  sectorRefs: string[];
  macroTriggerRefs: string[];
  companyEventRefs: string[];
  sourceRef: string;
  rawDigest: string;
  computedAt: string;
  expiresAt: string;
  status: EvidenceStatus;
  structuredFindings: Record<string, unknown>;
}

// ── KnowledgeQueryRequest ─────────────────────────────────────
export interface KnowledgeQueryRequest {
  requestId: string;
  workspaceId: string;
  orchestrationRunId: string;
  queryType: "macro" | "sector" | "symbol" | "company_event" | "compliance" | "session";
  subjectRefs: string[];
  requiredGates: SixGateType[];
  freshnessWindowMin: number;
  requestedAt: string;
}

// ── KnowledgeQueryResult ──────────────────────────────────────
export interface KnowledgeQueryResult {
  resultId: string;
  requestId: string;
  workspaceId: string;
  evidencePackageIds: string[];
  statusByGate: Record<SixGateType, "satisfied" | "blocked" | "pending">;
  overallStatus: "satisfied" | "partially_blocked" | "blocked";
  computedAt: string;
}

// ── ResearchQueryJob ─────────────────────────────────────────
export interface ResearchQueryJob {
  jobId: string;
  workspaceId: string;
  jobType: string;
  subjectRefs: string[];
  status: "queued" | "running" | "complete" | "failed" | "cancelled";
  resultRef: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorDetail: string | null;
}

// ── Market snapshot ───────────────────────────────────────────
export interface StockSnapshot {
  symbol: string;
  workspaceId: string;
  snapshotAt: string;
  bidPrice: string;
  askPrice: string;
  lastPrice: string;
  bidSize: number;
  askSize: number;
  volumeToday: number;
  avgVolume20d: number;
  spreadBps: number;
  volatilityAnnualized: number;
  regimeLabel: string | null;
  sessionState: string;
}

// ── Promoted seed snapshot ────────────────────────────────────
export interface PromotedSeedSnapshot {
  snapshotId: string;
  catalogType: string;
  version: string;
  digest: string;
  status: "active" | "superseded" | "archived";
  promotedAt: string;
  promotedByJobId: string;
  sourceRef: string;
  weightDelta: Record<string, number>;
}
