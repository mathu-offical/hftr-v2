// ============================================================
// Decision-tree levers — the decision tree is the CENTRAL, progressively-refined
// artifact. Each reasoning layer's "tools" are deterministic LEVERS (switches /
// settings) on the tree: configs, sizes, prices, TIF, stop/limit/trailing,
// timeouts, invalidations, recovery-ladder params, weights, bounded ranges.
//
// The LLM (deterministic seeded substitute today) chooses lever SETTINGS within
// bounded ranges; the levers and their application are deterministic and
// reproducible. Each layer has SCOPED authority and may only set in-scope levers
// (fail-closed if it tries to exceed scope). Refinements accumulate on the SAME
// tree with lineage; they never replace it.
// ============================================================

// Layer scope (latency tier). Higher = longer latency, broader authority.
//   strategic : cross-symbol / portfolio structure; which trends/leads/trees exist.
//   tactical  : decision-tree SHAPE for a symbol/lead (branches, recovery, classes).
//   execution : order-shape PARAMETERS for one instruction (no restructure / no cross-symbol).
export type LeverScope = "strategic" | "tactical" | "execution";

export type LeverKind = "number" | "enum";

export interface LeverDef {
  key: string;
  scope: LeverScope;
  kind: LeverKind;
  /** Inclusive bounded range for number levers. */
  min?: number;
  max?: number;
  /** Seeded "typical" point inside [min,max] the chooser biases toward. */
  typical?: number;
  /** Allowed values for enum levers. */
  options?: string[];
  /** Grounding reference to the seeded bounded-range family (for lineage). */
  bandRef?: string;
  description: string;
}

export interface LeverSetting {
  key: string;
  value: number | string;
}

// A scoped set of lever settings a layer wants to apply to the tree.
export interface AppliedLeverSet {
  layer: LeverScope;
  settings: LeverSetting[];
}

export interface RejectedLever {
  key: string;
  reason: "out_of_scope" | "unknown_lever" | "out_of_range" | "invalid_value";
}

// Deterministic scope-enforcement result. Out-of-scope or out-of-range settings
// are rejected fail-closed; only accepted settings are applied to the tree.
export interface ScopeEnforcementResult {
  ok: boolean;
  accepted: LeverSetting[];
  rejected: RejectedLever[];
}

// Lineage-bearing refinement record: one layer touch / loop re-tune on a tree.
export interface TreeRefinement {
  treeId: string;
  runNodeId: string | null;
  layer: LeverScope;
  version: number;
  settings: LeverSetting[];
  at: string;
}

// Accumulated lever state on the decision tree, grouped by layer scope.
export interface TreeLeverState {
  strategic: Record<string, number | string>;
  tactical: Record<string, number | string>;
  execution: Record<string, number | string>;
}
