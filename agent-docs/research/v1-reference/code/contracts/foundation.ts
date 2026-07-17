// ============================================================
// Foundation contracts — workspace, policy, shared envelopes
// ============================================================

export type BrokerMode = "paper" | "live";
export type BrokerLabel = "alpaca_paper" | "alpaca_live";

export type QueueClass = "strategic" | "tactical" | "compile" | "dispatch" | "curation";
export type PriorityBand = "critical" | "high" | "normal" | "low";
export type TimeoutClass = "fast_250ms" | "normal_1s" | "slow_5s" | "long_30s" | "extended_120s";
export type FreshnessState = "fresh" | "stale" | "expired" | "unknown";
export type PromotionState = "active" | "quarantined" | "archived" | "pending_review";

// ── HandoffEnvelope ──────────────────────────────────────────
export interface HandoffEnvelope {
  contractVersion: string;               // semver of this contract shape
  handoffType: string;                   // e.g. "lead_package" | "decision_tree" | "action_instruction"
  producerService: string;
  producerRunId: string;
  brokerWorkspaceId: string;
  brokerCycleId: string;
  correlationId: string;
  causationRefs: string[];
  inputSnapshotRef: string;
  controlSnapshotRef: string;
  idempotencyKey: string;
  replayHash: string;
  queueClass: QueueClass;
  priorityBand: PriorityBand;
  timeoutClass: TimeoutClass;
  producedAt: string;                    // ISO-8601
  expiresAt: string;                     // ISO-8601
}

// ── BrokerWorkspace ──────────────────────────────────────────
export interface BrokerWorkspace {
  id: string;
  ownerUserId: string;
  brokerLabel: BrokerLabel;
  enabledSectors: string[];
  philosophyPrompt: string;
  mode: BrokerMode;
  sandboxBudgetUsd: number;
  liveBudgetUsd: number;
  activePolicyEnvelopeId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type CreateBrokerWorkspaceInput = Pick<
  BrokerWorkspace,
  "brokerLabel" | "enabledSectors" | "philosophyPrompt" | "mode" | "sandboxBudgetUsd"
>;

// ── BrokerPolicyEnvelope ─────────────────────────────────────
export interface ThrottleCaps {
  ordersPerMinute: number;
  ordersPerHour: number;
  ordersPerDay: number;
  connectionsPerMinute: number;
}

export interface RetryBands {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface TimeoutBands {
  orderSubmitMs: number;
  orderConfirmMs: number;
  cancelReplaceMs: number;
  websocketReconnectMs: number;
}

export interface BrokerPolicyEnvelope {
  id: string;
  workspaceId: string;
  mode: BrokerMode;
  throttleCaps: ThrottleCaps;
  retryBands: RetryBands;
  timeoutBands: TimeoutBands;
  sessionAllowList: string[];           // e.g. ["regular", "extended"]
  hardLimitVersion: string;
  capitalCapUsd: number;
  maxOpenPositions: number;
  maxPositionSizeUsd: number;
  maxDrawdownPct: number;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_PAPER_POLICY: Omit<BrokerPolicyEnvelope, "id" | "workspaceId" | "createdAt" | "updatedAt"> = {
  mode: "paper",
  throttleCaps: { ordersPerMinute: 60, ordersPerHour: 200, ordersPerDay: 500, connectionsPerMinute: 5 },
  retryBands: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000, backoffMultiplier: 2 },
  timeoutBands: { orderSubmitMs: 5000, orderConfirmMs: 10000, cancelReplaceMs: 3000, websocketReconnectMs: 2000 },
  sessionAllowList: ["regular"],
  hardLimitVersion: "v1",
  capitalCapUsd: 10000,
  maxOpenPositions: 20,
  maxPositionSizeUsd: 500,
  maxDrawdownPct: 0.05,
};

// ── BrokerConnectionState ────────────────────────────────────
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "auth_pending"
  | "authorized"
  | "error";

export interface BrokerConnectionState {
  id: string;
  workspaceId: string;
  mode: BrokerMode;
  status: ConnectionStatus;
  lastConnectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  websocketSessionId: string | null;
  updatedAt: string;
}

// ── WorkspaceCredentialMetadata ──────────────────────────────
export interface WorkspaceCredentialMetadata {
  id: string;
  workspaceId: string;
  brokerLabel: BrokerLabel;
  apiKeyLastFour: string;             // never store raw keys here
  rotatedAt: string;
  expiresAt: string | null;
  addedByUserId: string;
}

// ── WorkspacePreferences ─────────────────────────────────────
export interface WorkspacePreferences {
  id: string;
  workspaceId: string;
  defaultPanelLayout: string;
  canvasDensity: "compact" | "normal" | "spacious";
  traceDepth: "shallow" | "standard" | "deep";
  updatedAt: string;
}

// ── EnvironmentRequirement ───────────────────────────────────
export interface EnvironmentRequirement {
  key: string;
  required: boolean;
  description: string;
  source: "neon" | "vercel" | "alpaca" | "groq" | "openrouter" | "brave" | "platform";
}

export const ENVIRONMENT_REQUIREMENTS: EnvironmentRequirement[] = [
  {
    key: "DATABASE_URL",
    required: true,
    description: "Primary Neon Postgres connection string for app runtime and migrations",
    source: "neon",
  },
  {
    key: "POSTGRES_URL",
    required: false,
    description: "Vercel-managed Neon pooled connection string for @vercel/postgres",
    source: "vercel",
  },
  {
    key: "POSTGRES_URL_NON_POOLING",
    required: false,
    description: "Vercel-managed Neon direct connection string for tooling and migrations",
    source: "vercel",
  },
  { key: "NEXTAUTH_SECRET", required: true, description: "NextAuth signing secret", source: "platform" },
  { key: "ALPACA_PAPER_KEY", required: true, description: "Alpaca paper API key", source: "alpaca" },
  { key: "ALPACA_PAPER_SECRET", required: true, description: "Alpaca paper API secret", source: "alpaca" },
  { key: "GROQ_API_KEY", required: true, description: "Groq API key for execution-agent tier", source: "groq" },
];
