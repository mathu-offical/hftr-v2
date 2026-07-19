import { randomUUID } from 'node:crypto';
import { and, eq, gte } from 'drizzle-orm';
import type {
  BrokerAdapter,
  DeterministicActionTask,
  GuardrailEvaluation,
  HandoffEnvelope,
  LimitsSnapshot,
  QuoteSnapshot,
  Venue,
} from '@hftr/contracts';
import {
  resolveTradingExecutionBinding,
  shouldShadowVerifyOnProvider,
  TradingModuleConfig,
  usesProviderAsPrimaryBook,
  type PaperRoutingMode,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  actionInstructions,
  actionTraces,
  compileEvents,
  deterministicTasks,
  dispatchReconciliationEvents,
  ledgerEntries,
  modules,
  verificationRecords,
} from '@hftr/db/schema';
import type { Clock } from '../clock';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { record } from '../calc/store';
import { evaluateGuardrails } from '../guardrails/evaluate';
import { computeOperatingLimits } from '../limits/compute';
import type { LimitContext } from '../limits/context';
import { enqueue } from '../queue/queue';
import {
  getCompanyBalanceCents,
  getDailyRealizedLossCents,
  resolveDispatchSpendAuthority,
  resolveEquityCentsForLimits,
} from './balances';
import { materializeChildSliceFills, normalizeChildSlicesForDrain } from './child-slice-fills';
import { planChildSlices } from './child-order-scheduler';
import { buildFillVerificationFields } from './fill-verification';
import { startTimeSpacedChildDrain } from './paper-trade-child-drain';
import type { PaperTradeRequest, PaperTradeResult } from './paper-trade-types';
export type { PaperTradeRequest, PaperTradeResult } from './paper-trade-types';
import { resolveExecutionContext } from './execution-context';
import { feeCentsFromNotional } from './fees';
import { preDispatchGauntlet } from './pre-dispatch';
import { applyFill, getPosition } from './positions';
import {
  InstructionFinalizeError,
  finalizeErrorToFailureCode,
  resolveInstructionFromRefs,
  type ResolvedInstruction,
} from './instruction-finalizer';
import { recomputeCompanyEquity } from '../equity/recompute';
import { shadowVerifyAndPersistBookDelta } from '../paper/book-delta';
import { computeInternalPaperCoreFill } from '../paper/internal-paper-core';
import { resolveDispatchMarketQuote } from '../paper/market-model';
import { resolvePaperFillSlippage } from '../paper/resolve-slippage-bps';

/**
 * The deterministic paper-trade path (broker-integration.md, dispatch README):
 * record values → instruction → pre-dispatch gauntlet → finalize task →
 * venue submit/fill → immutable trace → verification → ledger.
 *
 * Compile path: resolve existing `action_instructions` ValueRefs via
 * `executePaperTradeFromInstruction` (no raw quantity on the job payload).
 * Operator path: UI form still records operator_input refs then inserts an instruction.
 */

const POLICY_ENVELOPE_VERSION = 'paper_balanced_general_v1';
const VERIFICATION_SCHEMA_VERSION = 'trade_verify_v1';
const MAX_QUANTITY = 100_000;
const QUOTE_TTL_MS = 90_000;
const DEFAULT_BROKER_ENVELOPE_ID = 'bpe-001';
const DEFAULT_GUARDRAIL_PACKAGE_IDS = ['grd-001', 'grd-003'] as const;
const ORDER_FREQ_WINDOW_MS = 60_000;

export { getCompanyBalanceCents } from './balances';
export {
  getCompanyRealizedLossCents,
  getDailyRealizedLossCents,
  getModuleBalanceCents,
  resolveCompileBalanceCents,
  resolveEquityCentsForLimits,
} from './balances';

/**
 * Promote/compile dispatch path: resolve `action_instructions` ValueRefs then
 * run the same paper gauntlet/fill path without re-deriving quantity from the job.
 */
