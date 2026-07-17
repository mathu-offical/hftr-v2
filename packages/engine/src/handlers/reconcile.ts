import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { deterministicTasks, dispatchReconciliationEvents } from '@hftr/db/schema';
import { resolveExecutionContext } from '../dispatch/execution-context';
import { registerHandler } from './registry';

const ReconcilePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  taskId: z.string().uuid(),
  clientOrderId: z.string().min(8),
  connectionId: z.string().uuid().nullable(),
});

/**
 * VERIFY handler: poll venue order state after ambiguous submit and record
 * reconciliation evidence. Does not mutate positions until a terminal fill
 * is confirmed — that path is completed by a follow-up dispatch job.
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
    return;
  }

  if (orderSnap.status === 'filled' && orderSnap.avgFillPriceCents != null) {
    await db
      .update(deterministicTasks)
      .set({
        status: 'filled',
        venueOrderId: orderSnap.venueOrderId,
        updatedAt: new Date(clock.nowMs()),
      })
      .where(eq(deterministicTasks.id, payload.taskId));

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
  }
});
