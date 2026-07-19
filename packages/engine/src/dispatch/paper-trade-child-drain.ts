/**
 * Time-spaced POV child-slice drain for paper_sim fills.
 * Fills slice[0] synchronously, enqueues remaining slices with runAfterMs.
 * Model-free, deterministic.
 */

import { eq } from 'drizzle-orm';
import type { DeterministicActionTask, QuoteSnapshot, Venue } from '@hftr/contracts';
import type { PaperRoutingMode } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  actionInstructions,
  actionTraces,
  deterministicTasks,
  ledgerEntries,
  verificationRecords,
} from '@hftr/db/schema';
import type { Clock } from '../clock';
import { recomputeCompanyEquity } from '../equity/recompute';
import { enqueue } from '../queue/queue';
import { getCompanyBalanceCents } from './balances';
import { sliceDrainIntervalMs } from './child-order-scheduler';
import {
  materializeOneChildSliceFill,
  type ChildSliceFillLeg,
} from './child-slice-fills';
import { feeCentsFromNotional } from './fees';
import { buildFillVerificationFields } from './fill-verification';
import { shadowVerifyAndPersistBookDelta } from '../paper/book-delta';
import { resolveExecutionContext } from './execution-context';
import type { PaperTradeRequest, PaperTradeResult } from './paper-trade-types';
import { applyFill } from './positions';

const POLICY_ENVELOPE_VERSION = 'paper_balanced_general_v1';

export interface ChildDrainState {
  slices: number[];
  filledThroughIndex: number;
  basePriceCents: number;
  venueOrderId: string;
  quoteRef: string;
  actionVerb: 'buy' | 'sell';
  urgencyScalar: number;
  fills: ChildSliceFillLeg[];
  companyId: string;
  moduleId: string;
  instructionId: string;
  symbol: string;
  parentQty: number;
  limitPriceCents: number | null;
  sessionSnapshot: Record<string, unknown>;
  venue: Venue;
  brokerConnectionId: string | null;
  quoteLastCents: number | null;
  usedLiveMarketQuote: boolean;
  routingMode: PaperRoutingMode;
  /** When true, finalize runs provider shadow verify for BookDelta. */
  shadowVerify?: boolean;
  /** Serialized task for shadow submit (no secrets). */
  shadowTask?: DeterministicActionTask | null;
  /** D-177: square-root participation impact applied on parent fill price. */
  usedMarketImpactProxy?: boolean;
  /** D-177: off-hours venue mark rebucketed for gauntlet freshness. */
  usedPriorSessionMark?: boolean;
}

export interface ChildSliceDrainPayload {
  taskId: string;
  companyId: string;
  moduleId: string;
  sliceIndex: number;
}

