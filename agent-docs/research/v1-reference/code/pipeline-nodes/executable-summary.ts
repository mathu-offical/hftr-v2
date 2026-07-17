// Compact executable-state rollup for programmatic query APIs.

import type { ExecutableState, ExecutableSummary } from "@hftr/contracts";

export function buildExecutableSummary(
  state: ExecutableState | null,
  opts: { treeId: string; treeVersion: number; fallbackReason?: string | null }
): ExecutableSummary {
  if (!state) {
    return {
      treeId: opts.treeId,
      treeVersion: opts.treeVersion,
      status: null,
      watchCount: 0,
      waitCount: 0,
      orderCount: 0,
      lastVerifiedPatternRef: null,
      primaryWaitReason: null,
      primaryResumeCondition: null,
      fallbackReason: opts.fallbackReason ?? null,
    };
  }

  const wait0 = state.waitIntents[0];
  return {
    treeId: state.decisionTreeId,
    treeVersion: state.treeVersion,
    status: state.status,
    watchCount: state.watchIntents.length,
    waitCount: state.waitIntents.length,
    orderCount: state.orderInstructions.length,
    lastVerifiedPatternRef: state.lastVerifiedPatternRef,
    primaryWaitReason: wait0?.reason ?? null,
    primaryResumeCondition: wait0?.resumeCondition ?? null,
    fallbackReason: opts.fallbackReason ?? null,
  };
}
