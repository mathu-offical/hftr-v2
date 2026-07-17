// Time-scoped analysis loops (decision 4): each latency tier re-tunes its
// in-scope levers on the SAME persistent decision tree at its own cadence.
//   tactical  (~30m): re-tunes tree-shape levers
//   execution (~5m) : re-tunes order-shape param levers
// Lower tiers re-tune more frequently; every re-tune is a lineage-bearing
// refinement (version++) on the existing tree, never a replacement. No model /
// provider calls; the deterministic dispatch boundary is untouched.

import { sql } from "@vercel/postgres";
import type { LeverScope, TreeLeverState } from "@hftr/contracts";
import type { RunRow } from "../orchestrator";
import { refreshTreeTier } from "./control";

export interface RetuneResult {
  scope: LeverScope;
  retuned: number;
  /** loop_refine node jobs enqueued after tactical/execution re-tune (re-compile path). */
  enqueued: number;
}

/** Deterministic seed for one tier re-tune pass (exported for unit tests). */
export function tierRetuneSeed(treeId: string, scope: LeverScope, version: number): string {
  return `${treeId}:${scope}:${version}`;
}

/**
 * Re-tune active decision trees for one tier scope. Bounded to recently-started
 * runs so the loop cannot grow unboundedly. Deterministic: the re-tune seed is
 * derived from (treeId, scope, current version), so a given version always
 * yields the same next settings.
 */
export async function retuneActiveTrees(scope: LeverScope, limit = 200): Promise<RetuneResult> {
  const { rows } = await sql<{
    tree_id: string;
    run_id: string;
    run_node_id: string | null;
    tree_version: number;
    lever_state: TreeLeverState;
    workspace_id: string;
    broker_mode: "paper" | "live";
    deterministic_seed: string;
    control_snapshot_ref: string;
    broker_policy_ref: string;
  }>`
    SELECT dt.id AS tree_id, dt.run_id, dt.run_node_id, dt.tree_version, dt.lever_state,
           r.workspace_id, r.broker_mode, r.deterministic_seed, r.control_snapshot_ref, r.broker_policy_ref
    FROM decision_trees dt
    JOIN orchestration_runs r ON r.id = dt.run_id
    WHERE dt.status = 'active'
      AND r.broker_mode = 'paper'
      AND r.started_at > now() - interval '24 hours'
    ORDER BY dt.expanded_at DESC
    LIMIT ${limit}
  `;

  let retuned = 0;
  let enqueued = 0;
  for (const row of rows) {
    const run: RunRow = {
      id: row.run_id,
      workspace_id: row.workspace_id,
      broker_mode: row.broker_mode,
      deterministic_seed: row.deterministic_seed,
      control_snapshot_ref: row.control_snapshot_ref,
      broker_policy_ref: row.broker_policy_ref,
      enabled_sectors: [],
    };
    const refreshed = await refreshTreeTier(run, row.tree_id, scope, row.run_node_id);
    retuned += 1;
    if (refreshed.enqueued) enqueued += 1;
  }

  return { scope, retuned, enqueued };
}
