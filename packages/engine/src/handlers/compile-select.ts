import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BranchNode, CompileSelectionOutput, HandoffEnvelope } from '@hftr/contracts';
import {
  actionInstructions,
  compileEvents,
  decisionTrees,
  leadPackages,
  modules,
  trendCandidates,
} from '@hftr/db/schema';
import { record } from '../calc/store';
import { resolveCompileSizingBudget } from '../dispatch/balances';
import { getSyntheticQuote } from '../dispatch/quotes';
import { compileInstruction, computeQuantity } from '../pipeline/compile';
import { mergeCompileSelection, modelBlockReasonToCompile } from '../pipeline/compile-selection';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';

const SelectPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  leadId: z.string().uuid(),
  treeId: z.string().uuid(),
  trendId: z.string().uuid(),
  targetModuleId: z.string().uuid().optional(),
  controlSnapshot: z.record(z.unknown()),
  tacticalProvider: z.enum(['model', 'deterministic_placeholder']).optional(),
});

const VERIFICATION_SCHEMA_VERSION = 'trade_verify_v1';
const QUOTE_TTL_MS = 90_000;

/**
 * COMPILE queue (last model-bearing stage): execution-tier selection for
 * orderShape/tif/sizingBand; quantity always from deterministic computeQuantity.
 */
