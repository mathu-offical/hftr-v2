/**
 * D-244: Deterministic executable_state gate before OrderCompositionPlan.
 * Model-free — session/seal/tree readiness only.
 */

import { TradingPathExecutableState, type TradingPathExecutableState as ExecState } from '@hftr/contracts';

export type ExecutableStateInput = {
  leadRef: string;
  decisionTreeRef: string;
  tradingModuleId: string;
  /** Tree has at least one branch. */
  hasBranches: boolean;
  /** Session allows orders (open / auction etc.). */
  sessionAllowsOrder: boolean;
  /** Hard policy / capital block. */
  blocked?: boolean;
  blockReasons?: string[];
  nowIso?: string;
};

/**
 * Map tree + session into watch | blocked | order (MVP omits wait/fallback).
 */
export function evaluateTradingPathExecutableState(input: ExecutableStateInput): ExecState {
  const reasons: string[] = [...(input.blockReasons ?? [])];
  let state: ExecState['state'] = 'order';

  if (input.blocked) {
    state = 'blocked';
    if (reasons.length === 0) reasons.push('policy_blocked');
  } else if (!input.hasBranches) {
    state = 'blocked';
    reasons.push('empty_tree');
  } else if (!input.sessionAllowsOrder) {
    state = 'watch';
    reasons.push('session_closed');
  }

  return TradingPathExecutableState.parse({
    schemaVersion: 1,
    leadRef: input.leadRef,
    decisionTreeRef: input.decisionTreeRef,
    tradingModuleId: input.tradingModuleId,
    state,
    reasonCodes: reasons.slice(0, 16),
    updatedAt: input.nowIso ?? new Date().toISOString(),
  });
}

export function executableStateAllowsCompose(state: ExecState): boolean {
  return state.state === 'order';
}
