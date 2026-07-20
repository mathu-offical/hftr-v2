/**
 * D-244: loop_refine — model-free retune of the same DecisionTree after
 * no_fill / expired / needs_recovery, then re-enter compile (not LLM below compile).
 */

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { decisionTrees, leadPackages, modules } from '@hftr/db/schema';
import { TradingModuleConfig } from '@hftr/contracts';
import { enqueue } from '../queue/queue';
import { estimateLlmJobCost } from '../queue/llm-cost-estimate';
import { buildEntryOnlyCompositionPlan } from '../pipeline/order-composition';
import { patchProcessStagesForModule } from '../engines/process-stage-status';
import { registerHandler } from './registry';

const MAX_REFINE_ATTEMPTS = 3;

const RefinePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  leadId: z.string().uuid(),
  treeId: z.string().uuid(),
  trendId: z.string().uuid().optional(),
  targetModuleId: z.string().uuid().optional(),
  controlSnapshot: z.record(z.unknown()).optional(),
  reason: z.enum(['no_fill', 'expired', 'canceled', 'rejected', 'needs_recovery']),
  attempt: z.number().int().min(0).max(8).optional(),
});

registerHandler('trading.loop_refine', async ({ db, clock, job }) => {
  const payload = RefinePayload.parse(job.payload);
  const now = new Date(clock.nowMs());
  const attempt = (payload.attempt ?? 0) + 1;

  await patchProcessStagesForModule(db, payload.companyId, payload.moduleId, [
    { kind: 'loop_refine', status: 'active' },
  ]);

  if (attempt > MAX_REFINE_ATTEMPTS) {
    await db
      .update(decisionTrees)
      .set({ status: 'compile_blocked', updatedAt: now })
      .where(
        and(eq(decisionTrees.id, payload.treeId), eq(decisionTrees.companyId, payload.companyId)),
      );
    await patchProcessStagesForModule(db, payload.companyId, payload.moduleId, [
      { kind: 'loop_refine', status: 'blocked' },
    ]);
    return;
  }

  const tree = (
    await db
      .select()
      .from(decisionTrees)
      .where(
        and(eq(decisionTrees.id, payload.treeId), eq(decisionTrees.companyId, payload.companyId)),
      )
      .limit(1)
  )[0];
  const lead = (
    await db
      .select()
      .from(leadPackages)
      .where(and(eq(leadPackages.id, payload.leadId), eq(leadPackages.companyId, payload.companyId)))
      .limit(1)
  )[0];
  if (!tree || !lead) return;

  const tradingModuleId = payload.targetModuleId ?? payload.moduleId;
  const [tradingMod] = await db
    .select({ config: modules.config })
    .from(modules)
    .where(and(eq(modules.id, tradingModuleId), eq(modules.companyId, payload.companyId)))
    .limit(1);
  const tradingCfg = TradingModuleConfig.safeParse(tradingMod?.config ?? {});
  const compositionMode = tradingCfg.success ? tradingCfg.data.compositionMode : 'entry_only';

  if (compositionMode !== 'entry_only') {
    await patchProcessStagesForModule(db, payload.companyId, tradingModuleId, [
      { kind: 'loop_refine', status: 'blocked' },
      { kind: 'instruction_compose', status: 'blocked' },
    ]);
    return;
  }

  const leadControl =
    lead.controlSnapshot && typeof lead.controlSnapshot === 'object'
      ? (lead.controlSnapshot as Record<string, unknown>)
      : {};
  const mergedControl = {
    ...leadControl,
    ...(payload.controlSnapshot ?? {}),
  };
  const controlSnap = mergedControl as {
    policyEnvelopeVersion?: string;
    persistedControlSnapshotId?: string;
    postureOrientationRef?: string | null;
  };

  const ladder = Array.isArray(tree.recoveryLadder) ? [...(tree.recoveryLadder as string[])] : [];
  const nextLadder = [...ladder, `refine:${payload.reason}:attempt_${attempt}`].slice(-12);

  await db
    .update(decisionTrees)
    .set({
      status: 'compile_ready',
      recoveryLadder: nextLadder,
      updatedAt: now,
      leverState: {
        ...((typeof tree.leverState === 'object' && tree.leverState !== null
          ? tree.leverState
          : {}) as Record<string, unknown>),
        loopRefineAttempt: attempt,
        loopRefineReason: payload.reason,
      },
    })
    .where(eq(decisionTrees.id, payload.treeId));

  const compositionPlan = buildEntryOnlyCompositionPlan({
    leadRef: payload.leadId,
    decisionTreeRef: payload.treeId,
    tradingModuleId,
    policyEnvelopeRef: controlSnap.policyEnvelopeVersion ?? null,
    controlSnapshotRef: controlSnap.persistedControlSnapshotId ?? null,
    postureOrientationRef: controlSnap.postureOrientationRef ?? null,
    compositionMode,
    nowIso: now.toISOString(),
  });

  const trendId = payload.trendId ?? lead.trendId;

  await enqueue(db, clock, {
    queueClass: 'COMPILE',
    kind: 'compile.select',
    costEstimate: estimateLlmJobCost('compile.select'),
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      leadId: payload.leadId,
      treeId: payload.treeId,
      trendId,
      ...(payload.targetModuleId ? { targetModuleId: payload.targetModuleId } : {}),
      controlSnapshot: mergedControl,
      tacticalProvider: 'deterministic_placeholder',
      compositionPlan,
      loopRefineAttempt: attempt,
    },
    idempotencyKey: `compile-select-refine-${payload.treeId}-${attempt}`,
    priority: 'HIGH',
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });

  await db
    .update(leadPackages)
    .set({ updatedAt: now })
    .where(eq(leadPackages.id, payload.leadId));

  await patchProcessStagesForModule(db, payload.companyId, tradingModuleId, [
    { kind: 'loop_refine', status: 'done' },
    { kind: 'instruction_compose', status: 'done' },
    { kind: 'instruction_compile', status: 'active' },
  ]);
});
