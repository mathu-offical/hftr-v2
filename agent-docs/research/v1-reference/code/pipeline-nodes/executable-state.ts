// Executable state — persisted linkage between decision tree version,
// watch/wait intents, order instructions, and last verified pattern fallback.

import { sql } from "@vercel/postgres";
import type {
  ExecutableState,
  ExecutableStatus,
  ExecutableSummary,
  LeverScope,
  OrderInstructionRef,
  WaitIntent,
  WatchIntent,
} from "@hftr/contracts";
import { buildExecutableSummary } from "./executable-summary";
import type { BuiltDecisionTree } from "../tactical";
import type { RunRow } from "../orchestrator";
import { emitSignal } from "../orchestrator";
import {
  loadLastTreeRefinementAtMs,
  loadTierRefreshTimestampsMs,
  loadTreeLeverState,
} from "./store";
import {
  classifyTradingSession,
  resolvePatternReuseResumeCondition,
  TREE_VERSION_AGE_MS,
  type TradingSessionClass,
} from "./session-legality";

export type ExecutableStateEvent =
  | { kind: "tree_shaped"; treeVersion: number; tree: BuiltDecisionTree; blocked: boolean }
  | { kind: "compile_ready"; treeVersion: number; instruction: OrderInstructionRef }
  | { kind: "compile_blocked"; treeVersion: number; blockReasons: string[] }
  | { kind: "verification_outcome"; treeVersion: number; outcome: string; lastVerifiedPatternRef: string | null };

/** Tier loop cadence from product defaults (oq-037). */
export const TIER_LOOP_INTERVAL_MS = {
  strategic: 3 * 60 * 60 * 1000,
  tactical: 30 * 60 * 1000,
  execution: 5 * 60 * 1000,
} as const;

export type StalenessContext = {
  nowMs: number;
  treeVersion: number;
  lastTacticalRefreshAtMs: number | null;
  lastExecutionRefreshAtMs: number | null;
  lastTreeRefinementAtMs: number | null;
  /** When false, analysis is treated as stale regardless of tier clocks. */
  benchmarkFreshnessOk?: boolean;
  sessionClass?: TradingSessionClass;
};

type ExecutableStateSlice = Pick<
  ExecutableState,
  "status" | "watchIntents" | "waitIntents" | "orderInstructions" | "lastVerifiedPatternRef" | "treeVersion"
>;

export async function buildStalenessContextForTree(
  treeId: string,
  options?: { benchmarkFreshnessOk?: boolean; nowMs?: number }
): Promise<StalenessContext> {
  const [timestamps, lastTreeRefinementAtMs, treeState] = await Promise.all([
    loadTierRefreshTimestampsMs(treeId),
    loadLastTreeRefinementAtMs(treeId),
    loadTreeLeverState(treeId),
  ]);
  const nowMs = options?.nowMs ?? Date.now();
  return {
    nowMs,
    treeVersion: treeState?.version ?? 1,
    ...timestamps,
    lastTreeRefinementAtMs,
    benchmarkFreshnessOk: options?.benchmarkFreshnessOk ?? true,
    sessionClass: classifyTradingSession(nowMs),
  };
}

export function assessExecutableStaleness(
  ctx: StalenessContext
): { stale: boolean; reason: string | null } {
  if (ctx.benchmarkFreshnessOk === false) {
    return { stale: true, reason: "benchmark_freshness_expired" };
  }
  if (
    ctx.lastTreeRefinementAtMs != null &&
    ctx.nowMs - ctx.lastTreeRefinementAtMs > TREE_VERSION_AGE_MS
  ) {
    return { stale: true, reason: "tree_version_age_exceeded" };
  }
  if (
    ctx.lastTacticalRefreshAtMs != null &&
    ctx.nowMs - ctx.lastTacticalRefreshAtMs > TIER_LOOP_INTERVAL_MS.tactical
  ) {
    return { stale: true, reason: "tactical_tier_overdue" };
  }
  if (
    ctx.lastExecutionRefreshAtMs != null &&
    ctx.nowMs - ctx.lastExecutionRefreshAtMs > TIER_LOOP_INTERVAL_MS.execution
  ) {
    return { stale: true, reason: "execution_tier_overdue" };
  }
  return { stale: false, reason: null };
}

function waitIntentsForStaleFallback(
  patternRef: string | null,
  treeVersion: number,
  sessionClass: TradingSessionClass
): WaitIntent[] {
  const resumeCondition = resolvePatternReuseResumeCondition(patternRef, treeVersion, sessionClass);
  return [
    {
      reason: "analysis_stale",
      untilRef: null,
      resumeCondition,
    },
  ];
}

/**
 * After a scheduled or loop execution-tier re-tune, unblock trees waiting on
 * `tier_retune` so compile/dispatch can resume on the refreshed tree version.
 */