registerHandler('compile.select', async ({ db, clock, job, modelGateway }) => {
  const payload = SelectPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

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
      .where(
        and(eq(leadPackages.id, payload.leadId), eq(leadPackages.companyId, payload.companyId)),
      )
      .limit(1)
  )[0];
  const trend = (
    await db
      .select()
      .from(trendCandidates)
      .where(
        and(
          eq(trendCandidates.id, payload.trendId),
          eq(trendCandidates.companyId, payload.companyId),
        ),
      )
      .limit(1)
  )[0];
  if (!tree || !lead || !trend) return;

  const snapshot = payload.controlSnapshot as {
    sizingBasis?: string;
    sizingBasisBps?: number;
    strategyFamily?: string;
  };
  const sizingBasisBps =
    typeof snapshot.sizingBasisBps === 'number' && snapshot.sizingBasisBps > 0
      ? snapshot.sizingBasisBps
      : 100;
  const sizingBasis =
    typeof snapshot.sizingBasis === 'string' && snapshot.sizingBasis.length > 0
      ? snapshot.sizingBasis
      : 'risk_appetite_typical';
  const strategyFamily =
    typeof snapshot.strategyFamily === 'string' && snapshot.strategyFamily.length > 0
      ? snapshot.strategyFamily
      : lead.strategyFamily;
  const dispatchModuleId = payload.targetModuleId ?? payload.moduleId;

  const branchLabels = (tree.branches as Array<{ id?: string; condition?: string }>).map(
    (b) => b.id ?? b.condition ?? 'branch',
  );
  const recoveryLadderSteps = Array.isArray(tree.recoveryLadder)
    ? (tree.recoveryLadder as string[])
    : [];

  let modelSelection: CompileSelectionOutput | null = null;
  let compileProvider: 'model' | 'deterministic_placeholder' = 'deterministic_placeholder';

  if (modelGateway && process.env.HFTR_LLM_MODE !== 'deterministic') {
    const result = await modelGateway.compileSelection({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      jobId: job.id,
      treeId: payload.treeId,
      leadId: payload.leadId,
      symbol: tree.symbol,
      direction: trend.direction,
      strategyFamily,
      sizingBasis,
      branchLabels,
      recoveryLadderSteps,
    });
    if (result.ok) {
      modelSelection = result.output;
      compileProvider = 'model';
      if (result.output.blockReasons.length > 0) {
        const blockReason = modelBlockReasonToCompile(result.output.blockReasons);
        await db.insert(compileEvents).values({
          companyId: payload.companyId,
          treeId: payload.treeId,
          result: 'blocked',
          blockReason,
          instructionId: null,
          lineage: {
            leadId: payload.leadId,
            treeId: payload.treeId,
            stage: 'execution_agent_compile',
            provider: 'model',
            modelBlockReasons: result.output.blockReasons,
          },
        });
        await db
          .update(decisionTrees)
          .set({ status: 'compile_blocked', updatedAt: now })
          .where(eq(decisionTrees.id, payload.treeId));
        await db
          .update(leadPackages)
          .set({ status: 'decomposed', updatedAt: now })
          .where(eq(leadPackages.id, payload.leadId));
        return;
      }
    }
  }

  const quote = getSyntheticQuote(tree.symbol, clock);
  const tradingModuleId = payload.targetModuleId ?? payload.moduleId;
  const tradingModuleRows = await db
    .select({ capitalAllocationRef: modules.capitalAllocationRef })
    .from(modules)
    .where(
      and(eq(modules.id, tradingModuleId), eq(modules.companyId, payload.companyId)),
    )
    .limit(1);
  const capitalAllocationRef = tradingModuleRows[0]?.capitalAllocationRef ?? null;
  const {
    budgetCents,
    balanceSource,
    allocationCapCents,
    source: sizingBudgetSource,
  } = await resolveCompileSizingBudget(
    db,
    payload.companyId,
    tradingModuleId,
    capitalAllocationRef,
  );

  if (capitalAllocationRef && allocationCapCents === null) {
    await db.insert(compileEvents).values({
      companyId: payload.companyId,
      treeId: payload.treeId,
      result: 'blocked',
      blockReason: 'policy_mismatch',
      instructionId: null,
      lineage: {
        leadId: payload.leadId,
        treeId: payload.treeId,
        stage: 'execution_agent_compile',
        provider: compileProvider,
        capitalAllocationRef,
        allocationRefUnresolved: true,
      },
    });
    await db
      .update(decisionTrees)
      .set({ status: 'compile_blocked', updatedAt: now })
      .where(eq(decisionTrees.id, payload.treeId));
    await db
      .update(leadPackages)
      .set({ status: 'decomposed', updatedAt: now })
      .where(eq(leadPackages.id, payload.leadId));
    return;
  }

  const priceCents = quote.askCents ?? quote.lastCents ?? 0;

  const baseOutcome = compileInstruction(
    {
      symbol: tree.symbol,
      direction: trend.direction,
      branches: tree.branches as BranchNode[],
      recoveryLadder: recoveryLadderSteps,
    },
    { balanceCents: budgetCents, priceCents, sizingBasisBps },
  );

  if (baseOutcome.result === 'blocked') {
    await db.insert(compileEvents).values({
      companyId: payload.companyId,
      treeId: payload.treeId,
      result: 'blocked',
      blockReason: baseOutcome.blockReason,
      instructionId: null,
      lineage: {
        leadId: payload.leadId,
        treeId: payload.treeId,
        stage: 'execution_agent_compile',
        provider: compileProvider,
      },
    });
    await db
      .update(decisionTrees)
      .set({ status: 'compile_blocked', updatedAt: now })
      .where(eq(decisionTrees.id, payload.treeId));
    await db
      .update(leadPackages)
      .set({ status: 'decomposed', updatedAt: now })
      .where(eq(leadPackages.id, payload.leadId));
    return;
  }

  const merged = mergeCompileSelection(baseOutcome.instruction, modelSelection, sizingBasisBps);
  const quantity = computeQuantity(budgetCents, priceCents, merged.adjustedSizingBasisBps);
  const instruction = { ...merged.instruction, quantity };
  const provider =
    merged.provider === 'model' || compileProvider === 'model'
      ? 'model'
      : 'deterministic_placeholder';

  const quantityRef = await record(db, clock, {
    kind: 'quantity',
    unit: 'shares',
    scale: 0,
    valueInt: BigInt(instruction.quantity),
    sourceClass: 'derived',
    sourceId: `compile:sizing:${payload.leadId}:bps_${merged.adjustedSizingBasisBps}:${sizingBudgetSource}`,
    ttlMs: 10 * 60_000,
    sanity: { minInt: '1', maxInt: '100', maxAgeMs: null, mustBePositive: true },
    companyId: payload.companyId,
    moduleId: dispatchModuleId,
  });
  const timeoutRef = await record(db, clock, {
    kind: 'duration_ms',
    unit: 'ms',
    scale: 0,
    valueInt: 30_000n,
    timezone: 'UTC',
    sourceClass: 'band_seed',
    sourceId: 'band:fill_timeout:typical',
    ttlMs: 10 * 60_000,
    companyId: payload.companyId,
    moduleId: dispatchModuleId,
  });
  await record(db, clock, {
    kind: 'price',
    unit: 'USD_cents',
    scale: 0,
    valueInt: BigInt(priceCents),
    sourceClass: 'synthetic_sim',
    sourceId: `synthetic_sim:${quote.symbol}`,
    ttlMs: QUOTE_TTL_MS,
    companyId: payload.companyId,
    moduleId: dispatchModuleId,
  });

  const envelope: HandoffEnvelope = {
    contractVersion: '1.0.0',
    producerRunId: job.id,
    companyId: payload.companyId,
    moduleId: dispatchModuleId,
    authorityClass: 'DETERMINISTIC',
    mutationClass: 'IMMUTABLE',
    queueClass: 'DISPATCH',
    priorityBand: 'HIGH',
    timeoutClass: 'SHORT',
    idempotencyKey: `promote-${payload.leadId}`,
    replayHash: null,
    controlSnapshotRef: null,
    causationRefs: [trend.id, payload.leadId, payload.treeId],
    expiresAt: null,
  };

  const instructionRows = await db
    .insert(actionInstructions)
    .values({
      companyId: payload.companyId,
      moduleId: dispatchModuleId,
      actionVerb: instruction.actionVerb,
      symbol: instruction.symbol,
      orderType: instruction.orderType,
      timeInForce: instruction.timeInForce,
      quantityRef,
      limitPriceRef: null,
      fillTimeoutRef: timeoutRef,
      guardrailRefs: ['capital_limit_v1', 'session_legality_v1'],
      verificationSchemaVersion: VERIFICATION_SCHEMA_VERSION,
      clientOrderId: `co_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      envelope,
    })
    .returning({ id: actionInstructions.id });
  const instructionId = instructionRows[0]!.id;

  await db.insert(compileEvents).values({
    companyId: payload.companyId,
    treeId: payload.treeId,
    result: 'compiled',
    blockReason: null,
    instructionId,
    lineage: {
      leadId: payload.leadId,
      treeId: payload.treeId,
      instructionId,
      quantityRef,
      stage: 'execution_agent_compile',
      provider,
      tacticalProvider: payload.tacticalProvider ?? 'deterministic_placeholder',
      balanceSource,
      sizingBudgetSource,
      allocationCapCents: allocationCapCents?.toString() ?? null,
      capitalAllocationRef,
    },
  });

  await enqueue(db, clock, {
    queueClass: 'DISPATCH',
    kind: 'dispatch.paper_trade',
    payload: {
      instructionId,
      companyId: payload.companyId,
      moduleId: dispatchModuleId,
      leadId: payload.leadId,
    },
    idempotencyKey: `promote-${payload.leadId}`,
    priority: 'HIGH',
    companyId: payload.companyId,
    moduleId: dispatchModuleId,
  });

  await db
    .update(decisionTrees)
    .set({ status: 'dispatched', updatedAt: now })
    .where(eq(decisionTrees.id, payload.treeId));
  await db
    .update(leadPackages)
    .set({ status: 'decomposed', updatedAt: now })
    .where(eq(leadPackages.id, payload.leadId));
  await db
    .update(trendCandidates)
    .set({ status: 'promoted' })
    .where(eq(trendCandidates.id, trend.id));
});
