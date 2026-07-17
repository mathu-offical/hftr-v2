// Grounded bounded-range bands consumed from the research seed catalogs.
//
// Source of truth (DO NOT rewrite the catalogs; this module only CONSUMES their
// values):
//   agent-docs/research/seeded-strategy-catalog.json
//     -> runtimeControlSurface.boundedRangeFamilyDefinitions, tierLeverModel,
//        decisionTreeBranchTaxonomy, recoveryLadderTemplates
//   agent-docs/research/trend-lead-pattern-library.json
//     -> runtimeControlSurface.boundedRangeFamilyDefinitions, regimeRouterThresholds
//   agent-docs/research/tier-lever-and-bounded-range-reference.md (citations)
//
// Every numeric lever range is grounded to a min/typical/max band here so the
// LLM stand-in always tunes inside the seeded envelope, and tests can assert the
// chosen value sits within [min, max]. Bands are mutable inside immutable caps;
// guardrails/legality/verification schemas are NOT represented here.
// Literature keys: seeded-strategy-catalog.json#/deterministicToolCatalog/literatureRegistry
// (e.g. krauss_2017_pairs_review, avellaneda_lee_2010_stat_arb, mandelbrot_wallis_1969_hurst).
// Seeded bands are research starting points, not live-trading approvals.

import { readFileSync } from "node:fs";
import { agentDocsResearchPath } from "@/lib/research/catalog-paths";

export interface Band {
  min: number;
  typical: number;
  max: number;
}

function band(min: number, typical: number, max: number): Band {
  return { min, typical, max };
}

// ── Strategic bands (cross-symbol / portfolio structure) ─────
export const STRATEGIC_BANDS = {
  risk_per_trade_pct: band(0.25, 0.75, 2.0),
  portfolio_heat_pct: band(1.5, 4.0, 8.0),
  portfolio_vol_target_pct: band(8, 14, 20),
  sector_concentration_pct: band(15, 30, 45),
  max_concurrent_names: band(5, 15, 40),
  correlation_health_floor: band(0.45, 0.6, 0.75),
  vol_shock_regime_multiplier: band(1.25, 1.75, 3.0),
  pairs_spread_zscore: band(1.5, 2.0, 3.0),
  momentum_lookback_bars: band(5, 20, 120),
} as const;

// ── Tactical bands (decision-tree shape) ─────────────────────
export const TACTICAL_BANDS = {
  atr_stop_multiplier: band(1.5, 2.25, 3.0),
  scale_out_fraction_pct: band(25, 33, 50),
  trail_multiplier: band(1.5, 2.5, 4.0),
  // time_stop_band: max is "session_close" ~= 390 regular-session minutes.
  time_stop_min: band(10, 60, 390),
  reentry_count: band(0, 1, 3),
  pyramid_levels: band(1, 2, 3),
  // tactical confirmation tolerances (entry/structure) inside seeded envelope.
  entry_tolerance_pct: band(0.001, 0.004, 0.008),
  stop_tolerance_pct: band(0.005, 0.018, 0.03),
} as const;

// ── Execution bands (order-shape parameters) ─────────────────
export const EXECUTION_BANDS = {
  order_qty_pct: band(0.1, 0.6, 1.0),
  participation_rate_pct: band(3, 8, 20),
  limit_offset_bps: band(0, 2, 8),
  max_slippage_bps: band(5, 12, 25),
  fill_timeout_ms: band(2000, 8000, 30000),
  cancel_replace_attempts: band(1, 3, 5),
  iceberg_peak_ratio_pct: band(5, 10, 20),
  adverse_selection_bps: band(2, 8, 25),
  is_urgency_scalar: band(0.2, 1.0, 3.0),
  recovery_backoff_ms: band(500, 2500, 15000),
} as const;

// ── Pattern-library lag/confirmation bands ───────────────────
export const PATTERN_BANDS = {
  leader_lag_window_ms: band(2000, 15000, 120000),
  confirmation_depth: band(1, 2, 3),
  followthrough_decay_min: band(5, 30, 120),
  reentry_delay_min: band(1, 10, 60),
} as const;

// ── Regime router thresholds (nomination bias only) ──────────
// Loaded from trend-lead-pattern-library.json at runtime; defaults match seeded catalog.

export interface RegimeRouterThresholds {
  hurstTrend: number;
  hurstRevert: number;
  adxTrend: number;
  adxRange: number;
  correlationHealthTypical: number;
}

export const REGIME_ROUTER_THRESHOLDS: RegimeRouterThresholds = {
  hurstTrend: 0.55,
  hurstRevert: 0.45,
  adxTrend: 25,
  adxRange: 20,
  correlationHealthTypical: 0.6,
};

let cachedRegimeThresholds: RegimeRouterThresholds | null = null;

