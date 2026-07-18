import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { HandoffEnvelope } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { actionInstructions, engineInstances, modules, positions } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { isExpired, load, record } from '../calc/store';
import { enqueue } from '../queue/queue';
import { getSyntheticQuote } from './quotes';

/**
 * Model-free position lifecycle exits (maintenance.position_exits).
 * Breakeven/minimize-loss when mark is at or below average cost; deadline
 * when targetExitRef has passed; optional time_stop horizon stub.
 */

export type PositionExitReason = 'breakeven' | 'target_exit_deadline' | 'time_stop';

export interface PositionExitSignal {
  companyId: string;
  moduleId: string;
  symbol: string;
  qty: bigint;
  avgCostCents: number;
  markCents: number;
  reason: PositionExitReason;
}

const VERIFICATION_SCHEMA_VERSION = 'trade_verify_v1';
const QUOTE_TTL_MS = 90_000;
const DEFAULT_TIME_STOP_MINUTES = 60;
/** Ignore pure bid/ask round-trip gap so breakeven does not fire on the entry fill alone. */
const DEFAULT_BREAKEVEN_BUFFER_BPS = 15;

/**
 * Long position: exit when mark is below average cost by more than the buffer
 * (spread-aware minimize-loss — not an immediate post-fill sell).
 */
export function shouldExitBreakeven(
  avgCostCents: number,
  markCents: number,
  bufferBps = DEFAULT_BREAKEVEN_BUFFER_BPS,
): boolean {
  if (avgCostCents <= 0 || markCents <= 0) return false;
  const floor = Math.floor((avgCostCents * (10_000 - bufferBps)) / 10_000);
  return markCents <= floor;
}

/** Optional time_stop stub: exit when held longer than the typical horizon. */
export function shouldExitTimeStop(
  openedAtMs: number,
  nowMs: number,
  holdMinutesTypical = DEFAULT_TIME_STOP_MINUTES,
): boolean {
  return nowMs >= openedAtMs + holdMinutesTypical * 60_000;
}

export function shouldExitTargetDeadline(targetExitMs: number, nowMs: number): boolean {
  return nowMs >= targetExitMs;
}

function minuteBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 16);
}

function resolveMarkCents(quote: ReturnType<typeof getSyntheticQuote>): number | null {
  const mark = quote.lastCents ?? quote.bidCents;
  return mark != null && mark > 0 ? mark : null;
}

async function resolveTargetExitMs(
  db: Db,
  clock: Clock,
  ref: string | null,
): Promise<number | null> {
  if (!ref) return null;
  try {
    const row = await load(db, ref);
    if (isExpired(row, clock) || row.kind !== 'timestamp_ms') return null;
    return Number(row.valueInt);
  } catch {
    return null;
  }
}

export function resolvePositionExitReason(args: {
  avgCostCents: number;
  markCents: number | null;
  targetExitMs: number | null;
  openedAtMs: number;
  nowMs: number;
  /** When false, skip the time_stop stub. */
  timeStopEnabled?: boolean;
}): PositionExitReason | null {
  if (args.markCents === null) return null;

  if (args.targetExitMs !== null && shouldExitTargetDeadline(args.targetExitMs, args.nowMs)) {
    return 'target_exit_deadline';
  }
  if (shouldExitBreakeven(args.avgCostCents, args.markCents)) {
    return 'breakeven';
  }
  if (
    args.timeStopEnabled !== false &&
    shouldExitTimeStop(args.openedAtMs, args.nowMs)
  ) {
    return 'time_stop';
  }
  return null;
}

