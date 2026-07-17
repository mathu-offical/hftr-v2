import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  actionInstructions,
  actionTraces,
  companies,
  deterministicTasks,
  ledgerEntries,
  verificationRecords,
} from '@hftr/db/schema';
import type { DeterministicActionTask, HandoffEnvelope, QuoteSnapshot } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { record } from '../calc/store';
import { applyFill, getPosition } from './positions';
import { getSyntheticQuote } from './quotes';

/**
 * The deterministic paper-trade path (broker-integration.md, dispatch README):
 * record values → instruction → pre-dispatch gauntlet → finalize task →
 * paper fill → immutable trace → verification → ledger. This is the M2 spine;
 * LLM tiers will later PRODUCE instructions, but execution never changes.
 *
 * Every failure is a BLOCK with an explicit code — never a warning.
 */

export interface PaperTradeRequest {
  companyId: string;
  moduleId: string;
  symbol: string;
  actionVerb: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  quantity: number; // whole units; operator input (OPERATOR_INPUT authority)
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
/** Verification bound: fill must sit within 50 bps of the reference quote. */
const MAX_FILL_DEVIATION_BPS = 50;

export async function getCompanyBalanceCents(db: Db, companyId: string): Promise<bigint> {
  const companyRows = await db
    .select({ seed: companies.seedCreditsCents })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const seed = companyRows[0]?.seed ?? 0n;
  const sums = await db
    .select({ total: sql<string>`coalesce(sum(amount_cents), 0)::text` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.companyId, companyId));
  return seed + BigInt(sums[0]?.total ?? '0');
}

export async function executePaperTrade(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
): Promise<PaperTradeResult> {
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

  // ── 1. Input sanity (operator values still pass the gauntlet) ─────────────
  if (!Number.isInteger(req.quantity) || req.quantity <= 0 || req.quantity > MAX_QUANTITY) {
    return blocked(db, clock, req, envelope, 'numeric_sanity_block', 'quantity out of bounds');
  }

  // ── 2. Reference quote (recorded into the value store with lineage) ───────
  const quote = getSyntheticQuote(req.symbol, clock);
  const quoteRef = await record(db, clock, {
    kind: 'price',
    unit: 'USD_cents',
    scale: 0,
    valueInt: BigInt(quote.lastCents ?? 0),
    sourceClass: 'synthetic_sim',
    sourceId: `synthetic_sim:${quote.symbol}`,
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

  // ── 3. Instruction row ─────────────────────────────────────────────────────
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

  // ── 4. Pre-dispatch gauntlet ───────────────────────────────────────────────
  const session = await getSession(db, 'XNYS', venueDate(clock.nowMs(), 'America/New_York'));
  const phase = sessionPhase(session, clock.nowMs());
  const sessionSnapshot = {
    venueCalendar: 'XNYS',
    phase,
    checkedAtRef: quoteRef,
    // paper_sim runs around the clock; the snapshot preserves what live would enforce.
    enforced: false,
  };

  // Paper v1 does not support shorting: sells are capped at held quantity.
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
      );
    }
  }

