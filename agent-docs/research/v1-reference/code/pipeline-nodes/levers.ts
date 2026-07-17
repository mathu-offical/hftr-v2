// Concrete lever registry + deterministic scope enforcement.
//
// Each reasoning layer sets only the levers within its authority (decision 3):
//   strategic  -> cross-symbol / portfolio structure and direction
//   tactical   -> decision-tree shape for a symbol/lead
//   execution  -> order-shape parameters for one instruction
//
// enforceScope() is deterministic and fail-closed: any setting whose key is
// unknown, out of the layer's scope, or out of its bounded range is rejected and
// never applied to the tree. chooseLeverSettings() is the deterministic
// (seeded) stand-in for the LLM lever selection; it always picks in-range values
// and is swappable for a real model later behind the same contract.

import type {
  AppliedLeverSet,
  LeverDef,
  LeverScope,
  LeverSetting,
  ScopeEnforcementResult,
} from "@hftr/contracts";
import { seededRng } from "../rng";
import { EXECUTION_BANDS, STRATEGIC_BANDS, TACTICAL_BANDS, pickInBand, type Band } from "./bands";

// Build a number lever def grounded to a seeded band (min/typical/max).
function numLever(
  key: string,
  scope: LeverScope,
  b: Band,
  bandRef: string,
  description: string
): LeverDef {
  return { key, scope, kind: "number", min: b.min, max: b.max, typical: b.typical, bandRef, description };
}

// ── Registry: every numeric lever is grounded to a seeded bounded-range band
//    (see nodes/bands.ts, consumed from the research catalogs). Scopes mirror
//    tierLeverModel from seeded-strategy-catalog.json. ────────────────────────
export const LEVER_REGISTRY: readonly LeverDef[] = [
  // Strategic: cross-symbol / portfolio structure and high-level direction.
  { key: "direction_bias", scope: "strategic", kind: "enum", options: ["long", "short", "neutral"], description: "Portfolio-level directional bias for the trend." },
  numLever("risk_per_trade_pct", "strategic", STRATEGIC_BANDS.risk_per_trade_pct, "risk_per_trade_pct_band", "Per-trade risk as pct of equity."),
  numLever("portfolio_heat_pct", "strategic", STRATEGIC_BANDS.portfolio_heat_pct, "portfolio_heat_pct_band", "Total open risk as pct of equity."),
  numLever("portfolio_vol_target_pct", "strategic", STRATEGIC_BANDS.portfolio_vol_target_pct, "portfolio_vol_target_band", "Annualized portfolio volatility target."),
  numLever("sector_concentration_pct", "strategic", STRATEGIC_BANDS.sector_concentration_pct, "sector_concentration_pct_band", "Max sector exposure as pct of gross."),
  numLever("max_concurrent_names", "strategic", STRATEGIC_BANDS.max_concurrent_names, "max_concurrent_names_band", "Cross-symbol breadth: max concurrent names."),
  numLever("correlation_health_floor", "strategic", STRATEGIC_BANDS.correlation_health_floor, "correlation_health_band", "Rolling correlation floor for sympathy/pairs."),

  // Tactical: decision-tree shape for one symbol/lead.
  numLever("atr_stop_multiplier", "tactical", TACTICAL_BANDS.atr_stop_multiplier, "atr_stop_multiplier_band", "Hard-stop distance in ATR multiples."),
  numLever("scale_out_fraction_pct", "tactical", TACTICAL_BANDS.scale_out_fraction_pct, "scale_out_fraction_band", "Fraction taken per scaled-exit tranche."),
  numLever("trail_multiplier", "tactical", TACTICAL_BANDS.trail_multiplier, "trail_multiplier_band", "Chandelier trail distance in ATR multiples."),
  numLever("time_stop_min", "tactical", TACTICAL_BANDS.time_stop_min, "time_stop_band", "Time-based exit horizon in minutes."),
  numLever("reentry_count", "tactical", TACTICAL_BANDS.reentry_count, "reentry_band", "Max controlled re-entries after invalidation."),
  numLever("pyramid_levels", "tactical", TACTICAL_BANDS.pyramid_levels, "pyramiding_band", "Max pyramiding add levels (tier-A default 1)."),
  numLever("entry_tolerance_pct", "tactical", TACTICAL_BANDS.entry_tolerance_pct, "entry_confirmation_band", "Entry confirmation tolerance band."),
  numLever("stop_tolerance_pct", "tactical", TACTICAL_BANDS.stop_tolerance_pct, "atr_stop_multiplier_band", "Structure-invalidation stop tolerance."),
  { key: "allowed_order_class", scope: "tactical", kind: "enum", options: ["market", "limit", "stop_limit", "bracket"], bandRef: "branch_order_class_set", description: "Order class the tree shape permits (execution may only narrow)." },

  // Execution: order-shape parameters for one instruction (no restructure).
  numLever("order_qty_pct", "execution", EXECUTION_BANDS.order_qty_pct, "child_slice_band", "Fraction of the max position size to order."),
  numLever("participation_rate_pct", "execution", EXECUTION_BANDS.participation_rate_pct, "participation_rate_band", "Target participation as pct of volume."),
  numLever("limit_offset_bps", "execution", EXECUTION_BANDS.limit_offset_bps, "limit_offset_bps_band", "Aggressive limit offset in basis points."),
  numLever("max_slippage_bps", "execution", EXECUTION_BANDS.max_slippage_bps, "max_slippage_bps_band", "Max tolerated slippage in basis points."),
  numLever("fill_timeout_ms", "execution", EXECUTION_BANDS.fill_timeout_ms, "fill_timeout_ms_band", "Fill timeout before verify-and-confirm."),
  numLever("cancel_replace_attempts", "execution", EXECUTION_BANDS.cancel_replace_attempts, "cancel_replace_band", "Max cancel/replace attempts on stale fills."),
  { key: "tif", scope: "execution", kind: "enum", options: ["day", "gtc", "ioc"], bandRef: "tif_set", description: "Time-in-force for the order." },
];

