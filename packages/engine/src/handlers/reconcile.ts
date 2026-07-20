import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DeterministicActionTask } from '@hftr/contracts';
import {
  actionInstructions,
  deterministicTasks,
  dispatchReconciliationEvents,
} from '@hftr/db/schema';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { record } from '../calc/store';
import { finalizeRecoveredVenueFill } from '../dispatch/paper-trade';
import { resolveExecutionContext } from '../dispatch/execution-context';
import { enqueueLoopRefineFromInstruction } from '../pipeline/enqueue-loop-refine';
import { registerHandler } from './registry';

const ReconcilePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  taskId: z.string().uuid(),
  clientOrderId: z.string().min(8),
  connectionId: z.string().uuid().nullable(),
});

const QUOTE_TTL_MS = 90_000;
/** After this many missing-order polls, treat as no_fill and loop_refine (D-244). */
const MISSING_ORDER_POLLS_BEFORE_NO_FILL = 3;

/**
 * VERIFY handler: poll venue order state after ambiguous submit, finalize fills
 * into ledger/positions, and record reconciliation evidence.
 */
registerHandler('verify.reconcile_order', async ({ db, clock, job }) => {
  const payload = ReconcilePayload.parse(job.payload);
  const taskRows = await db
    .select()
    .from(deterministicTasks)
    .where(eq(deterministicTasks.id, payload.taskId))
    .limit(1);
  const taskRow = taskRows[0];
  if (!taskRow || taskRow.status === 'filled') {
    return;
  }

  let execCtx;
  try {
    execCtx = await resolveExecutionContext(db, clock, payload.companyId);
  } catch {
    return;
  }

  const adapter = execCtx.adapter;
  if (!adapter.getOrderByClientId) {
    return;
  }

  const orderSnap = await adapter.getOrderByClientId(payload.clientOrderId);
  await db.insert(dispatchReconciliationEvents).values({
    companyId: payload.companyId,
    connectionId: payload.connectionId,
    clientOrderId: payload.clientOrderId,
    venueOrderId: orderSnap?.venueOrderId ?? taskRow.venueOrderId,
    eventKind: 'poll',
    payload: {
      status: orderSnap?.status ?? 'missing',
      taskId: payload.taskId,
    },
    requestId: null,
  });

  if (!orderSnap) {
    const [pollCount] = await db
      .select({ n: count() })
      .from(dispatchReconciliationEvents)
      .where(eq(dispatchReconciliationEvents.clientOrderId, payload.clientOrderId));
    if ((pollCount?.n ?? 0) < MISSING_ORDER_POLLS_BEFORE_NO_FILL) {
      return;
    }
    if (taskRow.status === 'pending' || taskRow.status === 'submitted') {
      await db
        .update(deterministicTasks)
        .set({ status: 'rejected', updatedAt: new Date(clock.nowMs()) })
        .where(eq(deterministicTasks.id, payload.taskId));
      await enqueueLoopRefineFromInstruction(db, clock, {
        companyId: payload.companyId,
        moduleId: payload.moduleId,
        instructionId: taskRow.instructionId,
        reason: 'no_fill',
      });
    }
    return;
  }

  if (orderSnap.status === 'filled' && orderSnap.avgFillPriceCents != null) {
    const task = DeterministicActionTask.parse(taskRow.payload);
    if (task.actionVerb !== 'buy' && task.actionVerb !== 'sell') {
      return;
    }

    const instructionRows = await db
      .select()
      .from(actionInstructions)
      .where(eq(actionInstructions.id, taskRow.instructionId))
      .limit(1);
    const instruction = instructionRows[0];
    if (!instruction) {
      return;
    }

    let quote;
    try {
      quote = await adapter.getQuote(task.symbol);
    } catch {
      return;
    }

    const quoteRef = await record(db, clock, {
      kind: 'price',
      unit: 'USD_cents',
      scale: 0,
      valueInt: BigInt(quote.lastCents ?? quote.askCents ?? orderSnap.avgFillPriceCents),
      sourceClass: 'broker_state',
      sourceId: `${execCtx.venue}:quote:${quote.symbol}`,
      ttlMs: QUOTE_TTL_MS,
      companyId: payload.companyId,
      moduleId: payload.moduleId,
    });

    const session = await getSession(db, 'XNYS', venueDate(clock.nowMs(), 'America/New_York'));
    const phase = sessionPhase(session, clock.nowMs());
    const sessionSnapshot = {
      venueCalendar: 'XNYS',
      phase,
      checkedAtRef: quoteRef,
      enforced: execCtx.venue !== 'paper_sim',
    };

    const quantity = Number(task.quantityInt);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return;
    }

    await finalizeRecoveredVenueFill(db, clock, {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      taskId: payload.taskId,
      instructionId: taskRow.instructionId,
      symbol: task.symbol,
      actionVerb: task.actionVerb,
      quantity,
      fillPriceCents: orderSnap.avgFillPriceCents,
      venueOrderId: orderSnap.venueOrderId,
      quote,
      quoteRef,
      sessionSnapshot,
      venue: execCtx.venue,
      limitPriceCents: task.limitPriceCents,
      quantityInt: task.quantityInt,
      brokerConnectionId: execCtx.brokerConnectionId,
    });

    await db.insert(dispatchReconciliationEvents).values({
      companyId: payload.companyId,
      connectionId: payload.connectionId,
      clientOrderId: payload.clientOrderId,
      venueOrderId: orderSnap.venueOrderId,
      eventKind: 'recover',
      payload: {
        avgFillPriceCents: orderSnap.avgFillPriceCents,
        taskId: payload.taskId,
      },
      requestId: null,
    });
    return;
  }

  if (
    orderSnap.status === 'rejected' ||
    orderSnap.status === 'canceled' ||
    orderSnap.status === 'expired'
  ) {
    await db
      .update(deterministicTasks)
      .set({ status: 'rejected', updatedAt: new Date(clock.nowMs()) })
      .where(eq(deterministicTasks.id, payload.taskId));
    await db.insert(dispatchReconciliationEvents).values({
      companyId: payload.companyId,
      connectionId: payload.connectionId,
      clientOrderId: payload.clientOrderId,
      venueOrderId: orderSnap.venueOrderId,
      eventKind: 'reject',
      payload: { rawStatus: orderSnap.rawStatus, taskId: payload.taskId },
      requestId: null,
    });

    const reason =
      orderSnap.status === 'expired'
        ? ('expired' as const)
        : orderSnap.status === 'canceled'
          ? ('canceled' as const)
          : ('rejected' as const);
    await enqueueLoopRefineFromInstruction(db, clock, {
      companyId: payload.companyId,
      moduleId: payload.moduleId,
      instructionId: taskRow.instructionId,
      reason,
    });
  }
});
