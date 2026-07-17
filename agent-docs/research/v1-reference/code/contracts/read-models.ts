// ============================================================
// Read-model contracts — operator surface projections
// ============================================================

import type { BrokerMode, ConnectionStatus } from "./foundation.js";
import type { RunPhase, RunStatus } from "./orchestration.js";
import type { ActionInstructionStatus } from "./execution.js";

// ── BrokerShellReadModel ──────────────────────────────────────
export interface BrokerShellReadModel {
  workspaceId: string;
  brokerLabel: string;
  brokerMode: BrokerMode;
  connectionStatus: ConnectionStatus;
  portfolioEquity: string;
  portfolioCash: string;
  portfolioDayPnl: string;
  openPositionCount: number;
  pendingOrderCount: number;
  activeLeadCount: number;
  activeRunCount: number;
  capitalCapUsd: number;
  drawdownPct: number;
  maxDrawdownPct: number;
  guardrailStatus: "green" | "amber" | "red";
  lastRefreshedAt: string;
}

// ── CanvasOfficeProjection ─────────────────────────────────────
export interface CanvasOfficeProjection {
  workspaceId: string;
  brokerMode: BrokerMode;
  sectors: SectorCanvasNode[];
  activeLeads: LeadCanvasNode[];
  openPositions: PositionCanvasNode[];
  lastRefreshedAt: string;
}

export interface SectorCanvasNode {
  sectorRef: string;
  sectorName: string;
  activeLeadCount: number;
  openPositionCount: number;
  exposureUsd: string;
  trendLabels: string[];
}

export interface LeadCanvasNode {
  leadId: string;
  symbol: string;
  strategyFamilyRef: string;
  sectorRef: string;
  confidenceClass: string;
  status: string;
  expiresAt: string;
}

export interface PositionCanvasNode {
  symbol: string;
  side: string;
  qty: string;
  avgEntryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  unrealizedPnlBps: number;
  openedAt: string;
}

// ── CanvasWorkerProjection ─────────────────────────────────────
export interface CanvasWorkerProjection {
  workspaceId: string;
  runSummaries: RunSummaryNode[];
  lastRefreshedAt: string;
}

export interface RunSummaryNode {
  runId: string;
  phase: RunPhase;
  status: RunStatus;
  sectorRefs: string[];
  strategyFamilyRefs: string[];
  leadCount: number;
  treeCount: number;
  dispatchCount: number;
  startedAt: string;
}

// ── TraceTimelineReadModel ────────────────────────────────────
export interface TraceTimelineReadModel {
  workspaceId: string;
  runId: string;
  items: TraceTimelineItem[];
  computedAt: string;
}

export interface TraceTimelineItem {
  traceId: string;
  symbol: string;
  side: string;
  traceClass: string;
  outcomeStatus: string;
  orderedQty: string;
  filledQty: string | null;
  avgFillPrice: string | null;
  slippageBps: number | null;
  blockReasonCodes: string[];
  tracedAt: string;
}

// ── EntityDetailSnapshot ──────────────────────────────────────
export interface EntityDetailSnapshot {
  entityType: "lead" | "decision_tree" | "action_instruction" | "trace";
  entityId: string;
  workspaceId: string;
  summaryFields: Record<string, string>;
  linkedIds: Record<string, string>;
  snapshotAt: string;
}

// ── LiveGateStatusSnapshot ────────────────────────────────────
export interface LiveGateStatusSnapshot {
  workspaceId: string;
  gatesPassed: boolean;
  gateDetails: LiveGateDetail[];
  evaluatedAt: string;
}

export interface LiveGateDetail {
  gateId: string;
  gateName: string;
  passed: boolean;
  failureReason: string | null;
  requiredAction: string | null;
}

// ── InstructionStatusCard ──────────────────────────────────────
export interface InstructionStatusCard {
  instructionId: string;
  symbol: string;
  side: string;
  qty: string;
  orderClass: string;
  status: ActionInstructionStatus;
  blockReasonCodes: string[];
  compiledAt: string;
  expiresAt: string;
}

// ── ExposureSnapshot ──────────────────────────────────────────
export interface ExposureSnapshot {
  workspaceId: string;
  brokerMode: BrokerMode;
  totalLongUsd: string;
  totalShortUsd: string;
  netExposureUsd: string;
  grossExposureUsd: string;
  bySymbol: SymbolExposure[];
  bySector: SectorExposure[];
  snapshotAt: string;
}

export interface SymbolExposure {
  symbol: string;
  sectorRef: string;
  longUsd: string;
  shortUsd: string;
  netUsd: string;
}

export interface SectorExposure {
  sectorRef: string;
  sectorName: string;
  longUsd: string;
  shortUsd: string;
  netUsd: string;
  pctOfPortfolio: number;
}
