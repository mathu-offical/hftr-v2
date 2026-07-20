/**
 * D-244 MVP: build entry_only OrderCompositionPlan from an admitted lead + tree.
 */

import { randomUUID } from 'node:crypto';
import {
  OrderCompositionPlan,
  type CompositionMode,
  type OrderCompositionPlan as Plan,
} from '@hftr/contracts';

export function buildEntryOnlyCompositionPlan(input: {
  leadRef: string;
  decisionTreeRef: string;
  tradingModuleId: string;
  policyEnvelopeRef?: string | null;
  controlSnapshotRef?: string | null;
  postureOrientationRef?: string | null;
  compositionMode?: CompositionMode;
  nowIso?: string;
}): Plan {
  const mode = input.compositionMode ?? 'entry_only';
  const plan = OrderCompositionPlan.parse({
    schemaVersion: 1,
    planId: randomUUID(),
    leadRef: input.leadRef,
    decisionTreeRef: input.decisionTreeRef,
    tradingModuleId: input.tradingModuleId,
    policyEnvelopeRef: input.policyEnvelopeRef ?? null,
    controlSnapshotRef: input.controlSnapshotRef ?? null,
    postureOrientationRef: input.postureOrientationRef ?? null,
    compositionMode: mode,
    legs: [
      {
        legId: randomUUID(),
        role: 'primary_entry',
        branchRef: 'primary_entry',
        guardrailRefs: ['capital_limit_v1', 'session_legality_v1'],
        compileStatus: 'ready',
      },
    ],
    createdAt: input.nowIso ?? new Date().toISOString(),
  });
  return plan;
}