const BY_KEY = new Map<string, LeverDef>(LEVER_REGISTRY.map((d) => [d.key, d]));

export function leverDef(key: string): LeverDef | undefined {
  return BY_KEY.get(key);
}

export function leversForScope(scope: LeverScope): LeverDef[] {
  return LEVER_REGISTRY.filter((d) => d.scope === scope);
}

// ── Deterministic, fail-closed scope enforcement ────────────
/**
 * Validate a layer's requested lever settings against its scope authority and
 * the registry's bounded ranges. Out-of-scope, unknown, or out-of-range settings
 * are rejected (never silently clamped) so a layer can never exceed its decision
 * authority or the immutable bounds.
 */
export function enforceScope(applied: AppliedLeverSet): ScopeEnforcementResult {
  const accepted: LeverSetting[] = [];
  const rejected: ScopeEnforcementResult["rejected"] = [];

  for (const setting of applied.settings) {
    const def = BY_KEY.get(setting.key);
    if (!def) {
      rejected.push({ key: setting.key, reason: "unknown_lever" });
      continue;
    }
    if (def.scope !== applied.layer) {
      rejected.push({ key: setting.key, reason: "out_of_scope" });
      continue;
    }
    if (def.kind === "number") {
      const v = typeof setting.value === "number" ? setting.value : Number(setting.value);
      if (!Number.isFinite(v)) {
        rejected.push({ key: setting.key, reason: "invalid_value" });
        continue;
      }
      if ((def.min != null && v < def.min) || (def.max != null && v > def.max)) {
        rejected.push({ key: setting.key, reason: "out_of_range" });
        continue;
      }
      accepted.push({ key: setting.key, value: v });
    } else {
      const v = String(setting.value);
      if (!def.options || !def.options.includes(v)) {
        rejected.push({ key: setting.key, reason: "invalid_value" });
        continue;
      }
      accepted.push({ key: setting.key, value: v });
    }
  }

  return { ok: rejected.length === 0, accepted, rejected };
}

// Convenience: enforce and THROW on any rejection (used where a layer must never
// emit out-of-scope levers; surfaces as fail-closed at the node boundary).
export function enforceScopeStrict(applied: AppliedLeverSet): LeverSetting[] {
  const result = enforceScope(applied);
  if (!result.ok) {
    const detail = result.rejected.map((r) => `${r.key}:${r.reason}`).join(",");
    throw new Error(`lever scope violation (${applied.layer}): ${detail}`);
  }
  return result.accepted;
}

// ── Deterministic (seeded) lever chooser — LLM stand-in ─────
/**
 * Deterministically choose in-range settings for every lever in `scope`. Seeded
 * by the node's deterministic seed so replay reproduces identical settings. This
 * is the swappable substitute for model-driven lever selection; a real model
 * would return the same `AppliedLeverSet` shape and still pass enforceScope.
 */
export function chooseLeverSettings(scope: LeverScope, seed: string): AppliedLeverSet {
  const rng = seededRng(`levers:${scope}:${seed}`);
  const settings: LeverSetting[] = leversForScope(scope).map((def) => {
    if (def.kind === "enum") {
      const opts = def.options ?? [];
      const idx = Math.floor(rng() * opts.length);
      return { key: def.key, value: opts[idx] ?? opts[0] ?? "" };
    }
    const min = def.min ?? 0;
    const max = def.max ?? 1;
    const typical = def.typical ?? (min + max) / 2;
    // Bias toward the seeded `typical` while staying inside [min,max].
    const value = pickInBand({ min, typical, max }, rng());
    return { key: def.key, value };
  });
  return { layer: scope, settings };
}
