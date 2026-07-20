import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { companies, decisionTrees, leadPackages, trendCandidates } from '@hftr/db/schema';
import { getSyntheticQuote } from '../dispatch/quotes';
import { venueDate } from '../calendar/calendar';
import { buildDecisionTree } from '../pipeline/tree';
import { treeFromModelOutput, type ModelBuiltDecisionTree } from '../pipeline/tree-expand';
import { buildEntryOnlyCompositionPlan } from '../pipeline/order-composition';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';
import { estimateLlmJobCost } from '../queue/llm-cost-estimate';

const ExpandPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  leadId: z.string().uuid(),
  trendId: z.string().uuid(),
  targetModuleId: z.string().uuid().optional(),
  controlSnapshot: z.record(z.unknown()),
});

/**
 * TACTICAL queue: expand admitted lead into decision_trees via model gateway
 * (when wired) or deterministic buildDecisionTree fallback.
 */
registerHandler('tactical.expand', async ({ db, clock, job, modelGateway }) => {
  const payload = ExpandPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

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
  const company = (
    await db.select().from(companies).where(eq(companies.id, payload.companyId)).limit(1)
  )[0];
  if (!lead || !trend || !company) return;

  const snapshot = payload.controlSnapshot as {
    sizingBasis?: string;
    sizingBasisBps?: number;
    freshnessWindow?: string;
    strategyFamily?: string;
    philosophyAxes?: Record<string, string>;
    leverState?: Record<string, unknown>;
  };
  const philosophyAxes = snapshot.philosophyAxes
    ? Object.keys(snapshot.philosophyAxes).slice(0, 16)
    : [];
  const strategyFamily =
    typeof snapshot.strategyFamily === 'string' && snapshot.strategyFamily.length > 0
      ? snapshot.strategyFamily
      : lead.strategyFamily;
  const sizingBasis =
    typeof snapshot.sizingBasis === 'string' && snapshot.sizingBasis.length > 0
      ? snapshot.sizingBasis
      : 'risk_appetite_typical';
  const freshnessWindow =
    typeof snapshot.freshnessWindow === 'string' ? snapshot.freshnessWindow : 'default_24h';

  const quote = getSyntheticQuote(trend.symbol, clock);
  const deterministic = buildDecisionTree(
    {
      symbol: trend.symbol,
      direction: trend.direction,
      strategyFamily,
    },
    quote,
  );

  let built: ModelBuiltDecisionTree = deterministic;
  let provider: 'model' | 'deterministic_placeholder' = 'deterministic_placeholder';

  if (modelGateway && process.env.HFTR_LLM_MODE !== 'deterministic') {
    const result = await modelGateway.expandTree({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      jobId: job.id,
      leadId: payload.leadId,
      symbol: trend.symbol,
      direction: trend.direction,
      strategyFamily,
      philosophyAxes,
      sizingBasis,
      freshnessWindow,
    });

    if (result.ok) {
      built = treeFromModelOutput(
        { symbol: trend.symbol, direction: trend.direction },
        result.output,
        deterministic,
      );
      provider = built.sourceClass === 'model_generated' ? 'model' : 'deterministic_placeholder';

      if (result.output.escalateToStrategic) {
        const day = venueDate(clock.nowMs(), 'America/New_York');
        await enqueue(db, clock, {
          queueClass: 'STRATEGIC',
          kind: 'research.strategic',
          costEstimate: estimateLlmJobCost('research.strategic'),
          payload: {
            companyId: payload.companyId,
            moduleId: payload.moduleId,
            topicScope: `tactical_escalation:${trend.symbol}`,
          },
          idempotencyKey: `strategic-tactical-${payload.moduleId}-${trend.symbol}-${day}`,
          priority: 'NORMAL',
          companyId: payload.companyId,
          moduleId: payload.moduleId,
        });
      }
    }
  }

  const leverState =
    typeof snapshot.leverState === 'object' && snapshot.leverState !== null
      ? snapshot.leverState
      : {};

  const treeRows = await db
    .insert(decisionTrees)
    .values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      leadId: payload.leadId,
      symbol: built.symbol,
      status: 'draft',
      branches: built.branches,
      recoveryLadder: built.recoveryLadder,
      leverState,
      sourceClass: built.sourceClass,
    })
    .returning({ id: decisionTrees.id });
  const treeId = treeRows[0]!.id;

  const tradingModuleId =
    typeof payload.targetModuleId === 'string' ? payload.targetModuleId : payload.moduleId;
  const controlSnap = payload.controlSnapshot as {
    policyEnvelopeVersion?: string;
    persistedControlSnapshotId?: string;
    postureOrientationRef?: string | null;
  };
  const compositionPlan = buildEntryOnlyCompositionPlan({
    leadRef: payload.leadId,
    decisionTreeRef: treeId,
    tradingModuleId,
    policyEnvelopeRef: controlSnap.policyEnvelopeVersion ?? null,
    controlSnapshotRef: controlSnap.persistedControlSnapshotId ?? null,
    postureOrientationRef: controlSnap.postureOrientationRef ?? null,
    compositionMode: 'entry_only',
    nowIso: now.toISOString(),
  });

  await enqueue(db, clock, {
    queueClass: 'COMPILE',
    kind: 'compile.select',
    costEstimate: estimateLlmJobCost('compile.select'),
    payload: {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      leadId: payload.leadId,
      treeId,
      trendId: payload.trendId,
      ...(payload.targetModuleId !== undefined ? { targetModuleId: payload.targetModuleId } : {}),
      controlSnapshot: payload.controlSnapshot,
      tacticalProvider: provider,
      compositionPlan,
    },
    idempotencyKey: `compile-select-${treeId}`,
    priority: 'HIGH',
    companyId: payload.companyId,
    moduleId: payload.moduleId,
  });

  await db
    .update(decisionTrees)
    .set({ status: 'compile_ready', updatedAt: now })
    .where(eq(decisionTrees.id, treeId));
});
