// Bounded control mutations — tier refresh, lever batch, refine-node spawn.

import { sql } from "@vercel/postgres";
import type { AppliedLeverSet, LeverScope, TreeLeverState } from "@hftr/contracts";
import type { RunRow } from "../orchestrator";
import { executeLeverBatch, executeTierRefresh } from "./tier-executors";
import { syncExecutableStateAfterTierRetune } from "./executable-state";
import { loadTreeLeverState, persistTreeRefinement, loadNode, insertChildNodes } from "./store";
import { enqueueNodeJob } from "../queue";
import { deriveNodeSeed } from "./seed";
import { assignForkSeeds, type ChildNodeSpec } from "./plan";
import { DEFAULT_PATTERN } from "./patterns";

export interface RefreshTreeTierOptions {
  /** Enqueue loop_refine → compile after tactical/execution re-tune (cron default). */
  spawnRefine?: boolean;
}

export async function refreshTreeTier(
  run: RunRow,
  treeId: string,
  scope: LeverScope,
  runNodeId: string | null,
  options: RefreshTreeTierOptions = {}
): Promise<{
  treeVersion: number;
  accepted: { key: string; value: number | string }[];
  rejected: { key: string; reason: string }[];
  enqueued: boolean;
}> {
  const state = (await loadTreeLeverState(treeId)) ?? { leverState: { strategic: {}, tactical: {}, execution: {} }, version: 1 };
  const seed = `${treeId}:${scope}:${state.version}`;
  const result = executeTierRefresh(scope, state.leverState, state.version, seed, { treeId, runNodeId });
  await persistTreeRefinement(run, {
    treeId,
    leverState: result.refinement.leverState,
    refinement: result.refinement.refinement,
    rejected: result.refinement.rejected.map((x) => x.key),
  });
  await syncExecutableStateAfterTierRetune(run, treeId, scope, result.refinement.version);

  let enqueued = false;
  const shouldSpawn = options.spawnRefine ?? (scope === "tactical" || scope === "execution");
  if (shouldSpawn) {
    try {
      const job = await spawnRefineNode(run, treeId, "loop_refine");
      enqueued = job.enqueued;
    } catch {
      // Trees without an anchor run_node cannot spawn refine children yet.
    }
  }

  return {
    treeVersion: result.refinement.version,
    accepted: result.refinement.refinement.settings,
    rejected: result.refinement.rejected,
    enqueued,
  };
}

export async function applyLeverBatchControl(
  run: RunRow,
  treeId: string,
  applied: AppliedLeverSet,
  runNodeId: string | null
): Promise<{ treeVersion: number; accepted: { key: string; value: number | string }[]; rejected: { key: string; reason: string }[] }> {
  const state = (await loadTreeLeverState(treeId)) ?? { leverState: { strategic: {}, tactical: {}, execution: {} }, version: 1 };
  const refined = executeLeverBatch(state.leverState, state.version, applied, { treeId, runNodeId });
  await persistTreeRefinement(run, {
    treeId,
    leverState: refined.leverState,
    refinement: refined.refinement,
    rejected: refined.rejected.map((x) => x.key),
  });
  return {
    treeVersion: refined.version,
    accepted: refined.refinement.settings,
    rejected: refined.rejected,
  };
}

export async function spawnRefineNode(
  run: RunRow,
  treeId: string,
  spawnReason: "loop_refine" | "verification_retry" | "manual_refine" = "manual_refine"
): Promise<{ nodeId: string; enqueued: boolean }> {
  const { rows: treeRows } = await sql<{
    run_node_id: string | null;
    lead_package_id: string;
    routing_pattern_ref: string;
  }>`
    SELECT dt.run_node_id, dt.lead_package_id, rn.routing_pattern_ref
    FROM decision_trees dt
    LEFT JOIN run_nodes rn ON rn.id = dt.run_node_id
    WHERE dt.id = ${treeId} AND dt.run_id = ${run.id}
    LIMIT 1
  `;
  const tree = treeRows[0];
  if (!tree?.run_node_id) {
    throw new Error("tree has no anchor run_node");
  }

  const parent = await loadNode(tree.run_node_id);
  if (!parent) throw new Error("anchor run_node not found");

  const { rows: leadRows } = await sql<{ handoff_envelope: { generatedLead?: unknown } }>`
    SELECT handoff_envelope FROM lead_packages WHERE id = ${tree.lead_package_id} LIMIT 1
  `;
  const generatedLead = leadRows[0]?.handoff_envelope?.generatedLead ?? null;

  const spec: ChildNodeSpec = {
    nodeKind: "loop_refine",
    subjectRef: `refine:${treeId}`,
    spawnReason,
    patternStepId: "step-loop_refine",
    payload: {
      treeId,
      leadId: tree.lead_package_id,
      generatedLead,
    },
  };

  const patternId = parent.routing_pattern_ref ?? DEFAULT_PATTERN.id;
  const planned = assignForkSeeds(
    { id: parent.id, depth: parent.depth, attempt: parent.attempt + 1 },
    [spec],
    run.deterministic_seed
  );
  const created = await insertChildNodes(parent, planned, patternId);
  const child = created[0];
  if (!child) {
    // Idempotent replay — find existing child
    const { rows: existing } = await sql<{ id: string }>`
      SELECT id FROM run_nodes
      WHERE run_id = ${run.id}
        AND parent_node_id = ${parent.id}
        AND pattern_step_id = 'step-loop_refine'
        AND spawn_reason = ${spawnReason}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const nodeId = existing[0]?.id;
    if (!nodeId) throw new Error("failed to spawn refine node");
    const enq = await enqueueNodeJob({ runId: run.id, workspaceId: run.workspace_id, runNodeId: nodeId, nodeKind: "loop_refine" });
    return { nodeId, enqueued: enq.enqueued };
  }

  const enq = await enqueueNodeJob({
    runId: run.id,
    workspaceId: run.workspace_id,
    runNodeId: child.id,
    nodeKind: "loop_refine",
  });
  return { nodeId: child.id, enqueued: enq.enqueued };
}

export function runRowFromTree(tree: {
  run_id: string;
  workspace_id: string;
  broker_mode: string;
  deterministic_seed: string;
  control_snapshot_ref: string;
  broker_policy_ref: string;
}): RunRow {
  return {
    id: tree.run_id,
    workspace_id: tree.workspace_id,
    broker_mode: tree.broker_mode as RunRow["broker_mode"],
    deterministic_seed: tree.deterministic_seed,
    control_snapshot_ref: tree.control_snapshot_ref,
    broker_policy_ref: tree.broker_policy_ref,
    enabled_sectors: [],
  };
}

export function emptyTreeLeverState(): TreeLeverState {
  return { strategic: {}, tactical: {}, execution: {} };
}