export function transitionExecutableStateAfterTierRetune(
  prev: ExecutableStateSlice | null,
  scope: LeverScope,
  treeVersion: number
): (ExecutableStateSlice & { fallbackReason?: string | null }) | null {
  if (!prev || prev.status !== "fallback") return null;
  const resume = prev.waitIntents[0]?.resumeCondition;
  if (resume !== "tier_retune") return null;

  return {
    treeVersion,
    status: "wait",
    watchIntents: prev.watchIntents,
    waitIntents: [
      {
        reason: `${scope}_tier_retune_complete`,
        untilRef: null,
        resumeCondition: "recompile_after_retune",
      },
    ],
    orderInstructions: [],
    lastVerifiedPatternRef: prev.lastVerifiedPatternRef,
    fallbackReason: null,
  };
}

/** Forces fallback + verified-pattern reuse (or tier retune) when analysis is stale (oq-037). */
export function transitionExecutableStateOnStaleness(
  prev: ExecutableStateSlice,
  ctx: StalenessContext
): (ExecutableStateSlice & { fallbackReason?: string | null }) | null {
  const { stale, reason } = assessExecutableStaleness(ctx);
  if (!stale || !reason) return null;
  if (prev.status === "fallback" || prev.status === "blocked") return null;

  const patternRef = prev.lastVerifiedPatternRef;
  const sessionClass = ctx.sessionClass ?? classifyTradingSession(ctx.nowMs);
  return {
    treeVersion: prev.treeVersion,
    status: "fallback",
    watchIntents: prev.watchIntents,
    waitIntents: waitIntentsForStaleFallback(patternRef, prev.treeVersion, sessionClass),
    orderInstructions: [],
    lastVerifiedPatternRef: patternRef,
    fallbackReason: reason,
  };
}

export function transitionExecutableState(
  prev: Pick<ExecutableState, "status" | "watchIntents" | "waitIntents" | "orderInstructions" | "lastVerifiedPatternRef"> & {
    treeVersion?: number;
  } | null,
  event: ExecutableStateEvent,
  staleness?: StalenessContext
): Pick<ExecutableState, "status" | "watchIntents" | "waitIntents" | "orderInstructions" | "lastVerifiedPatternRef" | "treeVersion"> & {
  fallbackReason?: string | null;
} {
  let effectivePrev = prev;
  if (staleness && prev) {
    const staleSlice: ExecutableStateSlice = {
      treeVersion: prev.treeVersion ?? event.treeVersion,
      status: prev.status,
      watchIntents: prev.watchIntents,
      waitIntents: prev.waitIntents,
      orderInstructions: prev.orderInstructions,
      lastVerifiedPatternRef: prev.lastVerifiedPatternRef,
    };
    const staleTransition = transitionExecutableStateOnStaleness(staleSlice, staleness);
    if (staleTransition) {
      effectivePrev = staleTransition;
      if (event.kind === "compile_ready") {
        return staleTransition;
      }
    }
  }

  const base = {
    treeVersion: event.treeVersion,
    watchIntents: effectivePrev?.watchIntents ?? [],
    waitIntents: effectivePrev?.waitIntents ?? [],
    orderInstructions: effectivePrev?.orderInstructions ?? [],
    lastVerifiedPatternRef: effectivePrev?.lastVerifiedPatternRef ?? null,
  };

  const sessionClass = staleness?.sessionClass ?? classifyTradingSession(staleness?.nowMs);

  switch (event.kind) {
    case "tree_shaped": {
      if (event.blocked) {
        return {
          ...base,
          status: "blocked",
          watchIntents: [],
          waitIntents: [{ reason: "tree_blocked", untilRef: null, resumeCondition: event.tree.blockReasons.join(";") }],
          orderInstructions: [],
        };
      }
      return {
        ...base,
        status: "watch",
        watchIntents: watchIntentsFromTree(event.tree),
        waitIntents: [{ reason: "await_entry_trigger", untilRef: null, resumeCondition: "branch_condition_met" }],
        orderInstructions: [],
      };
    }
    case "compile_ready":
      return {
        ...base,
        status: "order",
        watchIntents: prev?.watchIntents ?? [],
        waitIntents: [],
        orderInstructions: [event.instruction],
      };
    case "compile_blocked":
      return {
        ...base,
        status: "blocked",
        watchIntents: [],
        waitIntents: event.blockReasons.map((r) => ({
          reason: r,
          untilRef: null,
          resumeCondition: "recompile_after_retune",
        })),
        orderInstructions: [],
      };
    case "verification_outcome": {
      const filled = event.outcome === "filled" || event.outcome === "partial_fill";
      if (filled && event.lastVerifiedPatternRef) {
        return {
          ...base,
          status: "watch",
          lastVerifiedPatternRef: event.lastVerifiedPatternRef,
          waitIntents: [{ reason: "post_fill_observation", untilRef: null, resumeCondition: "exit_or_scale_branch" }],
        };
      }
      if (event.outcome === "needs_recovery" || event.outcome === "no_fill") {
        const patternRef = event.lastVerifiedPatternRef ?? prev?.lastVerifiedPatternRef ?? null;
        const resumeCondition = resolvePatternReuseResumeCondition(
          patternRef,
          event.treeVersion,
          sessionClass
        );
        return {
          ...base,
          status: "fallback",
          lastVerifiedPatternRef: patternRef,
          fallbackReason: event.outcome,
          waitIntents: [
            {
              reason: "verification_fallback",
              untilRef: null,
              resumeCondition,
            },
          ],
        };
      }
      return { ...base, status: (prev?.status ?? "wait") as ExecutableStatus };
    }
    default:
      return { ...base, status: (prev?.status ?? "wait") as ExecutableStatus };
  }
}

