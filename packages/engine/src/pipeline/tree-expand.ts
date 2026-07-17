import type { BranchNode, TreeExpandOutput } from '@hftr/contracts';
import type { BuiltDecisionTree, TreeLeadInput } from './tree';
import { INVALIDATION_BAND_BPS } from './tree';

export type ModelBuiltDecisionTree = Omit<BuiltDecisionTree, 'sourceClass'> & {
  sourceClass: 'model_generated' | 'deterministic_placeholder';
};

/**
 * Convert tactical model output into decision-tree branches.
 * Falls back to deterministic shape when summaries are unusable.
 */
export function treeFromModelOutput(
  lead: TreeLeadInput,
  output: TreeExpandOutput,
  fallback: BuiltDecisionTree,
): ModelBuiltDecisionTree {
  const branches = summariesToBranches(lead, output.branchSummaries);
  if (branches.length === 0) {
    return { ...fallback, sourceClass: 'deterministic_placeholder' };
  }

  return {
    symbol: fallback.symbol,
    branches,
    recoveryLadder: fallback.recoveryLadder,
    sourceClass: 'model_generated',
  };
}

function summariesToBranches(
  lead: TreeLeadInput,
  summaries: TreeExpandOutput['branchSummaries'],
): BranchNode[] {
  const entrySummary =
    summaries.find((s) => s.actionVerb === 'buy' || s.actionVerb === 'sell') ?? summaries[0];
  if (!entrySummary) return [];

  const entry: BranchNode =
    lead.direction === 'up' && entrySummary.actionVerb === 'buy'
      ? {
          id: entrySummary.id || 'entry',
          condition: `model_entry:${lead.symbol}:${entrySummary.label}`,
          onTrue: 'invalidation',
          onFalse: null,
          emits: 'order',
        }
      : {
          id: entrySummary.id || 'entry',
          condition: `model_blocked:${lead.symbol}:${entrySummary.label}`,
          onTrue: null,
          onFalse: null,
          emits: 'blocked',
        };

  const notes = summaries.flatMap((s) => s.invalidationNotes).slice(0, 6);
  const invalidation: BranchNode = {
    id: 'invalidation',
    condition:
      notes.length > 0
        ? `model_invalidation:${notes.join('|')}`
        : `price_drift_beyond_band:${INVALIDATION_BAND_BPS}bps`,
    onTrue: 'recovery',
    onFalse: null,
    emits: 'watch',
  };

  return [entry, invalidation];
}