/** Thresholds from trend-lead-pattern-library.json#regimeRouterThresholds. */
export function loadRegimeRouterThresholds(): RegimeRouterThresholds {
  if (cachedRegimeThresholds) return cachedRegimeThresholds;
  try {
    const raw = readFileSync(agentDocsResearchPath("trend-lead-pattern-library.json"), "utf8");
    const json = JSON.parse(raw) as {
      runtimeControlSurface?: {
        regimeRouterThresholds?: {
          hurst_trend?: number;
          hurst_revert?: number;
          adx_trend?: number;
          adx_range?: number;
          correlation_health_floor?: { typical?: number };
        };
      };
    };
    const t = json.runtimeControlSurface?.regimeRouterThresholds;
    if (t) {
      cachedRegimeThresholds = {
        hurstTrend: t.hurst_trend ?? REGIME_ROUTER_THRESHOLDS.hurstTrend,
        hurstRevert: t.hurst_revert ?? REGIME_ROUTER_THRESHOLDS.hurstRevert,
        adxTrend: t.adx_trend ?? REGIME_ROUTER_THRESHOLDS.adxTrend,
        adxRange: t.adx_range ?? REGIME_ROUTER_THRESHOLDS.adxRange,
        correlationHealthTypical:
          t.correlation_health_floor?.typical ?? REGIME_ROUTER_THRESHOLDS.correlationHealthTypical,
      };
      return cachedRegimeThresholds;
    }
  } catch {
    // Fall back to inlined defaults when agent-docs is unavailable (e.g. deployed bundle).
  }
  cachedRegimeThresholds = { ...REGIME_ROUTER_THRESHOLDS };
  return cachedRegimeThresholds;
}

export function resetRegimeThresholdsCache(): void {
  cachedRegimeThresholds = null;
}

// ── Structured ladders / sets (consumed verbatim) ────────────
export const RR_TARGET_LADDER = {
  tp1R: 1.0,
  tp1ScalePct: 50,
  tp2R: 2.0,
  tp2ScalePct: 25,
  tp3R: 3.0,
  breakevenOnTp1: true,
} as const;

export const ORDER_TYPE_SET = ["market", "limit", "stop", "stop_limit", "trailing_stop"] as const;
export const TIF_SET = ["DAY", "GTC", "IOC", "FOK", "OPG", "CLS"] as const;

// recoveryLadderTemplates ids -> default phase ladders (consumed for tree
// recovery-ladder refs + escalation step shapes).
export const RECOVERY_LADDER_TEMPLATES: Record<string, { phases: string[]; appliesTo: string[] }> = {
  "rec-001": {
    phases: ["observe", "constrain", "reprice", "cancel_replace", "escalate_or_abort"],
    appliesTo: ["all_execution_sensitive_families"],
  },
  "rec-002": {
    phases: ["failed_break_detected", "retest_attempt", "reclaim_or_fade", "session_lockout_if_repeated"],
    appliesTo: ["opening_range_breakout", "gap_and_go", "volatility_compression_breakout"],
  },
  "rec-003": {
    phases: ["entry", "scale_out_to_value", "trend_strength_recheck", "trend_day_abort"],
    appliesTo: ["vwap_reversion", "liquidity_sweep_reversal"],
  },
  "rec-004": {
    phases: ["event_confirm", "drift_window", "secondary_disclosure_recheck", "off_hours_handoff_or_exit"],
    appliesTo: ["earnings_guidance_drift", "extended_overnight_session_response"],
  },
  "rec-005": {
    phases: ["leader_confirm", "sympathy_entry", "correlation_recheck", "leader_failure_abort"],
    appliesTo: ["lead_lag_propagation", "pullback_continuation"],
  },
  "rec-006": {
    phases: [
      "schedule_deviation_detected",
      "reprice_toward_ac_trajectory",
      "participation_throttle",
      "cancel_replace_ladder",
      "escalate_or_abort",
    ],
    appliesTo: ["all_execution_sensitive_families"],
  },
};

/** Pick the recovery-ladder template id grounded to a strategy family. */
export function recoveryTemplateForFamily(family: string): string {
  for (const [id, tpl] of Object.entries(RECOVERY_LADDER_TEMPLATES)) {
    if (tpl.appliesTo.includes(family)) return id;
  }
  return "rec-001";
}

export function clampToBand(b: Band, value: number): number {
  if (!Number.isFinite(value)) return b.typical;
  return Math.min(b.max, Math.max(b.min, value));
}

/**
 * Deterministically pick a value inside a band, biased toward `typical`. A unit
 * random `u` in [0,1) maps onto [min,max] via a triangular-ish split around the
 * typical point, so seeded selections cluster near the seeded typical while
 * still covering the full envelope. Always returns a value in [min,max].
 */
export function pickInBand(b: Band, u: number, dp = 4): number {
  const t = clamp01(u);
  const lowSpan = b.typical - b.min;
  const highSpan = b.max - b.typical;
  const value = t < 0.5 ? b.min + (t / 0.5) * lowSpan : b.typical + ((t - 0.5) / 0.5) * highSpan;
  return roundTo(Math.min(b.max, Math.max(b.min, value)), dp);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(0.999999, n));
}
function roundTo(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
