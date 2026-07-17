import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@hftr/db';
import {
  actionInstructions,
  companies,
  compileEvents,
  decisionTrees,
  leadPackages,
  moduleLinks,
  modules,
  trendCandidates,
} from '@hftr/db/schema';
import type { HandoffEnvelope } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { record } from '../calc/store';
import { getCompanyBalanceCents } from '../dispatch/paper-trade';
import { getSyntheticQuote } from '../dispatch/quotes';
import { compileInstruction } from '../pipeline/compile';
import { DEFAULT_FRESHNESS_WINDOW_MS, evaluateGates, gatesPass } from '../pipeline/gates';
import { resolvePhilosophyControl } from '../pipeline/philosophy-control';
import { buildDecisionTree } from '../pipeline/tree';
import { enqueue } from '../queue/queue';
import { registerHandler } from './registry';

const PromotePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(), // originating trend module
  trendId: z.string().uuid(),
  targetModuleId: z.string().uuid().optional(),
});

const VERIFICATION_SCHEMA_VERSION = 'trade_verify_v1';
const QUOTE_TTL_MS = 90_000;
const STRICT_FRESHNESS_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Lead promotion spine (RESEARCH queue): trend candidate → six-gate admission
 * (lead_packages) → tactical decomposition (decision_trees) → compile
 * (compile_events + action_instructions) → dispatch.paper_trade enqueue.
 * Every model-tier stage here is a deterministic placeholder, labeled as such
 * in sourceClass/provenance columns; a real model call replaces the pure
 * function without any schema change. Idempotent via `promote-<leadId>` on
 * the downstream trade job; re-runs create fresh lead rows (audit-friendly).
 */