function watchIntentsFromTree(tree: BuiltDecisionTree): WatchIntent[] {
  const branches = tree.entryBranchIds.length > 0 ? tree.entryBranchIds : tree.rootBranches.map((b) => b.branchId);
  return branches.map((branchId, i) => {
    const branch = tree.rootBranches.find((b) => b.branchId === branchId);
    return {
      branchId,
      conditionEncoded: branch?.conditionEncoded ?? "entry",
      label: branch?.label ?? branchId,
      priority: branch?.priority ?? i + 1,
    };
  });
}

export type ExecutableStateRow = ExecutableState & { fallbackReason: string | null };

export async function loadExecutableState(treeId: string): Promise<ExecutableStateRow | null> {
  const { rows } = await sql<{
    id: string;
    workspace_id: string;
    run_id: string;
    decision_tree_id: string;
    tree_version: number;
    status: ExecutableStatus;
    watch_intents: WatchIntent[];
    wait_intents: WaitIntent[];
    order_instructions: OrderInstructionRef[];
    last_verified_pattern_ref: string | null;
    fallback_reason: string | null;
    updated_at: string;
  }>`
    SELECT id, workspace_id, run_id, decision_tree_id, tree_version, status,
           watch_intents, wait_intents, order_instructions, last_verified_pattern_ref,
           fallback_reason, updated_at
    FROM executable_states
    WHERE decision_tree_id = ${treeId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    decisionTreeId: row.decision_tree_id,
    treeVersion: row.tree_version,
    status: row.status,
    watchIntents: row.watch_intents ?? [],
    waitIntents: row.wait_intents ?? [],
    orderInstructions: row.order_instructions ?? [],
    lastVerifiedPatternRef: row.last_verified_pattern_ref,
    fallbackReason: row.fallback_reason,
    updatedAt: row.updated_at,
  };
}

export async function loadExecutableSummariesForRun(
  runId: string
): Promise<Map<string, { state: ExecutableStateRow; summary: ExecutableSummary }>> {
  const { rows } = await sql<{
    decision_tree_id: string;
    tree_version: number;
    status: ExecutableStatus;
    watch_intents: WatchIntent[];
    wait_intents: WaitIntent[];
    order_instructions: OrderInstructionRef[];
    last_verified_pattern_ref: string | null;
    fallback_reason: string | null;
    id: string;
    workspace_id: string;
    run_id: string;
    updated_at: string;
  }>`
    SELECT id, workspace_id, run_id, decision_tree_id, tree_version, status,
           watch_intents, wait_intents, order_instructions, last_verified_pattern_ref,
           fallback_reason, updated_at
    FROM executable_states
    WHERE run_id = ${runId}
  `;

  const out = new Map<string, { state: ExecutableStateRow; summary: ExecutableSummary }>();
  for (const row of rows) {
    const state: ExecutableStateRow = {
      id: row.id,
      workspaceId: row.workspace_id,
      runId: row.run_id,
      decisionTreeId: row.decision_tree_id,
      treeVersion: row.tree_version,
      status: row.status,
      watchIntents: row.watch_intents ?? [],
      waitIntents: row.wait_intents ?? [],
      orderInstructions: row.order_instructions ?? [],
      lastVerifiedPatternRef: row.last_verified_pattern_ref,
      fallbackReason: row.fallback_reason,
      updatedAt: row.updated_at,
    };
    out.set(row.decision_tree_id, {
      state,
      summary: buildExecutableSummary(state, {
        treeId: row.decision_tree_id,
        treeVersion: row.tree_version,
        fallbackReason: row.fallback_reason,
      }),
    });
  }
  return out;
}

/** Records fallback_reason on the run control snapshot lineage (oq-037). */
export async function recordControlSnapshotFallback(
  run: RunRow,
  treeId: string,
  fallbackReason: string
): Promise<void> {
  await emitSignal(
    run,
    "control_snapshot_fallback",
    "control_snapshot",
    run.control_snapshot_ref,
    treeId,
    { fallbackReason, controlSnapshotRef: run.control_snapshot_ref },
    `control_snapshot_fallback:${run.control_snapshot_ref}:${fallbackReason}`
  );
}

/** Operator trace timeline: executable state transitions (P2 observability). */
export async function emitExecutableStateTimelineEvent(
  run: RunRow,
  treeId: string,
  event: ExecutableStateEvent,
  transition: {
    fromStatus: ExecutableStatus | null;
    toStatus: ExecutableStatus;
    treeVersion: number;
    fallbackReason?: string | null;
  }
): Promise<void> {
  await emitSignal(
    run,
    "executable_state_transition",
    "executable_state",
    treeId,
    null,
    {
      event: event.kind,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      treeVersion: transition.treeVersion,
      fallbackReason: transition.fallbackReason ?? null,
      controlSnapshotRef: run.control_snapshot_ref,
    },
    `executable_state:${treeId}:${event.kind}:v${transition.treeVersion}`
  );
}

export async function upsertExecutableState(
  run: RunRow,
  treeId: string,
  patch: Pick<ExecutableState, "treeVersion" | "status" | "watchIntents" | "waitIntents" | "orderInstructions" | "lastVerifiedPatternRef"> & {
    fallbackReason?: string | null;
  }
): Promise<void> {
  await sql`
    INSERT INTO executable_states
      (workspace_id, run_id, decision_tree_id, tree_version, status,
       watch_intents, wait_intents, order_instructions, last_verified_pattern_ref, fallback_reason, updated_at)
    VALUES
      (${run.workspace_id}, ${run.id}, ${treeId}, ${patch.treeVersion}, ${patch.status},
       ${JSON.stringify(patch.watchIntents)}::jsonb, ${JSON.stringify(patch.waitIntents)}::jsonb,
       ${JSON.stringify(patch.orderInstructions)}::jsonb, ${patch.lastVerifiedPatternRef},
       ${patch.fallbackReason ?? null}, now())
    ON CONFLICT (decision_tree_id) DO UPDATE SET
      tree_version = EXCLUDED.tree_version,
      status = EXCLUDED.status,
      watch_intents = EXCLUDED.watch_intents,
      wait_intents = EXCLUDED.wait_intents,
      order_instructions = EXCLUDED.order_instructions,
      last_verified_pattern_ref = COALESCE(EXCLUDED.last_verified_pattern_ref, executable_states.last_verified_pattern_ref),
      fallback_reason = EXCLUDED.fallback_reason,
      updated_at = now()
  `;
}

export async function syncExecutableStateAfterTierRetune(
  run: RunRow,
  treeId: string,
  scope: LeverScope,
  treeVersion: number
): Promise<void> {
  const prev = await loadExecutableState(treeId);
  const next = transitionExecutableStateAfterTierRetune(prev, scope, treeVersion);
  if (!next) return;

  await upsertExecutableState(run, treeId, {
    treeVersion: next.treeVersion,
    status: next.status,
    watchIntents: next.watchIntents,
    waitIntents: next.waitIntents,
    orderInstructions: next.orderInstructions,
    lastVerifiedPatternRef: next.lastVerifiedPatternRef,
    fallbackReason: null,
  });

  await emitExecutableStateTimelineEvent(
    run,
    treeId,
    { kind: "verification_outcome", treeVersion, outcome: "tier_retune", lastVerifiedPatternRef: next.lastVerifiedPatternRef },
    {
      fromStatus: prev?.status ?? null,
      toStatus: next.status,
      treeVersion: next.treeVersion,
      fallbackReason: null,
    }
  );
}

export async function syncExecutableState(
  run: RunRow,
  treeId: string,
  event: ExecutableStateEvent,
  options?: { staleness?: StalenessContext }
): Promise<void> {
  const prev = await loadExecutableState(treeId);
  const next = transitionExecutableState(prev, event, options?.staleness);
  const fallbackReason = "fallbackReason" in next ? (next.fallbackReason ?? null) : null;

  await upsertExecutableState(run, treeId, {
    treeVersion: next.treeVersion,
    status: next.status,
    watchIntents: next.watchIntents,
    waitIntents: next.waitIntents,
    orderInstructions: next.orderInstructions,
    lastVerifiedPatternRef: next.lastVerifiedPatternRef,
    fallbackReason,
  });

  await emitExecutableStateTimelineEvent(run, treeId, event, {
    fromStatus: prev?.status ?? null,
    toStatus: next.status,
    treeVersion: next.treeVersion,
    fallbackReason,
  });

  if (fallbackReason) {
    await recordControlSnapshotFallback(run, treeId, fallbackReason);
  }
}
