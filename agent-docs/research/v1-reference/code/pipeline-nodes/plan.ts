// Pure planning helpers for the node engine: child-fork seed assignment and the
// bounded verification-triggered loop. Kept pure (no DB) so determinism and
// termination are unit-testable in isolation.

import type { NodeKind, PatternCaps, RoutingLoopConfig, SpawnReason } from "@hftr/contracts";
import { deriveNodeSeed } from "./seed";

export interface ChildNodeSpec {
  nodeKind: NodeKind;
  subjectRef: string;
  spawnReason: SpawnReason;
  patternStepId: string;
  payload: Record<string, unknown>;
  /** Override the inherited attempt counter (loop children increment it). */
  attempt?: number;
}

export interface PlannedChild {
  spec: ChildNodeSpec;
  forkIndex: number;
  depth: number;
  attempt: number;
  deterministicSeed: string;
}

/**
 * Assign deterministic fork indices + seeds to a parent's emitted children.
 * deterministic_seed = hash(run.seed : parent_node_id : fork_index), so replay
 * reproduces identical seeds and distinct siblings get distinct seeds.
 */
export function assignForkSeeds(
  parent: { id: string; depth: number; attempt: number },
  specs: ChildNodeSpec[],
  runSeed: string
): PlannedChild[] {
  return specs.map((spec, i) => ({
    spec,
    forkIndex: i,
    depth: parent.depth + 1,
    attempt: spec.attempt ?? parent.attempt,
    deterministicSeed: deriveNodeSeed(runSeed, parent.id, i),
  }));
}

export interface LoopPlanArgs {
  node: {
    attempt: number;
    depth: number;
    patternStepId: string;
    payload: Record<string, unknown>;
  };
  /** Verification outcome code (read from the persisted verification record). */
  outcome: string;
  loop: RoutingLoopConfig | undefined;
  caps: PatternCaps;
  /** Current total node count for the run (global node budget). */
  nodeCount: number;
}

/**
 * Decide whether a verification outcome spawns a deeper-analysis / retry child.
 * Looping is ENCOURAGED within hard caps and ALWAYS terminates: it is rejected
 * once the attempt cap, depth cap, or node budget would be exceeded. Predicates
 * read only the persisted outcome code, so the decision is deterministic.
 */
export function planLoopChild(args: LoopPlanArgs): ChildNodeSpec | null {
  const { node, outcome, loop, caps, nodeCount } = args;
  if (!loop) return null;
  if (!loop.onOutcomes.includes(outcome)) return null;

  const nextAttempt = node.attempt + 1;
  const attemptCap = Math.min(loop.maxAttempts, caps.maxLoopAttempts);
  if (nextAttempt > attemptCap) return null;
  if (node.depth + 1 > caps.maxDepth) return null;
  if (nodeCount + 1 > caps.maxNodes) return null;

  return {
    nodeKind: loop.spawnKind,
    subjectRef: `loop:${nextAttempt}`,
    spawnReason: loop.spawnReason,
    patternStepId: node.patternStepId,
    payload: { ...node.payload, attempt: nextAttempt, loopReason: outcome },
    attempt: nextAttempt,
  };
}
