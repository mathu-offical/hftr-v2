import type { BranchNode, QuoteSnapshot } from '@hftr/contracts';
import { getRecoveryLadderTemplate, recoveryTemplateForFamily } from './recovery-ladder';

/**
 * Deterministic tactical decomposition (v1 decision_trees stage). Builds the
 * branch graph an admitted lead needs before compile: an entry branch, an
 * invalidation node, and a recovery ladder. This is a deterministic
 * placeholder for the tactical model tier — sourceClass says so — but the
 * shape (BranchNode[] + ladder) is exactly what a model tier would emit, so
 * swapping in a real call needs no schema change.
 */

export interface TreeLeadInput {
  symbol: string;
  direction: 'up' | 'down' | 'flat';
  /** When set, recovery ladder phases come from catalog template for the family. */
  strategyFamily?: string | null;
}

export interface BuiltDecisionTree {
  symbol: string;
  branches: BranchNode[];
  recoveryLadder: string[];
  sourceClass: 'deterministic_placeholder';
}

/** Invalidation band: quote drift beyond this many bps voids the entry thesis. */
export const INVALIDATION_BAND_BPS = 150;

const FALLBACK_RECOVERY_LADDER = Object.freeze(['defer', 'cancel', 'escalate']);

export function resolveRecoveryLadderPhases(strategyFamily?: string | null): string[] {
  if (!strategyFamily) return [...FALLBACK_RECOVERY_LADDER];
  const tpl = getRecoveryLadderTemplate(recoveryTemplateForFamily(strategyFamily));
  if (tpl && tpl.phases.length > 0) return [...tpl.phases];
  return [...FALLBACK_RECOVERY_LADDER];
}

export function buildDecisionTree(lead: TreeLeadInput, quote: QuoteSnapshot): BuiltDecisionTree {
  const entry: BranchNode =
    lead.direction === 'up'
      ? {
          id: 'entry',
          condition: `direction_up:${quote.symbol}:market_buy`,
          onTrue: 'invalidation',
          onFalse: null,
          emits: 'order',
        }
      : {
          // Paper v1 forbids shorting; non-up leads carry a blocked entry note.
          id: 'entry',
          condition: `direction_${lead.direction}:${quote.symbol}:short_or_flat_not_supported_in_paper_v1`,
          onTrue: null,
          onFalse: null,
          emits: 'blocked',
        };

  const invalidation: BranchNode = {
    id: 'invalidation',
    condition: `price_drift_beyond_band:${INVALIDATION_BAND_BPS}bps`,
    onTrue: 'recovery',
    onFalse: null,
    emits: 'watch',
  };

  return {
    symbol: quote.symbol,
    branches: [entry, invalidation],
    recoveryLadder: resolveRecoveryLadderPhases(lead.strategyFamily),
    sourceClass: 'deterministic_placeholder',
  };
}
