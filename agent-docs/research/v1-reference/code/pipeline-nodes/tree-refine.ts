// Pure progressive-refinement of the central decision tree.
//
// Each layer (and each verification loop re-tune) applies its scoped, enforced
// lever settings to the SAME tree: the accumulated lever_state grows by scope,
// tree_version increments, and a lineage-bearing TreeRefinement record is
// produced. This never replaces the tree — it enriches it.

import type {
  AppliedLeverSet,
  LeverSetting,
  TreeLeverState,
  TreeRefinement,
} from "@hftr/contracts";
import { enforceScope } from "./levers";

export function emptyLeverState(): TreeLeverState {
  return { strategic: {}, tactical: {}, execution: {} };
}

export interface RefinementOutcome {
  leverState: TreeLeverState;
  version: number;
  refinement: TreeRefinement;
  rejected: { key: string; reason: string }[];
}

/**
 * Apply a layer's lever set to the current tree state. Settings are enforced
 * (out-of-scope / out-of-range rejected fail-closed); only accepted settings
 * merge into the layer's slice of lever_state. Returns the next state, the
 * incremented version, and the lineage refinement record.
 */
export function applyRefinement(
  current: TreeLeverState,
  currentVersion: number,
  applied: AppliedLeverSet,
  link: { treeId: string; runNodeId: string | null; at?: string }
): RefinementOutcome {
  const enforcement = enforceScope(applied);
  const accepted = enforcement.accepted;

  const next: TreeLeverState = {
    strategic: { ...current.strategic },
    tactical: { ...current.tactical },
    execution: { ...current.execution },
  };
  for (const s of accepted) {
    next[applied.layer][s.key] = s.value;
  }

  const version = currentVersion + 1;
  const refinement: TreeRefinement = {
    treeId: link.treeId,
    runNodeId: link.runNodeId,
    layer: applied.layer,
    version,
    settings: accepted,
    at: link.at ?? new Date().toISOString(),
  };

  return {
    leverState: next,
    version,
    refinement,
    rejected: enforcement.rejected.map((r) => ({ key: r.key, reason: r.reason })),
  };
}

/** Read a numeric execution lever from accumulated state with a default. */
export function execNumber(state: TreeLeverState, key: string, fallback: number): number {
  const v = state.execution[key];
  return typeof v === "number" ? v : fallback;
}

export function execEnum(state: TreeLeverState, key: string, fallback: string): string {
  const v = state.execution[key];
  return typeof v === "string" ? v : fallback;
}

export function flattenSettings(settings: LeverSetting[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const s of settings) out[s.key] = s.value;
  return out;
}
