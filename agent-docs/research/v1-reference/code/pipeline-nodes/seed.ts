// Deterministic node-seed derivation. Every node derives its seed from the run
// seed plus its lineage so the entire run tree is reproducible:
//   deterministic_seed = hash(run.seed : parent_node_id : fork_index)
// Replay of (run.seed, pattern version, evidence snapshot) reproduces the
// identical tree because every fanout/match/loop decision reads only this seed
// and persisted structured fields.

import { createHash } from "crypto";

export function deriveNodeSeed(
  runSeed: string,
  parentNodeId: string | null,
  forkIndex: number
): string {
  return createHash("sha256")
    .update(`${runSeed}:${parentNodeId ?? "root"}:${forkIndex}`)
    .digest("hex")
    .slice(0, 32);
}