export function childDrainGapTags(args: {
  usedLiveMarketQuote: boolean;
  routingMode: PaperRoutingMode;
  shadowVerifyAttempted?: boolean;
  /** Mid-drain append-only partial traces. */
  inProgress?: boolean;
  /** D-177: catalog + participation impact proxy applied. */
  usedMarketImpactProxy?: boolean;
  /** D-177: off-hours venue mark rebucketed for gauntlet freshness. */
  usedPriorSessionMark?: boolean;
}): string[] {
  const tags = [
    args.usedLiveMarketQuote ? 'live_market_quote' : 'synthetic_quote',
    'inline_fill_model',
    'no_venue_latency',
    'no_queue_position',
    args.usedMarketImpactProxy ? 'square_root_impact_proxy' : 'no_market_impact',
    'child_slice_drain',
    'time_spaced_child_drain',
  ];
  if (args.usedPriorSessionMark) {
    tags.push('prior_session_mark');
  }
  if (args.inProgress) {
    tags.push('time_spaced_drain_in_progress');
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

function vwapCentsFromFills(fills: ChildSliceFillLeg[], parentQty: number): number {
  let notional = 0;
  for (const f of fills) {
    notional += Number(f.qtyInt) * f.priceCents;
  }
  return Math.max(1, Math.round(notional / parentQty));
}

function parseDrainState(raw: unknown): ChildDrainState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as ChildDrainState;
  if (!Array.isArray(s.slices) || typeof s.filledThroughIndex !== 'number') return null;
  if (!Array.isArray(s.fills)) return null;
  return s;
}

async function applySliceFill(
  db: Db,
  args: {
    companyId: string;
    moduleId: string;
    symbol: string;
    actionVerb: 'buy' | 'sell';
    fill: ChildSliceFillLeg;
    venue: Venue;
    brokerConnectionId: string | null;
    traceId: string | null;
  },
): Promise<void> {
  const qty = Number(args.fill.qtyInt);
  await applyFill(db, {
    companyId: args.companyId,
    moduleId: args.moduleId,
    symbol: args.symbol,
    side: args.actionVerb,
    qty,
    priceCents: args.fill.priceCents,
    connectionId: args.brokerConnectionId,
    venue: args.venue,
    traceId: args.traceId,
  });
}

async function writeSliceLedger(
  db: Db,
  args: {
    companyId: string;
    moduleId: string;
    symbol: string;
    actionVerb: 'buy' | 'sell';
    fill: ChildSliceFillLeg;
    venue: Venue;
    traceId: string;
  },
): Promise<{ balanceAfter: bigint; ledgerId: string }> {
  const qty = Number(args.fill.qtyInt);
  const notional = qty * args.fill.priceCents;
  const delta = args.actionVerb === 'buy' ? -BigInt(notional) : BigInt(notional);
  const balanceAfter = (await getCompanyBalanceCents(db, args.companyId)) + delta;
  const ledgerRows = await db
    .insert(ledgerEntries)
    .values({
      companyId: args.companyId,
      moduleId: args.moduleId,
      kind: 'trade',
      amountCents: delta,
      balanceAfterCents: balanceAfter,
      traceId: args.traceId,
      description:
        args.actionVerb === 'sell'
          ? `sell ${qty} ${args.symbol} @ ${args.venue} child slice ${args.fill.sliceIndex}`
          : `buy ${qty} ${args.symbol} @ ${args.venue} child slice ${args.fill.sliceIndex}`,
    })
    .returning({ id: ledgerEntries.id });
  return { balanceAfter, ledgerId: ledgerRows[0]!.id };
}

async function writePartialDrainTrace(
  db: Db,
  state: ChildDrainState,
  taskId: string,
): Promise<string> {
  const fillRecords = state.fills.map((f) => ({
    qtyInt: f.qtyInt,
    qtyScale: f.qtyScale,
    priceCents: f.priceCents,
    atRef: f.atRef,
    sliceIndex: f.sliceIndex,
    childVenueOrderId: f.venueOrderId,
  }));
  const rows = await db
    .insert(actionTraces)
    .values({
      taskId,
      companyId: state.companyId,
      moduleId: state.moduleId,
      venue: state.venue,
      mode: 'paper',
      outcome: 'partial',
      fills: fillRecords,
      simulatorGapTags: childDrainGapTags({
        usedLiveMarketQuote: state.usedLiveMarketQuote,
        routingMode: state.routingMode,
        shadowVerifyAttempted: state.shadowVerify === true,
        inProgress: true,
        usedMarketImpactProxy: state.usedMarketImpactProxy === true,
        usedPriorSessionMark: state.usedPriorSessionMark === true,
      }),
      sessionLegalitySnapshot: state.sessionSnapshot,
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      failureCode: null,
    })
    .returning({ id: actionTraces.id });
  return rows[0]!.id;
}

async function finalizeTimeSpacedChildDrain(
  db: Db,
  clock: Clock,
  state: ChildDrainState,
  taskId: string,
): Promise<string> {
  const vwapCents = vwapCentsFromFills(state.fills, state.parentQty);
  const fillRecords = state.fills.map((f) => ({
    qtyInt: f.qtyInt,
    qtyScale: f.qtyScale,
    priceCents: f.priceCents,
    atRef: f.atRef,
    sliceIndex: f.sliceIndex,
    childVenueOrderId: f.venueOrderId,
  }));
  const simulatorGapTags = childDrainGapTags({
    usedLiveMarketQuote: state.usedLiveMarketQuote,
    routingMode: state.routingMode,
    shadowVerifyAttempted: state.shadowVerify === true,
    usedMarketImpactProxy: state.usedMarketImpactProxy === true,
    usedPriorSessionMark: state.usedPriorSessionMark === true,
  });

  await db
    .update(deterministicTasks)
    .set({
      status: 'filled',
      venueOrderId: state.venueOrderId,
      drainState: null,
      updatedAt: new Date(clock.nowMs()),
    })
    .where(eq(deterministicTasks.id, taskId));
  await db
    .update(actionInstructions)
    .set({ status: 'dispatched', updatedAt: new Date(clock.nowMs()) })
    .where(eq(actionInstructions.id, state.instructionId));

  const traceRows = await db
    .insert(actionTraces)
    .values({
      taskId,
      companyId: state.companyId,
      moduleId: state.moduleId,
      venue: state.venue,
      mode: 'paper',
      outcome: 'filled',
      fills: fillRecords,
      simulatorGapTags,
      sessionLegalitySnapshot: state.sessionSnapshot,
      policyEnvelopeVersion: POLICY_ENVELOPE_VERSION,
      failureCode: null,
    })
    .returning({ id: actionTraces.id });
  const traceId = traceRows[0]!.id;

  const fieldResults = buildFillVerificationFields({
    quantity: state.parentQty,
    quantityInt: String(state.parentQty),
    fillPriceCents: vwapCents,
    quoteLastCents: state.quoteLastCents,
    actionVerb: state.actionVerb,
    limitPriceCents: state.limitPriceCents,
  });
  const verifyPass = fieldResults.every((f) => f.pass);
  await db.insert(verificationRecords).values({
    traceId,
    taskId,
    result: verifyPass ? 'pass' : 'fail',
    fieldResults,
    failureCode: verifyPass ? null : 'verification_schema_block',
  });

  const totalNotional = state.parentQty * vwapCents;
  const feeCents = feeCentsFromNotional(totalNotional, 5);
  if (feeCents > 0) {
    const balanceAfter = await getCompanyBalanceCents(db, state.companyId);
    const balanceAfterFee = balanceAfter - BigInt(feeCents);
    await db.insert(ledgerEntries).values({
      companyId: state.companyId,
      moduleId: state.moduleId,
      kind: 'fee',
      amountCents: -BigInt(feeCents),
      balanceAfterCents: balanceAfterFee,
      traceId,
      description: `fee ${feeCents}¢ on ${state.actionVerb} ${state.symbol} (paper_proxy_5bps)`,
    });
  }

  try {
    await recomputeCompanyEquity(db, clock, state.companyId, 'fill', {
      marks: [
        {
          sourceId: `paper_fill:${traceId}`,
          symbol: state.symbol,
          kind: 'paper_quote',
          valueCents: BigInt(vwapCents),
          capturedAtMs: clock.nowMs(),
        },
      ],
    });
  } catch {
    // Fill must succeed even if equity projection write fails.
  }

  if (state.shadowVerify && state.shadowTask) {
    try {
      const execCtx = await resolveExecutionContext(db, clock, state.companyId);
      if (execCtx.adapter && execCtx.venue !== 'paper_sim') {
        const clientOrderId = state.shadowTask.clientOrderId ?? `drain_${taskId.slice(0, 12)}`;
        await shadowVerifyAndPersistBookDelta(db, clock, {
          adapter: execCtx.adapter,
          task: state.shadowTask,
          shadowClientOrderId: `bv_${clientOrderId}`.slice(0, 48),
          internalPriceCents: vwapCents,
          companyId: state.companyId,
          engineModuleId: state.moduleId,
          instructionId: state.instructionId,
          traceId,
          routingMode: state.routingMode,
          feedClassInternal: state.usedLiveMarketQuote
            ? 'live_market_quote'
            : 'synthetic_quote',
          fillTimeoutMs: state.shadowTask.fillTimeoutMs,
        });
      }
    } catch {
      // Shadow verify must not fail the authoritative internal fill.
    }
  }

  return traceId;
}

export async function enqueueNextChildSlice(
  db: Db,
  clock: Clock,
  state: ChildDrainState,
  taskId: string,
  nextSliceIndex: number,
): Promise<void> {
  const intervalMs = sliceDrainIntervalMs(state.urgencyScalar);
  await enqueue(db, clock, {
    queueClass: 'DISPATCH',
    kind: 'dispatch.paper_trade_child_slice',
    payload: {
      taskId,
      companyId: state.companyId,
      moduleId: state.moduleId,
      sliceIndex: nextSliceIndex,
    },
    idempotencyKey: `child-drain-${taskId}-s${nextSliceIndex}`,
    companyId: state.companyId,
    moduleId: state.moduleId,
    runAfterMs: clock.nowMs() + intervalMs,
  });
}

export interface StartTimeSpacedChildDrainContext {
  task: DeterministicActionTask;
  taskId: string;
  instructionId: string;
  slices: number[];
  basePriceCents: number;
  venueOrderId: string;
  quoteRef: string;
  quote: QuoteSnapshot;
  sessionSnapshot: Record<string, unknown>;
  venue: Venue;
  brokerConnectionId: string | null;
  urgencyScalar: number;
  usedLiveMarketQuote: boolean;
  routingMode: PaperRoutingMode;
  /** D-122 Phase 4: shadow-verify on drain complete. */
  shadowVerify?: boolean;
  /** D-177: square-root participation impact applied on parent fill price. */
  usedMarketImpactProxy?: boolean;
  /** D-177: off-hours venue mark rebucketed for gauntlet freshness. */
  usedPriorSessionMark?: boolean;
}

/** Fill slice[0], persist drain_state, enqueue slice[1] with runAfterMs. */
export async function startTimeSpacedChildDrain(
  db: Db,
  clock: Clock,
  req: PaperTradeRequest,
  ctx: StartTimeSpacedChildDrainContext,
): Promise<PaperTradeResult> {
  const fill0 = materializeOneChildSliceFill({
    sliceIndex: 0,
    qty: ctx.slices[0]!,
    basePriceCents: ctx.basePriceCents,
    actionVerb: req.actionVerb,
    quoteRef: ctx.quoteRef,
    venueOrderId: ctx.venueOrderId,
  });

  const drainState: ChildDrainState = {
    slices: ctx.slices,
    filledThroughIndex: 0,
    basePriceCents: ctx.basePriceCents,
    venueOrderId: ctx.venueOrderId,
    quoteRef: ctx.quoteRef,
    actionVerb: req.actionVerb,
    urgencyScalar: ctx.urgencyScalar,
    fills: [fill0],
    companyId: req.companyId,
    moduleId: req.moduleId,
    instructionId: ctx.instructionId,
    symbol: ctx.quote.symbol,
    parentQty: req.quantity,
    limitPriceCents: ctx.task.limitPriceCents,
    sessionSnapshot: ctx.sessionSnapshot,
    venue: ctx.venue,
    brokerConnectionId: ctx.brokerConnectionId,
    quoteLastCents: ctx.quote.lastCents,
    usedLiveMarketQuote: ctx.usedLiveMarketQuote,
    routingMode: ctx.routingMode,
    shadowVerify: ctx.shadowVerify === true,
    shadowTask: ctx.shadowVerify === true ? ctx.task : null,
    usedMarketImpactProxy: ctx.usedMarketImpactProxy === true,
    usedPriorSessionMark: ctx.usedPriorSessionMark === true,
  };

  const sliceArgs = {
    companyId: req.companyId,
    moduleId: req.moduleId,
    symbol: ctx.quote.symbol,
    actionVerb: req.actionVerb,
    fill: fill0,
    venue: ctx.venue,
    brokerConnectionId: ctx.brokerConnectionId,
  };

  if (ctx.slices.length > 1) {
    await db
      .update(deterministicTasks)
      .set({
        status: 'pending',
        venueOrderId: ctx.venueOrderId,
        drainState,
        updatedAt: new Date(clock.nowMs()),
      })
      .where(eq(deterministicTasks.id, ctx.taskId));

    const partialTraceId = await writePartialDrainTrace(db, drainState, ctx.taskId);
    await applySliceFill(db, { ...sliceArgs, traceId: partialTraceId });
    await writeSliceLedger(db, { ...sliceArgs, traceId: partialTraceId });
    await enqueueNextChildSlice(db, clock, drainState, ctx.taskId, 1);
    return {
      outcome: 'filled',
      failureCode: null,
      detail: 'child slice drain started; remaining slices enqueued',
      traceId: partialTraceId,
      fillPriceCents: fill0.priceCents,
      notionalCents: Number(fill0.qtyInt) * fill0.priceCents,
      balanceAfterCents: (await getCompanyBalanceCents(db, req.companyId)).toString(),
    };
  }

  await applySliceFill(db, { ...sliceArgs, traceId: null });
  const traceId = await finalizeTimeSpacedChildDrain(db, clock, drainState, ctx.taskId);
  await writeSliceLedger(db, { ...sliceArgs, traceId });
  return {
    outcome: 'filled',
    failureCode: null,
    detail: 'child slice drain complete (single slice)',
    traceId,
    fillPriceCents: fill0.priceCents,
    notionalCents: Number(fill0.qtyInt) * fill0.priceCents,
    balanceAfterCents: (await getCompanyBalanceCents(db, req.companyId)).toString(),
  };
}

/** Process one enqueued child slice (sliceIndex ≥ 1). Idempotent per slice. */
export async function executePaperTradeChildSlice(
  db: Db,
  clock: Clock,
  payload: ChildSliceDrainPayload,
): Promise<void> {
  const rows = await db
    .select({
      drainState: deterministicTasks.drainState,
      status: deterministicTasks.status,
    })
    .from(deterministicTasks)
    .where(eq(deterministicTasks.id, payload.taskId))
    .limit(1);
  const row = rows[0];
  if (!row) return;

  const state = parseDrainState(row.drainState);
  if (!state) return;
  if (state.companyId !== payload.companyId || state.moduleId !== payload.moduleId) return;

  const { sliceIndex } = payload;
  if (sliceIndex < 1 || sliceIndex >= state.slices.length) return;
  if (state.filledThroughIndex >= sliceIndex) return;
  if (state.filledThroughIndex !== sliceIndex - 1) return;

  const qty = state.slices[sliceIndex]!;
  const fill = materializeOneChildSliceFill({
    sliceIndex,
    qty,
    basePriceCents: state.basePriceCents,
    actionVerb: state.actionVerb,
    quoteRef: state.quoteRef,
    venueOrderId: state.venueOrderId,
  });

  const nextState: ChildDrainState = {
    ...state,
    filledThroughIndex: sliceIndex,
    fills: [...state.fills, fill],
  };

  const sliceArgs = {
    companyId: state.companyId,
    moduleId: state.moduleId,
    symbol: state.symbol,
    actionVerb: state.actionVerb,
    fill,
    venue: state.venue,
    brokerConnectionId: state.brokerConnectionId,
  };

  const isLast = sliceIndex === state.slices.length - 1;
  if (isLast) {
    await applySliceFill(db, { ...sliceArgs, traceId: null });
    const filledTraceId = await finalizeTimeSpacedChildDrain(
      db,
      clock,
      nextState,
      payload.taskId,
    );
    await writeSliceLedger(db, { ...sliceArgs, traceId: filledTraceId });
    return;
  }

  await db
    .update(deterministicTasks)
    .set({ drainState: nextState, updatedAt: new Date(clock.nowMs()) })
    .where(eq(deterministicTasks.id, payload.taskId));

  const partialTraceId = await writePartialDrainTrace(db, nextState, payload.taskId);
  await applySliceFill(db, { ...sliceArgs, traceId: partialTraceId });
  await writeSliceLedger(db, { ...sliceArgs, traceId: partialTraceId });
  await enqueueNextChildSlice(db, clock, nextState, payload.taskId, sliceIndex + 1);
}
