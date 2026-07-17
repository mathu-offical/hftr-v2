// Persistence for the run-node tree and its spine artifacts (research_topics,
// trends) plus decision-tree refinement lineage. Idempotent / replay-safe:
// children collapse on the (run, parent, pattern_step, fork_index) unique index
// so a re-claimed parent never emits duplicate children.

import { sql } from "@vercel/postgres";
import type { LeverSetting, RoutingPattern, TreeLeverState, TreeRefinement } from "@hftr/contracts";
import type { RunRow } from "../orchestrator";
import { deriveNodeSeed } from "./seed";
import type { PlannedChild } from "./plan";
import { buildSeededPatterns, validatePattern } from "./patterns";
import type { RegimeSnapshot } from "./regime-snapshot";

export interface RunNodeRow {
  id: string;
  run_id: string;
  workspace_id: string;
  parent_node_id: string | null;
  root_node_id: string | null;
  node_kind: string;
  subject_ref: string | null;
  routing_pattern_ref: string;
  pattern_step_id: string;
  depth: number;
  fork_index: number;
  attempt: number;
  deterministic_seed: string;
  status: string;
  spawn_reason: string;
  control_snapshot_ref: string;
  payload: Record<string, unknown>;
}

function toPgArray(values: string[]): string {
  if (!values || values.length === 0) return "{}";
  return `{${values.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

// ── Routing patterns ────────────────────────────────────────
/** Upsert a routing pattern so run_nodes.routing_pattern_ref FK is satisfiable. */
export async function ensurePatternSeeded(pattern: RoutingPattern): Promise<void> {
  await sql`
    INSERT INTO routing_patterns
      (id, version, name, pattern_class, status, definition, caps, source_ref)
    VALUES
      (${pattern.id}, ${pattern.version}, ${pattern.name}, ${pattern.patternClass}, ${pattern.status},
       ${JSON.stringify(pattern)}::jsonb, ${JSON.stringify(pattern.caps)}::jsonb, ${pattern.sourceRef ?? null})
    ON CONFLICT (id) DO UPDATE SET
      version = EXCLUDED.version, name = EXCLUDED.name, status = EXCLUDED.status,
      definition = EXCLUDED.definition, caps = EXCLUDED.caps
  `;
}

/**
 * Seed every concrete, versioned routing pattern (tail + library-derived). Each
 * pattern is validated fail-closed before upsert so an invalid shape can never
 * reach the table. Idempotent: safe to call on every run start.
 */
export async function seedRoutingPatterns(): Promise<{ seeded: number; rejected: string[] }> {
  const rejected: string[] = [];
  let seeded = 0;
  for (const pattern of buildSeededPatterns()) {
    const result = validatePattern(pattern);
    if (!result.valid) {
      rejected.push(pattern.id);
      continue;
    }
    await ensurePatternSeeded(pattern);
    seeded += 1;
  }
  return { seeded, rejected };
}

// ── Run-node tree ───────────────────────────────────────────
export async function findRootNode(runId: string): Promise<RunNodeRow | null> {
  const { rows } = await sql<RunNodeRow>`
    SELECT * FROM run_nodes WHERE run_id = ${runId} AND node_kind = 'root' LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function insertRootNode(run: RunRow, patternId: string, rootStepId: string): Promise<RunNodeRow> {
  const seed = deriveNodeSeed(run.deterministic_seed, null, 0);
  const { rows } = await sql<RunNodeRow>`
    INSERT INTO run_nodes
      (run_id, workspace_id, parent_node_id, root_node_id, node_kind, subject_ref,
       routing_pattern_ref, pattern_step_id, depth, fork_index, attempt,
       deterministic_seed, status, spawn_reason, control_snapshot_ref, payload)
    VALUES
      (${run.id}, ${run.workspace_id}, null, null, 'root', 'root',
       ${patternId}, ${rootStepId}, 0, 0, 0,
       ${seed}, 'pending', 'root', ${run.control_snapshot_ref}, '{}'::jsonb)
    RETURNING *
  `;
  const root = rows[0]!;
  await sql`UPDATE run_nodes SET root_node_id = id WHERE id = ${root.id}`;
  root.root_node_id = root.id;
  return root;
}

/**
 * Persist a parent's planned children idempotently. Returns only NEWLY inserted
 * rows (the unique child index collapses replays), so the worker enqueues a job
 * for each child exactly once.
 */
export async function insertChildNodes(
  parent: RunNodeRow,
  planned: PlannedChild[],
  patternId: string
): Promise<RunNodeRow[]> {
  const created: RunNodeRow[] = [];
  for (const child of planned) {
    const { spec } = child;
    const { rows } = await sql<RunNodeRow>`
      INSERT INTO run_nodes
        (run_id, workspace_id, parent_node_id, root_node_id, node_kind, subject_ref,
         routing_pattern_ref, pattern_step_id, depth, fork_index, attempt,
         deterministic_seed, status, spawn_reason, control_snapshot_ref, payload)
      VALUES
        (${parent.run_id}, ${parent.workspace_id}, ${parent.id}, ${parent.root_node_id},
         ${spec.nodeKind}, ${spec.subjectRef}, ${patternId}, ${spec.patternStepId},
         ${child.depth}, ${child.forkIndex}, ${child.attempt}, ${child.deterministicSeed},
         'pending', ${spec.spawnReason}, ${parent.control_snapshot_ref},
         ${JSON.stringify(spec.payload)}::jsonb)
      ON CONFLICT (run_id, parent_node_id, pattern_step_id, fork_index) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) created.push(rows[0]);
  }
  return created;
}

export async function loadNode(nodeId: string): Promise<RunNodeRow | null> {
  const { rows } = await sql<RunNodeRow>`SELECT * FROM run_nodes WHERE id = ${nodeId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function setNodeStatus(nodeId: string, status: string): Promise<void> {
  await sql`
    UPDATE run_nodes
    SET status = ${status},
        completed_at = CASE WHEN ${status} IN ('complete', 'blocked', 'failed', 'looped', 'cancelled') THEN now() ELSE completed_at END,
        updated_at = now()
    WHERE id = ${nodeId}
  `;
}

export async function countNodes(runId: string): Promise<number> {
  const { rows } = await sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM run_nodes WHERE run_id = ${runId}`;
  return rows[0]?.n ?? 0;
}

/**
 * Ad-hoc research topic node for API-created topics: links a pending
 * `research_topic` run_node so `processNode` materializes the persisted row.
 */
export async function insertAdHocResearchTopicNode(
  run: RunRow,
  patternId: string,
  payload: Record<string, unknown>
): Promise<RunNodeRow> {
  const parent = await findRootNode(run.id);
  const seed = deriveNodeSeed(run.deterministic_seed, parent?.id ?? null, 99);
  const { rows } = await sql<RunNodeRow>`
    INSERT INTO run_nodes
      (run_id, workspace_id, parent_node_id, root_node_id, node_kind, subject_ref,
       routing_pattern_ref, pattern_step_id, depth, fork_index, attempt,
       deterministic_seed, status, spawn_reason, control_snapshot_ref, payload)
    VALUES
      (${run.id}, ${run.workspace_id}, ${parent?.id ?? null}, ${parent?.root_node_id ?? null},
       'research_topic', ${String(payload.topicSlug ?? "adhoc_topic")},
       ${patternId}, 'step-research_topic', ${(parent?.depth ?? 0) + 1}, 99, 0,
       ${seed}, 'pending', 'manual_refine', ${run.control_snapshot_ref},
       ${JSON.stringify(payload)}::jsonb)
    RETURNING *
  `;
  return rows[0]!;
}

// ── Research topics (recursive spine) ───────────────────────
export async function insertResearchTopic(
  run: RunRow,
  args: {
    parentTopicId: string | null;
    runNodeId: string;
    topicSlug: string;
    topicLabel: string;
    philosophyRef: string;
    depth: number;
    sectorRefs: string[];
    evidenceRefs?: string[];
    payload?: Record<string, unknown>;
  }
): Promise<string> {
  const evidenceRefs = args.evidenceRefs ?? [];
  const payload = args.payload ?? {};
  const { rows } = await sql<{ id: string }>`
    INSERT INTO research_topics
      (workspace_id, run_id, parent_topic_id, run_node_id, topic_slug, topic_label,
       philosophy_ref, depth, sector_refs, evidence_refs, payload, status)
    VALUES
      (${run.workspace_id}, ${run.id}, ${args.parentTopicId}, ${args.runNodeId}, ${args.topicSlug},
       ${args.topicLabel}, ${args.philosophyRef}, ${args.depth}, ${toPgArray(args.sectorRefs)},
       ${toPgArray(evidenceRefs)}, ${JSON.stringify(payload)}::jsonb, 'active')
    RETURNING id
  `;
  return rows[0]!.id;
}

// ── Trends (now persisted) ──────────────────────────────────
export async function insertTrend(
  run: RunRow,
  args: {
    runNodeId: string;
    researchTopicId: string | null;
    sectorRef: string;
    trendLabel: string;
    vectorDescription: string;
    strategyFamilyAffinity: string[];
    symbolRefs?: string[];
    evidenceRefs?: string[];
    regimeTags?: string[];
    regimeSnapshot?: RegimeSnapshot | null;
  }
): Promise<string> {
  const symbolRefs = args.symbolRefs ?? [];
  const evidenceRefs = args.evidenceRefs ?? [];
  const vectorDescription =
    args.regimeTags && args.regimeTags.length > 0
      ? `${args.vectorDescription} [regimeTags=${args.regimeTags.join(",")}]`
      : args.vectorDescription;
  const regimeSnapshotJson = args.regimeSnapshot ? JSON.stringify(args.regimeSnapshot) : null;
  const { rows } = await sql<{ id: string }>`
    INSERT INTO trends
      (workspace_id, run_id, run_node_id, research_topic_id, sector_ref, trend_label,
       vector_description, strategy_family_affinity, symbol_refs, evidence_refs, regime_snapshot, status)
    VALUES
      (${run.workspace_id}, ${run.id}, ${args.runNodeId}, ${args.researchTopicId}, ${args.sectorRef},
       ${args.trendLabel}, ${vectorDescription}, ${toPgArray(args.strategyFamilyAffinity)},
       ${toPgArray(symbolRefs)}, ${toPgArray(evidenceRefs)},
       ${regimeSnapshotJson}::jsonb, 'active')
    RETURNING id
  `;
  return rows[0]!.id;
}

/** Idempotent paper-training row keyed by dispatch run_node (replay-safe). */
export async function upsertPaperTrainingFromDispatch(
  run: RunRow,
  args: {
    runNodeId: string;
    strategyFamilyRef: string;
    sectorRefs: string[];
    deterministicSeed: string;
    tradeCount: number;
    filledCount: number;
    cancelledCount: number;
    grossPnlUsd: number;
    netPnlUsd: number;
    totalSlippageBps: number;
    maxDrawdownUsd: number;
    maxDrawdownPct: number;
    status: "running" | "completed" | "failed" | "cancelled";
  }
): Promise<string> {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO paper_training_runs
      (workspace_id, orchestration_run_id, run_node_id, broker_mode, strategy_family_ref,
       sector_refs, status, trade_count, filled_count, cancelled_count,
       gross_pnl_usd, net_pnl_usd, total_slippage_bps, max_drawdown_usd, max_drawdown_pct,
       deterministic_seed, completed_at)
    VALUES
      (${run.workspace_id}, ${run.id}, ${args.runNodeId}, 'paper', ${args.strategyFamilyRef},
       ${toPgArray(args.sectorRefs)}, ${args.status}, ${args.tradeCount}, ${args.filledCount},
       ${args.cancelledCount}, ${args.grossPnlUsd}, ${args.netPnlUsd}, ${args.totalSlippageBps},
       ${args.maxDrawdownUsd}, ${args.maxDrawdownPct}, ${args.deterministicSeed},
       CASE WHEN ${args.status} IN ('completed', 'failed', 'cancelled') THEN now() ELSE NULL END)
    ON CONFLICT (run_node_id) WHERE run_node_id IS NOT NULL DO UPDATE SET
      status = EXCLUDED.status,
      trade_count = EXCLUDED.trade_count,
      filled_count = EXCLUDED.filled_count,
      cancelled_count = EXCLUDED.cancelled_count,
      gross_pnl_usd = EXCLUDED.gross_pnl_usd,
      net_pnl_usd = EXCLUDED.net_pnl_usd,
      total_slippage_bps = EXCLUDED.total_slippage_bps,
      max_drawdown_usd = EXCLUDED.max_drawdown_usd,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      completed_at = EXCLUDED.completed_at
    RETURNING id
  `;
  return rows[0]!.id;
}

// ── Decision-tree refinement lineage ────────────────────────
export interface TreeStateRow {
  leverState: TreeLeverState;
  version: number;
}

export async function loadTreeLeverState(treeId: string): Promise<TreeStateRow | null> {
  const { rows } = await sql<{ lever_state: TreeLeverState; tree_version: number }>`
    SELECT lever_state, tree_version FROM decision_trees WHERE id = ${treeId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { leverState: row.lever_state, version: row.tree_version };
}

/** Latest tree refinement timestamp (any tier) for tree-version-age gate (oq-037). */
export async function loadLastTreeRefinementAtMs(treeId: string): Promise<number | null> {
  const { rows } = await sql<{ at: string | null }>`
    SELECT max(created_at)::text AS at
    FROM tree_refinements
    WHERE decision_tree_id = ${treeId}
  `;
  const at = rows[0]?.at;
  if (!at) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

/** Latest tier refresh timestamps from tree_refinements (oq-037 staleness). */
export async function loadTierRefreshTimestampsMs(treeId: string): Promise<{
  lastTacticalRefreshAtMs: number | null;
  lastExecutionRefreshAtMs: number | null;
}> {
  const { rows } = await sql<{ layer: string; at: string }>`
    SELECT layer, max(created_at)::text AS at
    FROM tree_refinements
    WHERE decision_tree_id = ${treeId}
      AND layer IN ('tactical', 'execution')
    GROUP BY layer
  `;
  let lastTacticalRefreshAtMs: number | null = null;
  let lastExecutionRefreshAtMs: number | null = null;
  for (const row of rows) {
    const ms = Date.parse(row.at);
    if (Number.isNaN(ms)) continue;
    if (row.layer === "tactical") lastTacticalRefreshAtMs = ms;
    if (row.layer === "execution") lastExecutionRefreshAtMs = ms;
  }
  return { lastTacticalRefreshAtMs, lastExecutionRefreshAtMs };
}

/**
 * Persist one progressive refinement on the SAME tree: update lever_state +
 * tree_version on decision_trees and append a lineage-bearing tree_refinements
 * row. Never replaces the tree.
 */
export async function persistTreeRefinement(
  run: RunRow,
  args: { treeId: string; leverState: TreeLeverState; refinement: TreeRefinement; rejected: string[] }
): Promise<void> {
  await sql`
    UPDATE decision_trees
    SET lever_state = ${JSON.stringify(args.leverState)}::jsonb,
        tree_version = ${args.refinement.version}
    WHERE id = ${args.treeId}
  `;
  await sql`
    INSERT INTO tree_refinements
      (decision_tree_id, run_id, run_node_id, layer, tree_version, levers, rejected_levers)
    VALUES
      (${args.treeId}, ${run.id}, ${args.refinement.runNodeId}, ${args.refinement.layer},
       ${args.refinement.version}, ${JSON.stringify(settingsToObject(args.refinement.settings))}::jsonb,
       ${toPgArray(args.rejected)})
  `;
}

function settingsToObject(settings: LeverSetting[]): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const s of settings) out[s.key] = s.value;
  return out;
}