registerHandler('trend.promote', async ({ db, clock, job }) => {
  const payload = PromotePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

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
  if (!trend) {
    // Permanent payload problem; retrying cannot help.
    return;
  }

  const company = (
    await db.select().from(companies).where(eq(companies.id, payload.companyId)).limit(1)
  )[0];
  const trendModule = (
    await db.select().from(modules).where(eq(modules.id, payload.moduleId)).limit(1)
  )[0];
  if (!company || !trendModule) return;

  const moduleConfig = (trendModule.config ?? {}) as { instruments?: string[] };
  const dispatchModuleId = payload.targetModuleId ?? payload.moduleId;

  // Resolve philosophy profile + linked trading/policy module config.
  const companyModules = await db
    .select()
    .from(modules)
    .where(eq(modules.companyId, payload.companyId));
  const tradingModule =
    companyModules.find((m) => m.id === dispatchModuleId && m.type === 'trading') ??
    companyModules.find((m) => m.type === 'trading');
  const tradingConfig = (tradingModule?.config ?? {}) as { strategyFamilies?: string[] };
  const strategyFamily =
    Array.isArray(tradingConfig.strategyFamilies) && tradingConfig.strategyFamilies[0]
      ? tradingConfig.strategyFamilies[0]
      : null;

  const policyLinks = await db
    .select()
    .from(moduleLinks)
    .where(
      and(eq(moduleLinks.companyId, payload.companyId), eq(moduleLinks.linkKind, 'verification')),
    );
  const policyModuleIds = new Set(policyLinks.flatMap((l) => [l.fromModuleId, l.toModuleId]));
  const policyModule = companyModules.find((m) => m.type === 'policy' && policyModuleIds.has(m.id));
  const policyConfig = (policyModule?.config ?? {}) as { policyEnvelopeRef?: string };

  const control = resolvePhilosophyControl({
    philosophyProfile: company.philosophyProfile,
    policyEnvelopeRef: policyConfig.policyEnvelopeRef ?? null,
    strategyFamily,
  });

  // ── 1. Six-gate admission ──────────────────────────────────────────────────
  const session = await getSession(db, 'XNYS', venueDate(clock.nowMs(), 'America/New_York'));
  const freshnessWindowMs =
    control.freshnessWindow === 'strict_12h'
      ? STRICT_FRESHNESS_WINDOW_MS
      : DEFAULT_FRESHNESS_WINDOW_MS;
  const gates = evaluateGates({
    symbol: trend.symbol,
    direction: trend.direction,
    scannedAtMs: trend.scannedAt.getTime(),
    nowMs: clock.nowMs(),
    sessionPhase: sessionPhase(session, clock.nowMs()),
    mode: company.mode,
    instruments: Array.isArray(moduleConfig.instruments) ? moduleConfig.instruments : null,
    freshnessWindowMs,
  });
  const admitted = gatesPass(gates);

  const controlSnapshot = {
    policyEnvelopeVersion: control.policyEnvelopeVersion,
    sizingBasis: control.sizingBasis,
    sizingBasisBps: control.sizingBasisBps,
    freshnessWindow: control.freshnessWindow,
    philosophyAxes: control.philosophyProfile.axes,
    strategyFamily: control.strategyFamily,
    philosophyPromptPresent: company.philosophyPrompt.length > 0,
    sourceClass: control.sourceClass,
  };

  const leadRows = await db
    .insert(leadPackages)
    .values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      targetModuleId: payload.targetModuleId ?? null,
      trendId: trend.id,
      symbol: trend.symbol,
      direction: trend.direction,
      strategyFamily: control.strategyFamily,
      status: admitted ? 'admitted' : 'rejected',
      gates,
      controlSnapshot,
    })
    .returning({ id: leadPackages.id });
  const leadId = leadRows[0]!.id;
  if (!admitted) return;

  // ── 2. Tactical decomposition ──────────────────────────────────────────────
  const quote = getSyntheticQuote(trend.symbol, clock);
  const built = buildDecisionTree({ symbol: trend.symbol, direction: trend.direction }, quote);
  const treeRows = await db
    .insert(decisionTrees)
    .values({
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      leadId,
      symbol: built.symbol,
      status: 'draft',
      branches: built.branches,
      recoveryLadder: built.recoveryLadder,
      leverState: control.leverState,
      sourceClass: built.sourceClass,
    })
    .returning({ id: decisionTrees.id });
  const treeId = treeRows[0]!.id;

  // ── 3. Compile (deterministic placeholder for the execution-agent tier) ───
  const balanceCents = await getCompanyBalanceCents(db, payload.companyId);
  const priceCents = quote.askCents ?? quote.lastCents ?? 0;
  const outcome = compileInstruction(
    {
      symbol: built.symbol,
      direction: trend.direction,
      branches: built.branches,
      recoveryLadder: built.recoveryLadder,
    },
    { balanceCents, priceCents, sizingBasisBps: control.sizingBasisBps },
  );

  if (outcome.result === 'blocked') {
    await db.insert(compileEvents).values({
      companyId: payload.companyId,
      treeId,
      result: 'blocked',
      blockReason: outcome.blockReason,
      instructionId: null,
      lineage: {
        leadId,
        treeId,
        stage: 'execution_agent_compile',
        provider: 'deterministic_placeholder',
      },
    });
    await db
      .update(decisionTrees)
      .set({ status: 'compile_blocked', updatedAt: now })
      .where(eq(decisionTrees.id, treeId));
    await db
      .update(leadPackages)
      .set({ status: 'decomposed', updatedAt: now })
      .where(eq(leadPackages.id, leadId));
    return;
  }

  // ── 4. Instruction row (all value-bearing fields as ValueRefs) ─────────────
  const quantityRef = await record(db, clock, {
    kind: 'quantity',
    unit: 'shares',
    scale: 0,
    valueInt: BigInt(outcome.instruction.quantity),
    sourceClass: 'derived',
    sourceId: `compile_placeholder:sizing:${leadId}:bps_${control.sizingBasisBps}`,
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
    idempotencyKey: `promote-${leadId}`,
    replayHash: null,
    controlSnapshotRef: null,
    causationRefs: [trend.id, leadId, treeId],
    expiresAt: null,
  };
  const instructionRows = await db
    .insert(actionInstructions)
    .values({
      companyId: payload.companyId,
      moduleId: dispatchModuleId,
      actionVerb: outcome.instruction.actionVerb,
      symbol: outcome.instruction.symbol,
      orderType: outcome.instruction.orderType,
      timeInForce: outcome.instruction.timeInForce,
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
    treeId,
    result: 'compiled',
    blockReason: null,
    instructionId,
    lineage: {
      leadId,
      treeId,
      instructionId,
      quantityRef,
      stage: 'execution_agent_compile',
      provider: 'deterministic_placeholder',
    },
  });

  // ── 5. Hand off to deterministic dispatch (same path as the trade route) ──
  await enqueue(db, clock, {
    queueClass: 'DISPATCH',
    kind: 'dispatch.paper_trade',
    payload: {
      companyId: payload.companyId,
      moduleId: dispatchModuleId,
      symbol: outcome.instruction.symbol,
      actionVerb: outcome.instruction.actionVerb,
      orderType: outcome.instruction.orderType,
      quantity: outcome.instruction.quantity,
      limitPriceCents: null,
      // Lineage back to the pipeline spine (ignored by the trade handler's
      // schema, used by the trace timeline read model via the jobs table).
      leadId,
    },
    idempotencyKey: `promote-${leadId}`,
    priority: 'HIGH',
    companyId: payload.companyId,
    moduleId: dispatchModuleId,
  });

  await db
    .update(decisionTrees)
    .set({ status: 'dispatched', updatedAt: now })
    .where(eq(decisionTrees.id, treeId));
  await db
    .update(leadPackages)
    .set({ status: 'decomposed', updatedAt: now })
    .where(eq(leadPackages.id, leadId));
  await db
    .update(trendCandidates)
    .set({ status: 'promoted' })
    .where(eq(trendCandidates.id, trend.id));
});
