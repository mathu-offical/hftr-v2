import type { SessionPhase, TradingMode } from '@hftr/contracts';

/** Inputs for deterministic operating-limit evaluation. Missing optional fields → block with evidence. */
export interface LimitContext {
  companyId: string;
  moduleId: string | null;
  mode: TradingMode;
  nowMs: number;
  sessionPhase: SessionPhase;
  /** Company virtual / seed balance in USD cents. */
  virtualBalanceCents?: bigint;
  /** Latest broker buying power in USD cents. */
  brokerBuyingPowerCents?: bigint;
  /** Equity basis for daily loss math in USD cents. */
  equityCents?: bigint;
  /** Realized loss today in USD cents (positive magnitude). */
  realizedLossCents?: bigint;
  /** Active broker policy envelope id (e.g. brk-001). */
  brokerEnvelopeId?: string;
  /** Recent dispatch traces within the evaluation window. */
  recentTraceTimestampsMs?: number[];
  /** Daily loss cap in bps of equity from live_gate_threshold_bands catalog. */
  dailyLossLimitBps?: number;
}