  const notionalCents = req.quantity * (quote.askCents ?? quote.lastCents ?? 0);
  if (req.actionVerb === 'buy') {
    const balance = await getCompanyBalanceCents(db, req.companyId);
    if (BigInt(notionalCents) > balance) {
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
        `notional exceeds company balance`,
        sessionSnapshot,
      );
    }
  }

  // ── 5. Finalize deterministic task (refs resolved, lineage kept) ──────────
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
    lineage: { quantityRef, limitPriceRef: limitRef, fillTimeoutRef: timeoutRef },
  };
  const taskRows = await db
    .insert(deterministicTasks)
    .values({ instructionId, payload: task, idempotencyKey: task.idempotencyKey })
    .returning({ id: deterministicTasks.id });
  const taskId = taskRows[0]!.id;

  // ── 6. Paper fill (deterministic slippage model, mirrors paper-sim adapter) ─
  const fill = computeFill(task, quote);
  if (!fill.ok) {
    await db
      .update(deterministicTasks)
      .set({ status: 'rejected', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, taskId));
    const traceId = await writeTrace(db, req, taskId, 'rejected', [], sessionSnapshot, fill.reason);
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

  const fillRecord = {
    qtyInt: task.quantityInt,
    qtyScale: 0,
    priceCents: fill.priceCents,
    atRef: quoteRef,
  };
  await db
    .update(deterministicTasks)
    .set({ status: 'filled', venueOrderId: fill.venueOrderId, updatedAt: new Date(clock.nowMs()) })
    .where(eq(deterministicTasks.id, taskId));
  await db
    .update(actionInstructions)
    .set({ status: 'dispatched', updatedAt: new Date(clock.nowMs()) })
    .where(eq(actionInstructions.id, instructionId));

  const traceId = await writeTrace(db, req, taskId, 'filled', [fillRecord], sessionSnapshot, null);

  // ── 7. Schema-locked verification ──────────────────────────────────────────
  const deviationBps = Math.abs(
    Math.round(
      ((fill.priceCents - (quote.lastCents ?? fill.priceCents)) / fill.priceCents) * 10_000,
    ),
  );
  const fieldResults = [
    {
      field: 'quantity',
      pass: fillRecord.qtyInt === String(req.quantity),
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
        task.limitPriceCents === null ||
        (req.actionVerb === 'buy'
          ? fill.priceCents <= task.limitPriceCents
          : fill.priceCents >= task.limitPriceCents),
      detail: 'fill respects limit price',
    },
  ];
  const verifyPass = fieldResults.every((f) => f.pass);
  await db.insert(verificationRecords).values({
    traceId,
    taskId,
    result: verifyPass ? 'pass' : 'fail',
    fieldResults,
    failureCode: verifyPass ? null : 'verification_schema_block',
  });

  // ── 8. Positions + ledger (append-only; balance derived, never mutated) ────
  const realizedPnlCents = await applyFill(db, {
    companyId: req.companyId,
    moduleId: req.moduleId,
    symbol: quote.symbol,
    side: req.actionVerb,
    qty: req.quantity,
    priceCents: fill.priceCents,
  });
  const actualNotional = req.quantity * fill.priceCents;
  const delta = req.actionVerb === 'buy' ? -BigInt(actualNotional) : BigInt(actualNotional);
  const balanceAfter = (await getCompanyBalanceCents(db, req.companyId)) + delta;
  await db.insert(ledgerEntries).values({
    companyId: req.companyId,
    moduleId: req.moduleId,
    kind: 'trade',
    amountCents: delta,
    balanceAfterCents: balanceAfter,
    traceId,
    description:
      req.actionVerb === 'sell'
        ? `sell ${req.quantity} ${quote.symbol} @ paper fill (realized ${realizedPnlCents}¢)`
        : `buy ${req.quantity} ${quote.symbol} @ paper fill`,
  });

  return {
    outcome: 'filled',
    failureCode: verifyPass ? null : 'verification_schema_block',
    detail: verifyPass ? 'filled and verified' : 'filled; verification failed',
    traceId,
    fillPriceCents: fill.priceCents,
    notionalCents: actualNotional,
    balanceAfterCents: balanceAfter.toString(),
  };
}

function computeFill(
  task: DeterministicActionTask,
  quote: QuoteSnapshot,
): { ok: true; priceCents: number; venueOrderId: string } | { ok: false; reason: string } {
  const isBuy = task.actionVerb === 'buy';
  const side = isBuy ? quote.askCents : quote.bidCents;
  const reference = side ?? quote.lastCents;
  if (reference === null) return { ok: false, reason: 'no_quote' };
  const slip = Math.max(0, Math.round((reference * 2) / 10_000)); // 2 bps
  const priceCents = isBuy ? reference + slip : reference - slip;
  if (task.orderType === 'limit' && task.limitPriceCents !== null) {
    if (isBuy && priceCents > task.limitPriceCents) return { ok: false, reason: 'unmarketable' };
    if (!isBuy && priceCents < task.limitPriceCents) return { ok: false, reason: 'unmarketable' };
  }
  return { ok: true, priceCents, venueOrderId: `psim_${task.idempotencyKey.slice(7, 19)}` };
}

async function writeTrace(
  db: Db,
  req: PaperTradeRequest,
  taskId: string,
  outcome: 'filled' | 'rejected' | 'blocked',
  fills: unknown[],
  sessionSnapshot: Record<string, unknown>,
  failureCode: string | null,
): Promise<string> {
  const rows = await db
    .insert(actionTraces)
    .values({
      taskId,
      companyId: req.companyId,
      moduleId: req.moduleId,
      venue: 'paper_sim',
      mode: 'paper',
      outcome,
      fills,
      sessionLegalitySnapshot: sessionSnapshot,
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      simulatorGapTags: [
        'synthetic_quote',
        'inline_fill_model',
        'no_venue_latency',
        'no_partial_fills',
      ],
      failureCode,
    })
    .returning({ id: actionTraces.id });
  return rows[0]!.id;
}

async function blocked(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
  _envelope: HandoffEnvelope,
  failureCode: string,
  detail: string,
  sessionSnapshot: Record<string, unknown> = {},
): Promise<PaperTradeResult> {
  const rows = await db
    .insert(actionTraces)
    .values({
      taskId: null,
      companyId: req.companyId,
      moduleId: req.moduleId,
      venue: 'paper_sim',
      mode: 'paper',
      outcome: 'blocked',
      fills: [],
      sessionLegalitySnapshot: sessionSnapshot,
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      simulatorGapTags: ['synthetic_quote', 'pre_dispatch_block'],
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
