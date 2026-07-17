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
import type { Db } from '@hftr/db';
import {
  actionInstructions,
  actionTraces,
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
import { getCompanyBalanceCents } from './balances';
import { resolveExecutionContext } from './execution-context';
import { preDispatchGauntlet } from './pre-dispatch';
import { applyFill, getPosition } from './positions';
import { getSyntheticQuote } from './quotes';

/**
 * The deterministic paper-trade path (broker-integration.md, dispatch README):
 * record values → instruction → pre-dispatch gauntlet → finalize task →
 * venue submit/fill → immutable trace → verification → ledger.
 */

export interface PaperTradeRequest {
  companyId: string;
  moduleId: string;
  symbol: string;
  actionVerb: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  quantity: number;
  limitPriceCents?: number | null;
  jobId?: string | null;
}

export interface PaperTradeResult {
  outcome: 'filled' | 'rejected' | 'blocked';
  failureCode: string | null;
  detail: string;
  traceId: string | null;
  fillPriceCents: number | null;
  notionalCents: number | null;
  balanceAfterCents: string | null;
}

const POLICY_ENVELOPE_VERSION = 'paper_balanced_general_v1';
const VERIFICATION_SCHEMA_VERSION = 'trade_verify_v1';
const MAX_QUANTITY = 100_000;
const QUOTE_TTL_MS = 90_000;
const MAX_FILL_DEVIATION_BPS = 50;
const DEFAULT_BROKER_ENVELOPE_ID = 'bpe-001';
const DEFAULT_GUARDRAIL_PACKAGE_IDS = ['grd-001', 'grd-003'] as const;
const ORDER_FREQ_WINDOW_MS = 60_000;

export { getCompanyBalanceCents } from './balances';

export async function executePaperTrade(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
): Promise<PaperTradeResult> {
  let execCtx;
  try {
    execCtx = await resolveExecutionContext(db, clock, req.companyId);
  } catch (err) {
    const code = err instanceof Error ? err.message : 'dispatch_error';
    if (code === 'live_gate_blocked' || code === 'broker_connection_not_connected') {
      return blockedSimple(db, req, code, code);
    }
    throw err;
  }

  const { adapter, venue, brokerConnectionId } = execCtx;
  const envelope: HandoffEnvelope = {
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

  let quote: QuoteSnapshot;
  const usesVenueQuote = venue !== 'paper_sim';
  try {
    quote = usesVenueQuote
      ? await adapter.getQuote(req.symbol)
      : getSyntheticQuote(req.symbol, clock);
  } catch {
    return blockedSimple(db, req, 'broker_policy_block', 'quote unavailable', venue);
  }

  const quoteRef = await record(db, clock, {
    kind: 'price',
    unit: 'USD_cents',
    scale: 0,
    valueInt: BigInt(quote.lastCents ?? quote.askCents ?? 0),
    sourceClass: usesVenueQuote ? 'broker_state' : 'synthetic_sim',
    sourceId: usesVenueQuote ? `${venue}:quote:${quote.symbol}` : `synthetic_sim:${quote.symbol}`,
    ttlMs: QUOTE_TTL_MS,
    companyId: req.companyId,
    moduleId: req.moduleId,
  });

  const quantityRef = await record(db, clock, {
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
  const timeoutRef = await record(db, clock, {
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
  const limitRef =
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

  const clientOrderId = `co_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const instructionRows = await db
    .insert(actionInstructions)
    .values({
      companyId: req.companyId,
      moduleId: req.moduleId,
      actionVerb: req.actionVerb,
      symbol: quote.symbol,
      orderType: req.orderType,
      timeInForce: 'day',
      quantityRef,
      limitPriceRef: limitRef,
      fillTimeoutRef: timeoutRef,
      guardrailRefs: ['capital_limit_v1', 'session_legality_v1'],
      verificationSchemaVersion: VERIFICATION_SCHEMA_VERSION,
      clientOrderId,
      envelope,
    })
    .returning({ id: actionInstructions.id });
  const instructionId = instructionRows[0]!.id;

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
  if (req.actionVerb === 'buy') {
    let effectiveBalance = execCtx.virtualBalanceCents;
    if (venue !== 'paper_sim') {
      const brokerBalances = await adapter.getBalances();
      const brokerBp = BigInt(brokerBalances.buyingPowerCents);
      effectiveBalance = effectiveBalance < brokerBp ? effectiveBalance : brokerBp;
    }
    if (BigInt(notionalCents) > effectiveBalance) {
      await db
        .update(actionInstructions)
        .set({ status: 'blocked', updatedAt: new Date(clock.nowMs()) })
        .where(eq(actionInstructions.id, instructionId));
      return blocked(
        db,
        clock,
        req,
        envelope,
        'capital_limit_block',
        'notional exceeds effective buying power',
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
    timeInForce: 'day',
    quantityInt: String(req.quantity),
    quantityScale: 0,
    limitPriceCents: req.limitPriceCents ?? null,
    stopPriceCents: null,
    fillTimeoutMs: 30_000,
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
  let effectiveCapCents = execCtx.virtualBalanceCents;
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
    const limitCtx: LimitContext = {
      companyId: req.companyId,
      moduleId: req.moduleId,
      mode: execCtx.companyMode,
      nowMs,
      sessionPhase: phase,
      virtualBalanceCents: execCtx.virtualBalanceCents,
      equityCents: execCtx.virtualBalanceCents,
      realizedLossCents: 0n,
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
    liveGateBlocked: true, // fail-closed: live not armed in v2; blocks live mode in gauntlet
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

  if (venue !== 'paper_sim') {
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
    });
  }

  const fill = computeFill(task, quote);
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

  return finalizeFilledTrade(db, clock, req, {
    task,
    taskId,
    instructionId,
    fillPriceCents: fill.priceCents,
    venueOrderId: fill.venueOrderId,
    quote,
    quoteRef,
    sessionSnapshot,
    venue,
  });
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
  args: FinalizeRecoveredVenueFillArgs & { traceOutcome: 'filled' | 'recovered' },
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
  } = args;

  const fillRecord = {
    qtyInt: quantityInt,
    qtyScale: 0,
    priceCents: fillPriceCents,
    atRef: quoteRef,
  };

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
    fills: [fillRecord],
    sessionSnapshot,
    failureCode: null,
    venue,
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

  return { traceId, verifyPass, actualNotional, balanceAfter };
}

export async function finalizeRecoveredVenueFill(
  db: Db,
  clock: Clock,
  args: FinalizeRecoveredVenueFillArgs,
): Promise<void> {
  await applyVenueFillFinalization(db, clock, { ...args, traceOutcome: 'recovered' });
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
      quantityInt: task.quantityInt,
      traceOutcome: 'filled',
    },
  );

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

export function buildFillVerificationFields(args: {
  quantity: number;
  quantityInt: string;
  fillPriceCents: number;
  quoteLastCents: number | null;
  actionVerb: 'buy' | 'sell';
  limitPriceCents: number | null;
}): Array<{ field: string; pass: boolean; detail: string }> {
  const deviationBps = Math.abs(
    Math.round(
      ((args.fillPriceCents - (args.quoteLastCents ?? args.fillPriceCents)) / args.fillPriceCents) *
        10_000,
    ),
  );
  return [
    {
      field: 'quantity',
      pass: args.quantityInt === String(args.quantity),
      detail: 'fill quantity matches instruction',
    },
    {
      field: 'fill_price_deviation',
      pass: deviationBps <= MAX_FILL_DEVIATION_BPS,
      detail: `deviation ${deviationBps} bps vs bound ${MAX_FILL_DEVIATION_BPS}`,
    },
    {
      field: 'limit_respected',
      pass:
        args.limitPriceCents === null ||
        (args.actionVerb === 'buy'
          ? args.fillPriceCents <= args.limitPriceCents
          : args.fillPriceCents >= args.limitPriceCents),
      detail: 'fill respects limit price',
    },
  ];
}

function computeFill(
  task: DeterministicActionTask,
  quote: QuoteSnapshot,
): { ok: true; priceCents: number; venueOrderId: string } | { ok: false; reason: string } {
  const isBuy = task.actionVerb === 'buy';
  const side = isBuy ? quote.askCents : quote.bidCents;
  const reference = side ?? quote.lastCents;
  if (reference === null) return { ok: false, reason: 'no_quote' };
  const slip = Math.max(0, Math.round((reference * 2) / 10_000));
  const priceCents = isBuy ? reference + slip : reference - slip;
  if (task.orderType === 'limit' && task.limitPriceCents !== null) {
    if (isBuy && priceCents > task.limitPriceCents) return { ok: false, reason: 'unmarketable' };
    if (!isBuy && priceCents < task.limitPriceCents) return { ok: false, reason: 'unmarketable' };
  }
  return { ok: true, priceCents, venueOrderId: `psim_${task.idempotencyKey.slice(7, 19)}` };
}

function paperSimGapTags(outcome: 'filled' | 'rejected' | 'blocked'): string[] {
  if (outcome === 'filled') {
    return ['synthetic_quote', 'inline_fill_model', 'no_venue_latency', 'no_partial_fills'];
  }
  return ['synthetic_quote', 'pre_dispatch_block'];
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
  },
): Promise<string> {
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
      // Honest paper_sim provenance: recovered venue fills share the filled gap set when
      // the fill still came from the synthetic path; non-paper venues leave tags empty.
      simulatorGapTags:
        params.venue === 'paper_sim'
          ? paperSimGapTags(params.outcome === 'recovered' ? 'filled' : params.outcome)
          : [],
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
      simulatorGapTags: venue === 'paper_sim' ? (simulatorGapTags ?? paperSimGapTags(outcome)) : [],
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