export async function executePaperTradeFromInstruction(
  db: Db,
  clock: Clock,
  args: { instructionId: string; jobId?: string | null },
): Promise<PaperTradeResult> {
  let resolved: ResolvedInstruction;
  try {
    resolved = await resolveInstructionFromRefs(db, clock, args.instructionId);
  } catch (err) {
    if (err instanceof InstructionFinalizeError) {
      return {
        outcome: 'blocked',
        failureCode: finalizeErrorToFailureCode(err.code),
        detail: err.message,
        traceId: null,
        fillPriceCents: null,
        notionalCents: null,
        balanceAfterCents: null,
      };
    }
    throw err;
  }

  if (resolved.actionVerb !== 'buy' && resolved.actionVerb !== 'sell') {
    return {
      outcome: 'blocked',
      failureCode: 'broker_policy_block',
      detail: `unsupported actionVerb for paper dispatch: ${resolved.actionVerb}`,
      traceId: null,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }
  if (resolved.orderType !== 'market' && resolved.orderType !== 'limit') {
    return {
      outcome: 'blocked',
      failureCode: 'broker_policy_block',
      detail: `unsupported orderType for paper dispatch: ${resolved.orderType}`,
      traceId: null,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }
  if (resolved.quantityScale !== 0) {
    return {
      outcome: 'blocked',
      failureCode: 'numeric_sanity_block',
      detail: 'compiled quantity scale must be 0 for paper dispatch',
      traceId: null,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }
  const quantity = Number(resolved.quantityInt);
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    return {
      outcome: 'blocked',
      failureCode: 'numeric_sanity_block',
      detail: 'compiled quantity out of bounds',
      traceId: null,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }

  return executePaperTrade(db, clock, {
    companyId: resolved.companyId,
    moduleId: resolved.moduleId,
    symbol: resolved.symbol,
    actionVerb: resolved.actionVerb,
    orderType: resolved.orderType,
    quantity,
    limitPriceCents: resolved.limitPriceCents,
    ...(args.jobId !== undefined ? { jobId: args.jobId } : {}),
    compiled: resolved,
  });
}

export async function executePaperTrade(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest & { compiled?: ResolvedInstruction },
): Promise<PaperTradeResult> {
  const compiled = req.compiled;

  const moduleRows = await db
    .select({ config: modules.config, type: modules.type })
    .from(modules)
    .where(and(eq(modules.id, req.moduleId), eq(modules.companyId, req.companyId)))
    .limit(1);
  const moduleRow = moduleRows[0];
  const tradingConfig =
    moduleRow?.type === 'trading'
      ? TradingModuleConfig.safeParse(moduleRow.config)
      : null;
  const executionBinding = resolveTradingExecutionBinding(
    tradingConfig?.success
      ? { executionBinding: tradingConfig.data.executionBinding ?? null }
      : {},
  );
  const routingMode: PaperRoutingMode = executionBinding.routingMode;
  const primaryOnProvider = usesProviderAsPrimaryBook(routingMode);
  const shadowVerify = shouldShadowVerifyOnProvider(routingMode);

  let execCtx;
  try {
    execCtx = await resolveExecutionContext(
      db,
      clock,
      req.companyId,
      executionBinding.brokerConnectionId
        ? { brokerConnectionId: executionBinding.brokerConnectionId }
        : undefined,
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : 'dispatch_error';
    if (code === 'live_gate_blocked' || code === 'broker_connection_not_connected') {
      return blockedSimple(db, req, code, code);
    }
    throw err;
  }

  const { adapter, venue, brokerConnectionId } = execCtx;

  const envelope: HandoffEnvelope = compiled
    ? {
        ...compiled.envelope,
        causationRefs: [...compiled.envelope.causationRefs, ...(req.jobId ? [req.jobId] : [])],
      }
    : {
        contractVersion: '1.0.0',
        producerRunId: null,
        companyId: req.companyId,
        moduleId: req.moduleId,
        authorityClass: 'OPERATOR_INPUT',
        mutationClass: 'IMMUTABLE',
        queueClass: 'DISPATCH',
        priorityBand: 'HIGH',
        timeoutClass: 'SHORT',
        idempotencyKey: `ptrade-${randomUUID()}`,
        replayHash: null,
        controlSnapshotRef: null,
        causationRefs: req.jobId ? [req.jobId] : [],
        expiresAt: null,
      };

  if (!Number.isInteger(req.quantity) || req.quantity <= 0 || req.quantity > MAX_QUANTITY) {
    return blockedSimple(db, req, 'numeric_sanity_block', 'quantity out of bounds', venue);
  }

  if ((primaryOnProvider || shadowVerify) && venue === 'paper_sim') {
    return blockedSimple(
      db,
      req,
      'broker_policy_block',
      primaryOnProvider
        ? 'execute_on_service requires a connected paper service'
        : 'both_verify requires a connected paper service',
      venue,
    );
  }

  // D-171: MarketModel teacher — bound adapter quote, else owner Alpaca paper
  // read-only quote, else synthetic. funds_only + paper_sim stays internal fill.
  const market = await resolveDispatchMarketQuote({
    db,
    clock,
    companyId: req.companyId,
    symbol: req.symbol,
    adapter,
  });
  if (!market.usedLive && primaryOnProvider) {
    return blockedSimple(db, req, 'broker_policy_block', 'quote unavailable', venue);
  }
  const quote = market.quote;
  const usesLiveMarketQuote = market.usedLive;
  const usedPriorSessionMark = market.priorSessionMark === true;

  const quoteRef = await record(db, clock, {
    kind: 'price',
    unit: 'USD_cents',
    scale: 0,
    valueInt: BigInt(quote.lastCents ?? quote.askCents ?? 0),
    sourceClass: market.sourceClass,
    sourceId: usesLiveMarketQuote
      ? `${venue}:quote:${quote.symbol}`
      : `synthetic_sim:${quote.symbol}`,
    ttlMs: QUOTE_TTL_MS,
    companyId: req.companyId,
    moduleId: req.moduleId,
  });

  let quantityRef: string;
  let timeoutRef: string;
  let limitRef: string | null;
  let clientOrderId: string;
  let instructionId: string;
  let fillTimeoutMs: number;
  let timeInForce: DeterministicActionTask['timeInForce'];

  if (compiled) {
    quantityRef = compiled.lineage.quantityRef;
    timeoutRef = compiled.lineage.fillTimeoutRef;
    limitRef = compiled.lineage.limitPriceRef;
    clientOrderId = compiled.clientOrderId;
    instructionId = compiled.instructionId;
    fillTimeoutMs = compiled.fillTimeoutMs;
    timeInForce = compiled.timeInForce;
  } else {
    quantityRef = await record(db, clock, {
      kind: 'quantity',
      unit: 'shares',
      scale: 0,
      valueInt: BigInt(req.quantity),
      sourceClass: 'operator_input',
      sourceId: 'ui:paper_trade_form',
      ttlMs: 10 * 60_000,
      sanity: { minInt: '1', maxInt: String(MAX_QUANTITY), maxAgeMs: null, mustBePositive: true },
      companyId: req.companyId,
      moduleId: req.moduleId,
    });
    timeoutRef = await record(db, clock, {
      kind: 'duration_ms',
      unit: 'ms',
      scale: 0,
      valueInt: 30_000n,
      timezone: 'UTC',
      sourceClass: 'band_seed',
      sourceId: 'band:fill_timeout:typical',
      ttlMs: 10 * 60_000,
      companyId: req.companyId,
      moduleId: req.moduleId,
    });
    limitRef =
      req.orderType === 'limit' && req.limitPriceCents != null
        ? await record(db, clock, {
            kind: 'price',
            unit: 'USD_cents',
            scale: 0,
            valueInt: BigInt(req.limitPriceCents),
            sourceClass: 'operator_input',
            sourceId: 'ui:paper_trade_form',
            ttlMs: 10 * 60_000,
            companyId: req.companyId,
            moduleId: req.moduleId,
          })
        : null;

    clientOrderId = `co_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    fillTimeoutMs = 30_000;
    timeInForce = 'day';
    const instructionRows = await db
      .insert(actionInstructions)
      .values({
        companyId: req.companyId,
        moduleId: req.moduleId,
        actionVerb: req.actionVerb,
        symbol: quote.symbol,
        orderType: req.orderType,
        timeInForce,
        quantityRef,
        limitPriceRef: limitRef,
        fillTimeoutRef: timeoutRef,
        guardrailRefs: ['capital_limit_v1', 'session_legality_v1'],
        verificationSchemaVersion: VERIFICATION_SCHEMA_VERSION,
        clientOrderId,
        envelope,
      })
      .returning({ id: actionInstructions.id });
    instructionId = instructionRows[0]!.id;
  }

  const session = await getSession(db, 'XNYS', venueDate(clock.nowMs(), 'America/New_York'));
  const phase = sessionPhase(session, clock.nowMs());
  const sessionSnapshot = {
    venueCalendar: 'XNYS',
    phase,
    checkedAtRef: quoteRef,
    enforced: venue !== 'paper_sim',
  };

  if (req.actionVerb === 'sell') {
    const held = await getPosition(db, req.moduleId, quote.symbol);
    if (!held || held.qty < BigInt(req.quantity)) {
      await db
        .update(actionInstructions)
        .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
        .where(eq(actionInstructions.id, instructionId));
      return blocked(
        db,
        clock,
        req,
        envelope,
        'broker_policy_block',
        'sell exceeds held quantity (no shorting in paper)',
        sessionSnapshot,
        venue,
      );
    }
  }

  const referenceCents = quote.askCents ?? quote.lastCents ?? 0;
  const notionalCents = req.quantity * referenceCents;
  const spendAuthority = await resolveDispatchSpendAuthority(db, req.companyId, req.moduleId);
  if (req.actionVerb === 'buy') {
    let effectiveBalance = spendAuthority.spendCapCents;
    if (venue !== 'paper_sim') {
      const brokerBalances = await adapter.getBalances();
      const brokerBp = BigInt(brokerBalances.buyingPowerCents);
      effectiveBalance = effectiveBalance < brokerBp ? effectiveBalance : brokerBp;
    }
    if (BigInt(notionalCents) > effectiveBalance) {
      const isolation =
        spendAuthority.isolationActive &&
        BigInt(notionalCents) <= spendAuthority.companyPoolCents;
      await db
        .update(actionInstructions)
        .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
        .where(eq(actionInstructions.id, instructionId));
      return blocked(
        db,
        clock,
        req,
        envelope,
        isolation ? 'capital_isolation_block' : 'capital_limit_block',
        isolation
          ? 'notional exceeds this engine’s allocated capital (explicit share required)'
          : 'notional exceeds effective buying power',
        sessionSnapshot,
        venue,
      );
    }
  }

  const task: DeterministicActionTask = {
    instructionRef: instructionId,
    symbol: quote.symbol,
    actionVerb: req.actionVerb,
    orderType: req.orderType,
    timeInForce,
    quantityInt: String(req.quantity),
    quantityScale: 0,
    limitPriceCents: req.limitPriceCents ?? null,
    stopPriceCents: compiled?.stopPriceCents ?? null,
    fillTimeoutMs,
    idempotencyKey: envelope.idempotencyKey,
    clientOrderId,
    lineage: { quantityRef, limitPriceRef: limitRef, fillTimeoutRef: timeoutRef },
  };
  const taskRows = await db
    .insert(deterministicTasks)
    .values({ instructionId, payload: task, idempotencyKey: task.idempotencyKey })
    .returning({ id: deterministicTasks.id });
  const taskId = taskRows[0]!.id;

  const referenceCentsForGauntlet = quote.askCents ?? quote.lastCents ?? 0;
  let effectiveCapCents = spendAuthority.spendCapCents;
  let brokerBuyingPowerCents: bigint | undefined;
  if (venue !== 'paper_sim') {
    try {
      const brokerBalances = await adapter.getBalances();
      brokerBuyingPowerCents = BigInt(brokerBalances.buyingPowerCents);
      effectiveCapCents =
        effectiveCapCents < brokerBuyingPowerCents ? effectiveCapCents : brokerBuyingPowerCents;
    } catch {
      await db
        .update(deterministicTasks)
        .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
        .where(eq(deterministicTasks.id, taskId));
      await db
        .update(actionInstructions)
        .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
        .where(eq(actionInstructions.id, instructionId));
      return blocked(
        db,
        clock,
        req,
        envelope,
        'broker_policy_block',
        'broker buying power unavailable for pre-dispatch gauntlet',
        sessionSnapshot,
        venue,
      );
    }
  }

  let limitsSnapshot: LimitsSnapshot;
  let guardrailEvaluations: GuardrailEvaluation[];
  try {
    const nowMs = clock.nowMs();
    const recentTraceTimestampsMs = await loadRecentDispatchTraceTimestamps(
      db,
      req.companyId,
      nowMs,
    );
    const activeGuardrailPackageIds = await resolveActiveGuardrailPackageIds(db, req.moduleId);
    const sessionOpenMs = session?.openMsUtc ?? nowMs - 24 * 60 * 60 * 1000;
    const realizedLossCents = await getDailyRealizedLossCents(db, req.companyId, sessionOpenMs);
    const { equityCents } = await resolveEquityCentsForLimits(
      db,
      req.companyId,
      execCtx.virtualBalanceCents,
    );
    const limitCtx: LimitContext = {
      companyId: req.companyId,
      moduleId: req.moduleId,
      mode: execCtx.companyMode,
      nowMs,
      sessionPhase: phase,
      virtualBalanceCents: execCtx.virtualBalanceCents,
      equityCents,
      realizedLossCents,
      brokerEnvelopeId: DEFAULT_BROKER_ENVELOPE_ID,
      recentTraceTimestampsMs,
    };
    if (brokerBuyingPowerCents !== undefined) {
      limitCtx.brokerBuyingPowerCents = brokerBuyingPowerCents;
    }
    limitsSnapshot = computeOperatingLimits(limitCtx);

    const quoteAsOfMs = Date.parse(quote.asOfIso);
    const quoteFreshnessStale = !Number.isFinite(quoteAsOfMs) || nowMs - quoteAsOfMs > QUOTE_TTL_MS;
    guardrailEvaluations = evaluateGuardrails({
      nowMs,
      sessionPhase: phase,
      mode: execCtx.companyMode,
      activePackageIds: activeGuardrailPackageIds,
      quoteFreshnessStale,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'catalog or limits evaluation failed';
    await db
      .update(deterministicTasks)
      .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, taskId));
    await db
      .update(actionInstructions)
      .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
      .where(eq(actionInstructions.id, instructionId));
    return blocked(
      db,
      clock,
      req,
      envelope,
      'limits_block',
      `pre-dispatch safety evaluation failed closed: ${detail}`,
      sessionSnapshot,
      venue,
    );
  }

  const gauntlet = preDispatchGauntlet(task, {
    mode: execCtx.companyMode,
    sessionPhase: phase,
    effectiveCapCents,
    priceCents: referenceCentsForGauntlet,
    // D-085: wire from resolveExecutionContext (isLiveDispatchAllowed) — not hardcoded.
    liveGateBlocked: execCtx.liveGateBlocked,
    maxQuantity: MAX_QUANTITY,
    limitsSnapshot,
    guardrailEvaluations,
  });
  if (!gauntlet.ok) {
    await db
      .update(deterministicTasks)
      .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, taskId));
    await db
      .update(actionInstructions)
      .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
      .where(eq(actionInstructions.id, instructionId));
    return blocked(
      db,
      clock,
      req,
      envelope,
      gauntlet.failureCode ?? 'broker_policy_block',
      gauntlet.detail,
      sessionSnapshot,
      venue,
    );
  }

  if (primaryOnProvider && venue !== 'paper_sim') {
    return executeVenueTrade(db, clock, req, {
      adapter,
      venue,
      brokerConnectionId,
      task,
      taskId,
      instructionId,
      clientOrderId,
      quote,
      quoteRef,
      sessionSnapshot,
      routingMode,
    });
  }

  const compilePlan = compiled ? await loadCompileDrainPlan(db, instructionId) : null;
  const compileSlices = compilePlan?.slices ?? null;
  const urgencyScalar = compilePlan?.urgencyScalar ?? 1.2;
  const operatorParticipationPct = 40;
  // Operator path: when no compile plan, still POV-slice qty≥2 so multi-share
  // opportunistic entries get honest partial-fill legs (same planner as compile).
  const slicesForDrain =
    compileSlices ??
    (req.quantity >= 2 && !compiled
      ? planChildSlices({
          parentQty: req.quantity,
          participationPct: operatorParticipationPct,
          urgencyScalar: 1.2,
          childSliceFraction: 0.6,
        }).slices
      : null);
  const participationForImpact =
    compilePlan?.participationPct ??
    (slicesForDrain != null && req.quantity >= 2 && !compiled
      ? operatorParticipationPct
      : undefined);
  const fillSlippage = resolvePaperFillSlippage({
    slippagePosition: 'typical',
    ...(participationForImpact !== undefined
      ? { participationPct: participationForImpact }
      : {}),
  });
  const fill = computeFill(task, quote, fillSlippage.totalSlippageBps);
  if (!fill.ok) {
    await db
      .update(deterministicTasks)
      .set({ status: 'rejected', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, taskId));
    const traceId = await writeTrace(
      db,
      req,
      taskId,
      'rejected',
      [],
      sessionSnapshot,
      'broker_policy_block',
      venue,
    );
    await db.insert(verificationRecords).values({
      traceId,
      taskId,
      result: 'blocked',
      fieldResults: [{ field: 'fill', pass: false, detail: fill.reason }],
      failureCode: 'broker_policy_block',
    });
    return {
      outcome: 'rejected',
      failureCode: 'broker_policy_block',
      detail: fill.reason,
      traceId,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }

  const normalizedSlices = normalizeChildSlicesForDrain(req.quantity, slicesForDrain);

  if (normalizedSlices && normalizedSlices.length >= 2) {
    return startTimeSpacedChildDrain(db, clock, req, {
      task,
      taskId,
      instructionId,
      slices: normalizedSlices,
      basePriceCents: fill.priceCents,
      venueOrderId: fill.venueOrderId,
      quoteRef,
      quote,
      sessionSnapshot,
      venue,
      brokerConnectionId: brokerConnectionId ?? null,
      urgencyScalar,
      usedLiveMarketQuote: usesLiveMarketQuote,
      routingMode,
      shadowVerify: shadowVerify && venue !== 'paper_sim',
      usedMarketImpactProxy: fillSlippage.usedMarketImpactProxy,
      usedPriorSessionMark,
    });
  }

  const childMaterialized = materializeChildSliceFills({
    parentQty: req.quantity,
    slices: slicesForDrain,
    basePriceCents: fill.priceCents,
    actionVerb: req.actionVerb,
    quoteRef,
    venueOrderId: fill.venueOrderId,
  });

  const result = await finalizeFilledTrade(db, clock, req, {
    task,
    taskId,
    instructionId,
    fillPriceCents: childMaterialized.vwapCents,
    venueOrderId: fill.venueOrderId,
    quote,
    quoteRef,
    sessionSnapshot,
    venue,
    brokerConnectionId,
    childFills: childMaterialized.fills,
    usedChildDrain: childMaterialized.usedChildDrain,
    simulatorGapTags: internalPaperFillGapTags({
      outcome: 'filled',
      usedLiveMarketQuote: usesLiveMarketQuote,
      routingMode,
      usedChildDrain: childMaterialized.usedChildDrain,
      shadowVerifyAttempted: shadowVerify && venue !== 'paper_sim',
      usedMarketImpactProxy: fillSlippage.usedMarketImpactProxy,
      usedPriorSessionMark,
    }),
  });

  if (
    shadowVerify &&
    venue !== 'paper_sim' &&
    result.outcome === 'filled' &&
    result.fillPriceCents != null
  ) {
    try {
      await shadowVerifyAndPersistBookDelta(db, clock, {
        adapter,
        task,
        shadowClientOrderId: `bv_${clientOrderId}`.slice(0, 48),
        internalPriceCents: result.fillPriceCents,
        companyId: req.companyId,
        engineModuleId: req.moduleId,
        instructionId,
        traceId: result.traceId,
        routingMode,
        feedClassInternal: usesLiveMarketQuote ? 'live_market_quote' : 'synthetic_quote',
        fillTimeoutMs: task.fillTimeoutMs,
      });
    } catch {
      // Shadow verify must not fail the authoritative internal fill.
    }
  }

  return result;
}

async function loadCompileDrainPlan(
  db: Db,
  instructionId: string,
): Promise<{ slices: unknown; urgencyScalar: number; participationPct?: number }> {
  const rows = await db
    .select({ lineage: compileEvents.lineage })
    .from(compileEvents)
    .where(eq(compileEvents.instructionId, instructionId))
    .limit(1);
  const lineage = rows[0]?.lineage;
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) {
    return { slices: null, urgencyScalar: 1.2 };
  }
  const record = lineage as {
    childSlices?: unknown;
    urgencyScalar?: unknown;
    participationPct?: unknown;
  };
  const urgencyScalar =
    typeof record.urgencyScalar === 'number' && Number.isFinite(record.urgencyScalar)
      ? record.urgencyScalar
      : 1.2;
  const participationPct =
    typeof record.participationPct === 'number' && Number.isFinite(record.participationPct)
      ? record.participationPct
      : undefined;
  return {
    slices: record.childSlices ?? null,
    urgencyScalar,
    ...(participationPct !== undefined ? { participationPct } : {}),
  };
}

interface VenueTradeContext {
  adapter: BrokerAdapter;
  venue: Venue;
  brokerConnectionId: string | null;
  task: DeterministicActionTask;
  taskId: string;
  instructionId: string;
  clientOrderId: string;
  quote: QuoteSnapshot;
  quoteRef: string;
  sessionSnapshot: Record<string, unknown>;
  /** D-122 routing; both_verify Phase 1 still uses venue submit. */
  routingMode?: PaperRoutingMode;
}

async function executeVenueTrade(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
  ctx: VenueTradeContext,
): Promise<PaperTradeResult> {
  const {
    adapter,
    task,
    taskId,
    instructionId,
    clientOrderId,
    quote,
    quoteRef,
    sessionSnapshot,
    venue,
    brokerConnectionId,
  } = ctx;

  if (adapter.getOrderByClientId) {
    const existing = await adapter.getOrderByClientId(clientOrderId);
    if (existing?.status === 'filled' && existing.avgFillPriceCents != null) {
      return finalizeFilledTrade(db, clock, req, {
        task,
        taskId,
        instructionId,
        fillPriceCents: existing.avgFillPriceCents,
        venueOrderId: existing.venueOrderId,
        quote,
        quoteRef,
        sessionSnapshot,
        venue,
        brokerConnectionId,
      });
    }
  }

  let submitResult;
  try {
    submitResult = await withTimeout(adapter.submitOrder(task), task.fillTimeoutMs);
  } catch {
    await recordReconciliation(db, {
      companyId: req.companyId,
      connectionId: brokerConnectionId,
      clientOrderId,
      venueOrderId: null,
      eventKind: 'timeout',
      payload: { phase: 'submit', taskId },
      requestId: null,
    });
    await enqueueReconcile(db, clock, req, taskId, clientOrderId, brokerConnectionId);
    await db
      .update(deterministicTasks)
      .set({ status: 'pending', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, taskId));
    const traceId = await writeTrace(
      db,
      req,
      taskId,
      'blocked',
      [],
      sessionSnapshot,
      'broker_policy_block',
      venue,
      [],
    );
    return {
      outcome: 'blocked',
      failureCode: 'broker_policy_block',
      detail: 'submit timeout — reconciliation enqueued',
      traceId,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }

  await recordReconciliation(db, {
    companyId: req.companyId,
    connectionId: brokerConnectionId,
    clientOrderId: submitResult.clientOrderId ?? clientOrderId,
    venueOrderId: submitResult.venueOrderId,
    eventKind: 'submit',
    payload: { accepted: submitResult.accepted, rejectReason: submitResult.rejectReason },
    requestId: submitResult.requestId ?? null,
  });

  if (!submitResult.accepted) {
    await db
      .update(deterministicTasks)
      .set({ status: 'rejected', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, taskId));
    const traceId = await writeTrace(
      db,
      req,
      taskId,
      'rejected',
      [],
      sessionSnapshot,
      'broker_policy_block',
      venue,
      [],
    );
    await db.insert(verificationRecords).values({
      traceId,
      taskId,
      result: 'blocked',
      fieldResults: [
        { field: 'submit', pass: false, detail: submitResult.rejectReason ?? 'rejected' },
      ],
      failureCode: 'broker_policy_block',
    });
    return {
      outcome: 'rejected',
      failureCode: 'broker_policy_block',
      detail: submitResult.rejectReason ?? 'venue rejected order',
      traceId,
      fillPriceCents: null,
      notionalCents: null,
      balanceAfterCents: null,
    };
  }

  const orderSnap = adapter.getOrderByClientId
    ? await adapter.getOrderByClientId(submitResult.clientOrderId ?? clientOrderId)
    : null;

  if (orderSnap?.status === 'filled' && orderSnap.avgFillPriceCents != null) {
    return finalizeFilledTrade(db, clock, req, {
      task,
      taskId,
      instructionId,
      fillPriceCents: orderSnap.avgFillPriceCents,
      venueOrderId: orderSnap.venueOrderId,
      quote,
      quoteRef,
      sessionSnapshot,
      venue,
      brokerConnectionId,
    });
  }

  await recordReconciliation(db, {
    companyId: req.companyId,
    connectionId: brokerConnectionId,
    clientOrderId: submitResult.clientOrderId ?? clientOrderId,
    venueOrderId: submitResult.venueOrderId,
    eventKind: 'poll',
    payload: { status: orderSnap?.status ?? 'unknown', taskId },
    requestId: submitResult.requestId ?? null,
  });
  await enqueueReconcile(db, clock, req, taskId, clientOrderId, brokerConnectionId);
  await db
    .update(deterministicTasks)
    .set({
      status: 'pending',
      venueOrderId: submitResult.venueOrderId,
      updatedAt: new Date(clock.nowMs()),
    })
    .where(eq(deterministicTasks.id, taskId));

  const traceId = await writeTrace(
    db,
    req,
    taskId,
    'blocked',
    [],
    sessionSnapshot,
    'broker_policy_block',
    venue,
    [],
  );
  return {
    outcome: 'blocked',
    failureCode: 'broker_policy_block',
    detail: 'order indeterminate — reconciliation enqueued',
    traceId,
    fillPriceCents: null,
    notionalCents: null,
    balanceAfterCents: null,
  };
}

export interface FinalizeRecoveredVenueFillArgs {
  companyId: string;
  moduleId: string;
  taskId: string;
  instructionId: string;
  symbol: string;
  actionVerb: 'buy' | 'sell';
  quantity: number;
  fillPriceCents: number;
  venueOrderId: string;
  quote: QuoteSnapshot;
  quoteRef: string;
  sessionSnapshot: Record<string, unknown>;
  venue: Venue;
  limitPriceCents: number | null;
  quantityInt: string;
  /** Broker connection for position provenance when known (D-090). */
  brokerConnectionId?: string | null;
}

interface FinalizeContext {
  task: DeterministicActionTask;
  taskId: string;
  instructionId: string;
  fillPriceCents: number;
  venueOrderId: string;
  quote: QuoteSnapshot;
  quoteRef: string;
  sessionSnapshot: Record<string, unknown>;
  venue: Venue;
  brokerConnectionId?: string | null;
  /** POV child fill legs when compile planned multiple slices. */
  childFills?: Array<{
    qtyInt: string;
    qtyScale: number;
    priceCents: number;
    atRef: string;
    sliceIndex?: number;
    venueOrderId?: string;
  }>;
  usedChildDrain?: boolean;
  /** D-122: honest gap tags for internal paper fills (including funds_only + live quote). */
  simulatorGapTags?: string[];
}

interface AppliedVenueFill {
  traceId: string;
  verifyPass: boolean;
  actualNotional: number;
  balanceAfter: bigint;
}

async function applyVenueFillFinalization(
  db: Db,
  clock: Clock,
  args: FinalizeRecoveredVenueFillArgs & {
    traceOutcome: 'filled' | 'recovered';
    childFills?: FinalizeContext['childFills'];
    usedChildDrain?: boolean;
    simulatorGapTags?: string[];
  },
): Promise<AppliedVenueFill> {
  const {
    companyId,
    moduleId,
    taskId,
    instructionId,
    symbol,
    actionVerb,
    quantity,
    fillPriceCents,
    venueOrderId,
    quote,
    quoteRef,
    sessionSnapshot,
    venue,
    limitPriceCents,
    quantityInt,
    traceOutcome,
    brokerConnectionId,
    childFills,
    usedChildDrain,
    simulatorGapTags,
  } = args;

  const fillRecords =
    childFills && childFills.length > 0
      ? childFills.map((f) => ({
          qtyInt: f.qtyInt,
          qtyScale: f.qtyScale,
          priceCents: f.priceCents,
          atRef: f.atRef,
          ...(f.sliceIndex !== undefined ? { sliceIndex: f.sliceIndex } : {}),
          ...(f.venueOrderId !== undefined ? { childVenueOrderId: f.venueOrderId } : {}),
        }))
      : [
          {
            qtyInt: quantityInt,
            qtyScale: 0,
            priceCents: fillPriceCents,
            atRef: quoteRef,
          },
        ];

  await db
    .update(deterministicTasks)
    .set({ status: 'filled', venueOrderId, updatedAt: new Date(clock.nowMs()) })
    .where(eq(deterministicTasks.id, taskId));
  await db
    .update(actionInstructions)
    .set({ status: 'dispatched', updatedAt: new Date(clock.nowMs()) })
    .where(eq(actionInstructions.id, instructionId));

  const traceId = await writeFillTrace(db, {
    companyId,
    moduleId,
    taskId,
    outcome: traceOutcome,
    fills: fillRecords,
    sessionSnapshot,
    failureCode: null,
    venue,
    usedChildDrain: usedChildDrain === true,
    ...(simulatorGapTags !== undefined ? { simulatorGapTags } : {}),
  });

  const fieldResults = buildFillVerificationFields({
    quantity,
    quantityInt,
    fillPriceCents,
    quoteLastCents: quote.lastCents,
    actionVerb,
    limitPriceCents,
  });
  const verifyPass = fieldResults.every((f) => f.pass);
  await db.insert(verificationRecords).values({
    traceId,
    taskId,
    result: verifyPass ? 'pass' : 'fail',
    fieldResults,
    failureCode: verifyPass ? null : 'verification_schema_block',
  });

  await applyFill(db, {
    companyId,
    moduleId,
    symbol,
    side: actionVerb,
    qty: quantity,
    priceCents: fillPriceCents,
    connectionId: brokerConnectionId ?? null,
    venue,
    traceId,
  });
  const actualNotional = quantity * fillPriceCents;
  const delta = actionVerb === 'buy' ? -BigInt(actualNotional) : BigInt(actualNotional);
  const balanceAfter = (await getCompanyBalanceCents(db, companyId)) + delta;
  await db.insert(ledgerEntries).values({
    companyId,
    moduleId,
    kind: 'trade',
    amountCents: delta,
    balanceAfterCents: balanceAfter,
    traceId,
    description:
      actionVerb === 'sell'
        ? `sell ${quantity} ${symbol} @ ${venue} fill`
        : `buy ${quantity} ${symbol} @ ${venue} fill`,
  });

  // Deterministic paper fee proxy (one-way). Live brokers replace via adapter later.
  const feeCents = feeCentsFromNotional(actualNotional, 5);
  if (feeCents > 0) {
    const balanceAfterFee = balanceAfter - BigInt(feeCents);
    await db.insert(ledgerEntries).values({
      companyId,
      moduleId,
      kind: 'fee',
      amountCents: -BigInt(feeCents),
      balanceAfterCents: balanceAfterFee,
      traceId,
      description: `fee ${feeCents}¢ on ${actionVerb} ${symbol} (paper_proxy_5bps)`,
    });
  }

  return { traceId, verifyPass, actualNotional, balanceAfter };
}

export async function finalizeRecoveredVenueFill(
  db: Db,
  clock: Clock,
  args: FinalizeRecoveredVenueFillArgs,
): Promise<void> {
  await applyVenueFillFinalization(db, clock, { ...args, traceOutcome: 'recovered' });
  try {
    await recomputeCompanyEquity(db, clock, args.companyId, 'reconcile', {
      marks: [
        {
          sourceId: `paper_fill_recovered:${args.taskId}`,
          symbol: args.symbol,
          kind: 'paper_quote',
          valueCents: BigInt(args.fillPriceCents),
          capturedAtMs: clock.nowMs(),
        },
      ],
    });
  } catch {
    // Reconciliation fill must succeed even if equity projection write fails.
  }
}

async function finalizeFilledTrade(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
  ctx: FinalizeContext,
): Promise<PaperTradeResult> {
  const {
    task,
    taskId,
    instructionId,
    fillPriceCents,
    venueOrderId,
    quote,
    quoteRef,
    sessionSnapshot,
    venue,
    brokerConnectionId,
  } = ctx;

  const { traceId, verifyPass, actualNotional, balanceAfter } = await applyVenueFillFinalization(
    db,
    clock,
    {
      companyId: req.companyId,
      moduleId: req.moduleId,
      taskId,
      instructionId,
      symbol: quote.symbol,
      actionVerb: req.actionVerb,
      quantity: req.quantity,
      fillPriceCents,
      venueOrderId,
      quote,
      quoteRef,
      sessionSnapshot,
      venue,
      limitPriceCents: task.limitPriceCents,
      quantityInt: String(req.quantity),
      traceOutcome: 'filled',
      brokerConnectionId: brokerConnectionId ?? null,
      ...(ctx.childFills !== undefined ? { childFills: ctx.childFills } : {}),
      ...(ctx.usedChildDrain !== undefined ? { usedChildDrain: ctx.usedChildDrain } : {}),
      ...(ctx.simulatorGapTags !== undefined
        ? { simulatorGapTags: ctx.simulatorGapTags }
        : {}),
    },
  );

  try {
    await recomputeCompanyEquity(db, clock, req.companyId, 'fill', {
      marks: [
        {
          sourceId: `paper_fill:${traceId}`,
          symbol: quote.symbol,
          kind: 'paper_quote',
          valueCents: BigInt(fillPriceCents),
          capturedAtMs: clock.nowMs(),
        },
      ],
    });
  } catch {
    // Fill must succeed even if equity projection write fails; next trigger retries.
  }

  return {
    outcome: 'filled',
    failureCode: verifyPass ? null : 'verification_schema_block',
    detail: verifyPass ? 'filled and verified' : 'filled; verification failed',
    traceId,
    fillPriceCents,
    notionalCents: actualNotional,
    balanceAfterCents: balanceAfter.toString(),
  };
}

export { buildFillVerificationFields } from './fill-verification';

function computeFill(
  task: DeterministicActionTask,
  quote: QuoteSnapshot,
  slippageBps?: number,
): { ok: true; priceCents: number; venueOrderId: string } | { ok: false; reason: string } {
  return computeInternalPaperCoreFill(task, quote, {
    ...(slippageBps !== undefined ? { slippageBps } : {}),
  });
}

function internalPaperFillGapTags(args: {
  outcome: 'filled' | 'rejected' | 'blocked';
  usedLiveMarketQuote: boolean;
  routingMode: PaperRoutingMode;
  usedChildDrain?: boolean;
  shadowVerifyAttempted?: boolean;
  usedMarketImpactProxy?: boolean;
  usedPriorSessionMark?: boolean;
}): string[] {
  if (args.outcome !== 'filled') {
    return args.usedLiveMarketQuote
      ? ['live_market_quote', 'funds_only_routing', 'pre_dispatch_block']
      : ['synthetic_quote', 'pre_dispatch_block'];
  }
  const tags = [
    args.usedLiveMarketQuote ? 'live_market_quote' : 'synthetic_quote',
    'inline_fill_model',
    'no_venue_latency',
    'no_queue_position',
    args.usedMarketImpactProxy ? 'square_root_impact_proxy' : 'no_market_impact',
    args.usedChildDrain ? 'child_slice_drain' : 'no_partial_fills',
  ];
  if (args.usedPriorSessionMark) {
    tags.push('prior_session_mark');
  }
  switch (args.routingMode) {
    case 'funds_only':
      tags.push('funds_only_routing');
      break;
    case 'both_verify':
      tags.push(
        args.shadowVerifyAttempted ? 'both_verify_linked' : 'both_verify_no_provider',
      );
      break;
    case 'execute_on_service':
      tags.push('execute_on_service_routing');
      break;
    default: {
      const _exhaustive: never = args.routingMode;
      void _exhaustive;
    }
  }
  return tags;
}

function paperSimGapTags(
  outcome: 'filled' | 'rejected' | 'blocked',
  usedChildDrain = false,
): string[] {
  return internalPaperFillGapTags({
    outcome,
    usedLiveMarketQuote: false,
    routingMode: 'funds_only',
    usedChildDrain,
  });
}

async function writeFillTrace(
  db: Db,
  params: {
    companyId: string;
    moduleId: string;
    taskId: string;
    outcome: 'filled' | 'recovered';
    fills: unknown[];
    sessionSnapshot: Record<string, unknown>;
    failureCode: string | null;
    venue: Venue;
    usedChildDrain?: boolean;
    simulatorGapTags?: string[];
  },
): Promise<string> {
  const defaultTags =
    params.venue === 'paper_sim'
      ? paperSimGapTags(
          params.outcome === 'recovered' ? 'filled' : params.outcome,
          params.usedChildDrain === true,
        )
      : [];
  const rows = await db
    .insert(actionTraces)
    .values({
      taskId: params.taskId,
      companyId: params.companyId,
      moduleId: params.moduleId,
      venue: params.venue,
      mode: 'paper',
      outcome: params.outcome,
      fills: params.fills,
      sessionLegalitySnapshot: params.sessionSnapshot,
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      simulatorGapTags: params.simulatorGapTags ?? defaultTags,
      failureCode: params.failureCode,
    })
    .returning({ id: actionTraces.id });
  return rows[0]!.id;
}

async function writeTrace(
  db: Db,
  req: PaperTradeRequest,
  taskId: string | null,
  outcome: 'filled' | 'rejected' | 'blocked',
  fills: unknown[],
  sessionSnapshot: Record<string, unknown>,
  failureCode: string | null,
  venue: Venue,
  simulatorGapTags: string[] | null = null,
): Promise<string> {
  const rows = await db
    .insert(actionTraces)
    .values({
      taskId,
      companyId: req.companyId,
      moduleId: req.moduleId,
      venue,
      mode: 'paper',
      outcome,
      fills,
      sessionLegalitySnapshot: sessionSnapshot,
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      simulatorGapTags:
        simulatorGapTags ??
        (venue === 'paper_sim' ? paperSimGapTags(outcome) : []),
      failureCode,
    })
    .returning({ id: actionTraces.id });
  return rows[0]!.id;
}

async function blocked(
  db: Db,
  _clock: Clock,
  req: PaperTradeRequest,
  _envelope: HandoffEnvelope,
  failureCode: string,
  detail: string,
  sessionSnapshot: Record<string, unknown> = {},
  venue: Venue = 'paper_sim',
): Promise<PaperTradeResult> {
  const traceId = await writeTrace(
    db,
    req,
    null,
    'blocked',
    [],
    sessionSnapshot,
    failureCode,
    venue,
  );
  await db.insert(verificationRecords).values({
    traceId,
    taskId: null,
    result: 'blocked',
    fieldResults: [{ field: 'pre_dispatch', pass: false, detail }],
    failureCode,
  });
  return {
    outcome: 'blocked',
    failureCode,
    detail,
    traceId,
    fillPriceCents: null,
    notionalCents: null,
    balanceAfterCents: null,
  };
}

async function blockedSimple(
  db: Db,
  req: PaperTradeRequest,
  failureCode: string,
  detail: string,
  venue: Venue = 'paper_sim',
): Promise<PaperTradeResult> {
  const rows = await db
    .insert(actionTraces)
    .values({
      taskId: null,
      companyId: req.companyId,
      moduleId: req.moduleId,
      venue,
      mode: 'paper',
      outcome: 'blocked',
      fills: [],
      sessionLegalitySnapshot: {},
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      simulatorGapTags: venue === 'paper_sim' ? ['synthetic_quote', 'pre_dispatch_block'] : [],
      failureCode,
    })
    .returning({ id: actionTraces.id });
  const traceId = rows[0]!.id;
  await db.insert(verificationRecords).values({
    traceId,
    taskId: null,
    result: 'blocked',
    fieldResults: [{ field: 'pre_dispatch', pass: false, detail }],
    failureCode,
  });
  return {
    outcome: 'blocked',
    failureCode,
    detail,
    traceId,
    fillPriceCents: null,
    notionalCents: null,
    balanceAfterCents: null,
  };
}

async function recordReconciliation(
  db: Db,
  event: {
    companyId: string;
    connectionId: string | null;
    clientOrderId: string;
    venueOrderId: string | null;
    eventKind: 'submit' | 'poll' | 'fill' | 'reject' | 'timeout' | 'recover' | 'cancel';
    payload: Record<string, unknown>;
    requestId: string | null;
  },
): Promise<void> {
  await db.insert(dispatchReconciliationEvents).values({
    companyId: event.companyId,
    connectionId: event.connectionId,
    clientOrderId: event.clientOrderId,
    venueOrderId: event.venueOrderId,
    eventKind: event.eventKind,
    payload: event.payload,
    requestId: event.requestId,
  });
}

async function enqueueReconcile(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
  taskId: string,
  clientOrderId: string,
  connectionId: string | null,
): Promise<void> {
  await enqueue(db, clock, {
    queueClass: 'VERIFY',
    kind: 'verify.reconcile_order',
    payload: {
      companyId: req.companyId,
      moduleId: req.moduleId,
      taskId,
      clientOrderId,
      connectionId,
    },
    idempotencyKey: `recon-${taskId}`,
    companyId: req.companyId,
    moduleId: req.moduleId,
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('submit_timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function loadRecentDispatchTraceTimestamps(
  db: Db,
  companyId: string,
  nowMs: number,
): Promise<number[]> {
  const windowStart = new Date(nowMs - ORDER_FREQ_WINDOW_MS);
  const rows = await db
    .select({ createdAt: actionTraces.createdAt })
    .from(actionTraces)
    .where(and(eq(actionTraces.companyId, companyId), gte(actionTraces.createdAt, windowStart)));
  return rows.map((row) => row.createdAt.getTime());
}

async function resolveActiveGuardrailPackageIds(db: Db, moduleId: string): Promise<string[]> {
  const moduleRows = await db
    .select({ config: modules.config })
    .from(modules)
    .where(eq(modules.id, moduleId))
    .limit(1);
  const cfg = moduleRows[0]?.config as Record<string, unknown> | null;
  const ids = cfg?.guardrailPackageIds;
  if (Array.isArray(ids)) {
    const filtered = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (filtered.length > 0) return filtered;
  }
  return [...DEFAULT_GUARDRAIL_PACKAGE_IDS];
}