export function exitReasonLabel(reason: PositionExitReason): string {
  switch (reason) {
    case 'breakeven':
      return 'breakeven_minimize_loss';
    case 'target_exit_deadline':
      return 'target_exit_deadline';
    case 'time_stop':
      return 'time_stop_stub';
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Scan open positions for model-free exit signals. Skips missing quotes and qty <= 0. */
export async function scanPositionExitSignals(
  db: Db,
  clock: Clock,
  companyId: string,
  opts?: { timeStopEnabled?: boolean },
): Promise<PositionExitSignal[]> {
  const nowMs = clock.nowMs();
  const rows = await db
    .select({
      moduleId: positions.moduleId,
      symbol: positions.symbol,
      qty: positions.qty,
      avgCostCents: positions.avgCostCents,
      openedAt: positions.createdAt,
      moduleTargetExitRef: modules.targetExitRef,
      engineTargetExitRef: engineInstances.targetExitRef,
    })
    .from(positions)
    .innerJoin(modules, eq(positions.moduleId, modules.id))
    .leftJoin(engineInstances, eq(modules.engineInstanceId, engineInstances.id))
    .where(and(eq(positions.companyId, companyId), gt(positions.qty, 0n)));

  const signals: PositionExitSignal[] = [];

  for (const row of rows) {
    if (row.qty <= 0n) continue;

    const quote = getSyntheticQuote(row.symbol, clock);
    const markCents = resolveMarkCents(quote);
    if (markCents === null) continue;

    const targetExitRef = row.moduleTargetExitRef ?? row.engineTargetExitRef ?? null;
    const targetExitMs = await resolveTargetExitMs(db, clock, targetExitRef);

    const reason = resolvePositionExitReason({
      avgCostCents: row.avgCostCents,
      markCents,
      targetExitMs,
      openedAtMs: row.openedAt.getTime(),
      nowMs,
      ...(opts?.timeStopEnabled !== undefined
        ? { timeStopEnabled: opts.timeStopEnabled }
        : {}),
    });
    if (!reason) continue;

    signals.push({
      companyId,
      moduleId: row.moduleId,
      symbol: row.symbol,
      qty: row.qty,
      avgCostCents: row.avgCostCents,
      markCents,
      reason,
    });
  }

  return signals;
}

/** Create ValueRefs + sell instruction and enqueue dispatch.paper_trade (instructionId only). */
export async function enqueuePositionExit(
  db: Db,
  clock: Clock,
  signal: PositionExitSignal,
): Promise<string | null> {
  const qty = Number(signal.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const idempotencyKey = `position-exit-${signal.moduleId}-${signal.symbol}-${minuteBucket(clock.nowMs())}`;

  const quantityRef = await record(db, clock, {
    kind: 'quantity',
    unit: 'shares',
    scale: 0,
    valueInt: BigInt(qty),
    sourceClass: 'derived',
    sourceId: `position_exit:${signal.moduleId}:${signal.symbol}:qty`,
    ttlMs: 10 * 60_000,
    sanity: { minInt: '1', maxInt: '100000', maxAgeMs: null, mustBePositive: true },
    companyId: signal.companyId,
    moduleId: signal.moduleId,
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
    companyId: signal.companyId,
    moduleId: signal.moduleId,
  });
  await record(db, clock, {
    kind: 'price',
    unit: 'USD_cents',
    scale: 0,
    valueInt: BigInt(signal.markCents),
    sourceClass: 'synthetic_sim',
    sourceId: `synthetic_sim:${signal.symbol.toUpperCase()}`,
    ttlMs: QUOTE_TTL_MS,
    companyId: signal.companyId,
    moduleId: signal.moduleId,
  });

  const envelope: HandoffEnvelope = {
    contractVersion: '1.0.0',
    producerRunId: null,
    companyId: signal.companyId,
    moduleId: signal.moduleId,
    authorityClass: 'DETERMINISTIC',
    mutationClass: 'IMMUTABLE',
    queueClass: 'DISPATCH',
    priorityBand: 'HIGH',
    timeoutClass: 'SHORT',
    idempotencyKey,
    replayHash: null,
    controlSnapshotRef: null,
    causationRefs: [exitReasonLabel(signal.reason)],
    expiresAt: null,
  };

  const instructionRows = await db
    .insert(actionInstructions)
    .values({
      companyId: signal.companyId,
      moduleId: signal.moduleId,
      actionVerb: 'sell',
      symbol: signal.symbol,
      orderType: 'market',
      timeInForce: 'day',
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

  await enqueue(db, clock, {
    queueClass: 'DISPATCH',
    kind: 'dispatch.paper_trade',
    payload: {
      instructionId,
      companyId: signal.companyId,
      moduleId: signal.moduleId,
    },
    idempotencyKey,
    priority: 'HIGH',
    companyId: signal.companyId,
    moduleId: signal.moduleId,
  });

  return instructionId;
}
