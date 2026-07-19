/**
 * BookDelta persistence + both_verify shadow provider compare (D-122 Phase 4).
 * Provider fills never mutate the HFTR ledger here — internal fill is authoritative.
 */

import type { BrokerAdapter, DeterministicActionTask } from '@hftr/contracts';
import {
  BookDelta,
  buildFillPriceBookDeltaDimension,
  fillPriceDeltaBps,
  type BookDelta as BookDeltaType,
  type PaperRoutingMode,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { bookDeltas, trainingFeedback } from '@hftr/db/schema';
import type { Clock } from '../clock';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export interface PersistBookDeltaArgs {
  companyId: string;
  engineModuleId: string;
  instructionId: string | null;
  traceId: string | null;
  routingMode: PaperRoutingMode;
  delta: BookDeltaType;
}

export async function persistBookDelta(
  db: Db,
  args: PersistBookDeltaArgs,
): Promise<{ bookDeltaId: string }> {
  const delta = BookDelta.parse(args.delta);
  const rows = await db
    .insert(bookDeltas)
    .values({
      companyId: args.companyId,
      engineModuleId: args.engineModuleId,
      instructionId: args.instructionId,
      traceId: args.traceId,
      routingMode: args.routingMode,
      delta,
    })
    .returning({ id: bookDeltas.id });
  return { bookDeltaId: rows[0]!.id };
}

/** Link book_delta observation into training_feedback for later valve jobs. */
export async function linkBookDeltaTrainingFeedback(
  db: Db,
  args: {
    companyId: string;
    moduleId: string;
    traceId: string | null;
    bookDeltaId: string;
    fillPriceDeltaBps?: number;
  },
): Promise<void> {
  await db.insert(trainingFeedback).values({
    companyId: args.companyId,
    moduleId: args.moduleId,
    sourceTraceId: args.traceId,
    mutationClass: 'book_delta',
    delta: {
      mutationClass: 'book_delta',
      bookDeltaId: args.bookDeltaId,
      ...(args.fillPriceDeltaBps !== undefined
        ? { fillPriceDeltaBps: args.fillPriceDeltaBps }
        : {}),
    },
  });
}

export interface ShadowVerifyProviderArgs {
  adapter: BrokerAdapter;
  task: DeterministicActionTask;
  /** Distinct from HFTR task clientOrderId so venue reconcile does not collide. */
  shadowClientOrderId: string;
  internalPriceCents: number;
  companyId: string;
  engineModuleId: string;
  instructionId: string | null;
  traceId: string | null;
  routingMode: PaperRoutingMode;
  feedClassInternal?: string;
  fillTimeoutMs: number;
}

export type ShadowVerifyResult =
  | { ok: true; bookDeltaId: string; referencePriceCents: number; deltaBps: number }
  | { ok: false; reason: string; bookDeltaId: string | null };

/**
 * Submit a shadow order to the provider and persist BookDelta vs internal fill.
 * Failures are recorded as reject_code dimensions when possible; never throw into
 * the HFTR fill path.
 */
export async function shadowVerifyAndPersistBookDelta(
  db: Db,
  _clock: Clock,
  args: ShadowVerifyProviderArgs,
): Promise<ShadowVerifyResult> {
  const shadowTask: DeterministicActionTask = {
    ...args.task,
    clientOrderId: args.shadowClientOrderId,
    idempotencyKey: `bv_${args.task.idempotencyKey}`,
  };

  let submitResult;
  try {
    // Cap shadow wait so weekend/closed-market rejects don't block DISPATCH drain (D-205).
    const shadowBudgetMs = Math.min(Math.max(3_000, args.fillTimeoutMs), 12_000);
    submitResult = await withTimeout(args.adapter.submitOrder(shadowTask), shadowBudgetMs);
  } catch {
    const { bookDeltaId } = await persistRejectDelta(db, args, 'submit_timeout');
    return { ok: false, reason: 'submit_timeout', bookDeltaId };
  }

  if (!submitResult.accepted) {
    const { bookDeltaId } = await persistRejectDelta(
      db,
      args,
      submitResult.rejectReason ?? 'rejected',
    );
    return { ok: false, reason: submitResult.rejectReason ?? 'rejected', bookDeltaId };
  }

  const orderSnap = args.adapter.getOrderByClientId
    ? await args.adapter.getOrderByClientId(submitResult.clientOrderId ?? args.shadowClientOrderId)
    : null;

  if (orderSnap?.status !== 'filled' || orderSnap.avgFillPriceCents == null) {
    const { bookDeltaId } = await persistRejectDelta(db, args, 'provider_fill_pending');
    return { ok: false, reason: 'provider_fill_pending', bookDeltaId };
  }

  const referencePriceCents = orderSnap.avgFillPriceCents;
  const deltaBps = fillPriceDeltaBps({
    internalPriceCents: args.internalPriceCents,
    referencePriceCents,
  });
  const priceDim = buildFillPriceBookDeltaDimension({
    internalPriceCents: args.internalPriceCents,
    referencePriceCents,
  });
  const delta: BookDeltaType = {
    companyId: args.companyId,
    engineModuleId: args.engineModuleId,
    instructionId: args.instructionId ?? undefined,
    traceId: args.traceId ?? undefined,
    routingMode: args.routingMode,
    dimensions: [
      { ...priceDim, unit: 'cents' },
      {
        kind: 'fill_price_bps',
        internalValue: 0,
        referenceValue: deltaBps,
        unit: 'bps',
      },
    ],
    feedClassInternal: args.feedClassInternal,
    feedClassReference: 'provider_fill',
  };

  const { bookDeltaId } = await persistBookDelta(db, {
    companyId: args.companyId,
    engineModuleId: args.engineModuleId,
    instructionId: args.instructionId,
    traceId: args.traceId,
    routingMode: args.routingMode,
    delta,
  });
  await linkBookDeltaTrainingFeedback(db, {
    companyId: args.companyId,
    moduleId: args.engineModuleId,
    traceId: args.traceId,
    bookDeltaId,
    fillPriceDeltaBps: deltaBps,
  });
  return { ok: true, bookDeltaId, referencePriceCents, deltaBps };
}

async function persistRejectDelta(
  db: Db,
  args: ShadowVerifyProviderArgs,
  rejectCode: string,
): Promise<{ bookDeltaId: string }> {
  const delta: BookDeltaType = {
    companyId: args.companyId,
    engineModuleId: args.engineModuleId,
    instructionId: args.instructionId ?? undefined,
    traceId: args.traceId ?? undefined,
    routingMode: args.routingMode,
    dimensions: [
      {
        kind: 'reject_code',
        internalValue: 'filled',
        referenceValue: rejectCode,
        unit: 'code',
      },
    ],
    feedClassInternal: args.feedClassInternal,
    feedClassReference: 'provider_reject',
  };
  const { bookDeltaId } = await persistBookDelta(db, {
    companyId: args.companyId,
    engineModuleId: args.engineModuleId,
    instructionId: args.instructionId,
    traceId: args.traceId,
    routingMode: args.routingMode,
    delta,
  });
  await linkBookDeltaTrainingFeedback(db, {
    companyId: args.companyId,
    moduleId: args.engineModuleId,
    traceId: args.traceId,
    bookDeltaId,
  });
  return { bookDeltaId };
}
