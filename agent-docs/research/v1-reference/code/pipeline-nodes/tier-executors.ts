// Tier executors — scoped deterministic lever application per latency tier.
//
// Each executor chooses in-range settings from the seeded band families, applies
// them to the SAME decision tree via applyRefinement (fail-closed scope enforcement),
// and returns tier-specific artifacts (geometry, order-shape params).

import type { AppliedLeverSet, LeverScope, TreeLeverState } from "@hftr/contracts";
import type { GeneratedLead } from "../strategic";
import type { TreeGeometry } from "../tactical";
import type { ExecLevers } from "../compile";
import { chooseLeverSettings } from "./levers";
import { applyRefinement, execNumber, flattenSettings, type RefinementOutcome } from "./tree-refine";

export interface TierLink {
  treeId: string;
  runNodeId: string | null;
  at?: string;
}

export interface StrategicTierResult {
  applied: AppliedLeverSet;
  refinement: RefinementOutcome;
  geometry: null;
  execLevers: null;
}

export interface TacticalTierResult {
  applied: AppliedLeverSet;
  refinement: RefinementOutcome;
  geometry: TreeGeometry;
  execLevers: null;
}

export interface ExecutionTierResult {
  applied: AppliedLeverSet;
  refinement: RefinementOutcome;
  geometry: TreeGeometry;
  execLevers: ExecLevers;
}

const GEOMETRY_FALLBACK = {
  atrStopMultiplier: 2.25,
  scaleOutFractionPct: 33,
  trailMultiplier: 2.5,
  timeStopMin: 60,
  reentryCount: 1,
  entryTolerancePct: 0.004,
  stopTolerancePct: 0.018,
} satisfies TreeGeometry;

/** Strategic tier: cross-symbol / portfolio levers only. */
export function executeStrategicTier(
  current: TreeLeverState,
  currentVersion: number,
  seed: string,
  link: TierLink
): StrategicTierResult {
  const applied = chooseLeverSettings("strategic", seed);
  const refinement = applyRefinement(current, currentVersion, applied, link);
  return { applied, refinement, geometry: null, execLevers: null };
}

/** Tactical tier: decision-tree shape levers + derived geometry. */
export function executeTacticalTier(
  current: TreeLeverState,
  currentVersion: number,
  seed: string,
  link: TierLink,
  _lead?: GeneratedLead
): TacticalTierResult {
  const applied = chooseLeverSettings("tactical", seed);
  const refinement = applyRefinement(current, currentVersion, applied, link);
  const geometry = geometryFromState(refinement.leverState);
  return { applied, refinement, geometry, execLevers: null };
}

/** Execution tier: order-shape levers + derived compile params. */
export function executeExecutionTier(
  current: TreeLeverState,
  currentVersion: number,
  seed: string,
  link: TierLink
): ExecutionTierResult {
  const applied = chooseLeverSettings("execution", seed);
  const refinement = applyRefinement(current, currentVersion, applied, link);
  const geometry = geometryFromState(refinement.leverState);
  const execLevers: ExecLevers = {
    orderQtyPct: execNumber(refinement.leverState, "order_qty_pct", 1),
    limitOffsetBps: execNumber(refinement.leverState, "limit_offset_bps", 0),
    tif: execTif(refinement.leverState),
  };
  return { applied, refinement, geometry, execLevers };
}

/** Re-tune one tier on an existing tree (cadence loops). */
export function executeTierRefresh(
  scope: LeverScope,
  current: TreeLeverState,
  currentVersion: number,
  seed: string,
  link: TierLink
): StrategicTierResult | TacticalTierResult | ExecutionTierResult {
  switch (scope) {
    case "strategic":
      return executeStrategicTier(current, currentVersion, seed, link);
    case "tactical":
      return executeTacticalTier(current, currentVersion, seed, link);
    case "execution":
      return executeExecutionTier(current, currentVersion, seed, link);
  }
}

/** Apply an externally supplied in-scope lever batch (control API path). */
export function executeLeverBatch(
  current: TreeLeverState,
  currentVersion: number,
  applied: AppliedLeverSet,
  link: TierLink
): RefinementOutcome {
  return applyRefinement(current, currentVersion, applied, link);
}

export function geometryFromApplied(applied: AppliedLeverSet): TreeGeometry {
  return geometryFromRecord(flattenSettings(applied.settings));
}

export function geometryFromState(state: TreeLeverState): TreeGeometry {
  return geometryFromRecord(state.tactical);
}

function geometryFromRecord(r: Record<string, number | string>): TreeGeometry {
  const num = (k: string, fb: number): number => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fb;
  };
  return {
    atrStopMultiplier: num("atr_stop_multiplier", GEOMETRY_FALLBACK.atrStopMultiplier),
    scaleOutFractionPct: num("scale_out_fraction_pct", GEOMETRY_FALLBACK.scaleOutFractionPct),
    trailMultiplier: num("trail_multiplier", GEOMETRY_FALLBACK.trailMultiplier),
    timeStopMin: num("time_stop_min", GEOMETRY_FALLBACK.timeStopMin),
    reentryCount: num("reentry_count", GEOMETRY_FALLBACK.reentryCount),
    entryTolerancePct: num("entry_tolerance_pct", GEOMETRY_FALLBACK.entryTolerancePct),
    stopTolerancePct: num("stop_tolerance_pct", GEOMETRY_FALLBACK.stopTolerancePct),
  };
}

function execTif(state: TreeLeverState): ExecLevers["tif"] {
  const v = state.execution["tif"];
  return v === "gtc" || v === "ioc" ? v : "day";
}
