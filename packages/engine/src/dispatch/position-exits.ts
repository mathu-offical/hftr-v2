import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { HandoffEnvelope, SessionPhase } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { actionInstructions, engineInstances, modules, positions } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { getSession, sessionPhase, venueDate } from '../calendar/calendar';
import { isExpired, load, record } from '../calc/store';
import {
  getBoundedRangeBand,
  getRrTargetLadder,
  getTimeStopTypicalMinutes,
} from '../pipeline/bands';
import { enqueue } from '../queue/queue';
import { getSyntheticQuote } from './quotes';

/**
 * Model-free position lifecycle exits (maintenance.position_exits).
 * Catalog bands: atr_stop_multiplier, rr_target_ladder, scale_out_fraction,
 * time_stop.synthetic ATR proxy when live atr_stream is unavailable.
 */

export type PositionExitReason =
  | 'breakeven'
  | 'target_exit_deadline'
  | 'time_stop'
  | 'session_close'
  | 'atr_stop'
  | 'measurable_gain_take'
  | 'rr_tp1_scale_out'
  | 'rr_tp2_scale_out'
  | 'rr_tp3_exit';

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
/** Ignore pure bid/ask round-trip gap so breakeven does not fire on the entry fill alone. */
const DEFAULT_BREAKEVEN_BUFFER_BPS = 15;
/**
 * Paper synthetic ATR proxy: 50 bps of mark (floor 1¢). Not live atr_stream —
 * documented as synthetic until OHLC ATR ValueRefs ship.
 */
const SYNTHETIC_ATR_BPS = 50;
/**
 * Net measurable-gain floor (bps of avg cost) after covering synthetic round-trip
 * spread (~4 bps each way). Take-profit exits require clearing this floor so
 * auto-exits fire on intention-aligned gains, not noise.
 */
const MEASURABLE_GAIN_NET_BPS = 25;
/** Half-spread proxy matching getSyntheticQuote (2 bps of mid, min 1¢). */
const SYNTHETIC_HALF_SPREAD_BPS = 2;

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

/** Optional time_stop: exit when held longer than the catalog typical horizon. */
export function shouldExitTimeStop(
  openedAtMs: number,
  nowMs: number,
  holdMinutesTypical = getTimeStopTypicalMinutes(),
): boolean {
  return nowMs >= openedAtMs + holdMinutesTypical * 60_000;
}

export function shouldExitTargetDeadline(targetExitMs: number, nowMs: number): boolean {
  return nowMs >= targetExitMs;
}

/** True when the cash session is closed / overnight (flat-by-close candidate). */
export function isCashSessionClosed(phase: SessionPhase): boolean {
  switch (phase) {
    case 'closed':
    case 'overnight':
      return true;
    case 'pre_market':
    case 'open':
    case 'midday':
    case 'power_hour':
      return false;
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

/**
 * Catalog time_stop_band max = session_close — flatten after the cash session.
 * Positions opened while already closed (weekend / overnight paper) must not
 * flatten on the next maintenance tick; wait for a real open→close cycle.
 */
export function shouldExitSessionClose(
  phase: SessionPhase,
  opts?: { openedDuringOpenSession?: boolean },
): boolean {
  if (!isCashSessionClosed(phase)) return false;
  if (opts?.openedDuringOpenSession === false) return false;
  return true;
}

/**
 * Minimum mark above avg cost (cents) that counts as a measurable long gain:
 * synthetic round-trip spread + net gain bps.
 */
export function measurableGainFloorCents(
  avgCostCents: number,
  netGainBps = MEASURABLE_GAIN_NET_BPS,
): number {
  if (avgCostCents <= 0) return 1;
  const halfSpread = Math.max(1, Math.round((avgCostCents * SYNTHETIC_HALF_SPREAD_BPS) / 10_000));
  const roundTrip = halfSpread * 2;
  const netGain = Math.max(1, Math.floor((avgCostCents * netGainBps) / 10_000));
  return roundTrip + netGain;
}

/** Long: take profit when mark clears the measurable-gain floor above avg cost. */
export function shouldExitMeasurableGain(
  avgCostCents: number,
  markCents: number,
  netGainBps = MEASURABLE_GAIN_NET_BPS,
): boolean {
  if (avgCostCents <= 0 || markCents <= 0) return false;
  return markCents >= avgCostCents + measurableGainFloorCents(avgCostCents, netGainBps);
}

/** Deterministic synthetic ATR in cents from mark (paper loop). */
export function syntheticAtrCents(markCents: number, atrBps = SYNTHETIC_ATR_BPS): number {
  if (markCents <= 0) return 1;
  return Math.max(1, Math.floor((markCents * atrBps) / 10_000));
}

/** Initial risk distance R in cents = atr_mult × ATR. */
export function riskDistanceCents(atrCents: number, atrMult: number): number {
  if (atrCents <= 0 || atrMult <= 0) return 0;
  return Math.max(1, Math.floor(atrCents * atrMult));
}

export function shouldExitAtrStop(
  avgCostCents: number,
  markCents: number,
  riskCents: number,
): boolean {
  if (avgCostCents <= 0 || markCents <= 0 || riskCents <= 0) return false;
  return markCents <= avgCostCents - riskCents;
}

export function shouldHitRrMultiple(
  avgCostCents: number,
  markCents: number,
  riskCents: number,
  rMultiple: number,
): boolean {
  if (avgCostCents <= 0 || markCents <= 0 || riskCents <= 0 || rMultiple <= 0) return false;
  const target = avgCostCents + Math.floor(riskCents * rMultiple);
  return markCents >= target;
}

/** Scale-out qty from catalog pct; qty=1 takes full exit (cannot tranche). */
export function scaleOutQty(qty: bigint, scalePct: number): bigint {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  if (n === 1) return 1n;
  const pct = Math.min(100, Math.max(1, scalePct));
  const out = Math.floor((n * pct) / 100);
  if (out <= 0) return 1n;
  if (out >= n) return BigInt(n - 1);
  return BigInt(out);
}

function minuteBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 16);
}

function dayBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
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

function defaultAtrMultiplier(): number {
  const band = getBoundedRangeBand('atr_stop_multiplier_band');
  return band?.typical ?? 2.25;
}

export function resolvePositionExitReason(args: {
  avgCostCents: number;
  markCents: number | null;
  targetExitMs: number | null;
  openedAtMs: number;
  nowMs: number;
  /** When false, skip the time_stop stub. */
  timeStopEnabled?: boolean;
  /** When false, skip ATR / RR ladder (tests). */
  catalogExitsEnabled?: boolean;
  atrMultiplier?: number;
  /** XNYS (or venue) session phase for flat-by-close. */
  sessionPhase?: SessionPhase | null;
  /**
   * When false, skip session_close (position opened while cash session was
   * already closed — weekend/overnight paper). Default true when omitted.
   */
  openedDuringOpenSession?: boolean;
}): PositionExitReason | null {
  if (args.markCents === null) return null;

  if (args.targetExitMs !== null && shouldExitTargetDeadline(args.targetExitMs, args.nowMs)) {
    return 'target_exit_deadline';
  }

  if (args.catalogExitsEnabled !== false) {
    const atrMult = args.atrMultiplier ?? defaultAtrMultiplier();
    const atr = syntheticAtrCents(args.avgCostCents);
    const risk = riskDistanceCents(atr, atrMult);
    const ladder = getRrTargetLadder();

    // Protect capital first.
    if (shouldExitAtrStop(args.avgCostCents, args.markCents, risk)) {
      return 'atr_stop';
    }

    // Prefer measurable / RR gains before flat-by-close.
    if (shouldHitRrMultiple(args.avgCostCents, args.markCents, risk, ladder.tp3R)) {
      return 'rr_tp3_exit';
    }
    if (shouldHitRrMultiple(args.avgCostCents, args.markCents, risk, ladder.tp2R)) {
      return 'rr_tp2_scale_out';
    }
    if (shouldHitRrMultiple(args.avgCostCents, args.markCents, risk, ladder.tp1R)) {
      return 'rr_tp1_scale_out';
    }
    if (shouldExitMeasurableGain(args.avgCostCents, args.markCents)) {
      return 'measurable_gain_take';
    }

    if (
      args.sessionPhase &&
      shouldExitSessionClose(args.sessionPhase, {
        openedDuringOpenSession: args.openedDuringOpenSession !== false,
      })
    ) {
      return 'session_close';
    }
  } else if (
    args.sessionPhase &&
    shouldExitSessionClose(args.sessionPhase, {
      openedDuringOpenSession: args.openedDuringOpenSession !== false,
    })
  ) {
    return 'session_close';
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
      return 'time_stop_catalog';
    case 'session_close':
      return 'session_close_flat';
    case 'atr_stop':
      return 'atr_stop_catalog';
    case 'measurable_gain_take':
      return 'measurable_gain_take';
    case 'rr_tp1_scale_out':
      return 'rr_tp1_scale_out';
    case 'rr_tp2_scale_out':
      return 'rr_tp2_scale_out';
    case 'rr_tp3_exit':
      return 'rr_tp3_exit';
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Recovery-ladder phase labels for operator lineage (catalog-aligned verbs). */
export function recoveryPhaseForExit(reason: PositionExitReason): string {
  switch (reason) {
    case 'atr_stop':
    case 'breakeven':
      return 'escalate_or_abort';
    case 'measurable_gain_take':
    case 'rr_tp1_scale_out':
    case 'rr_tp2_scale_out':
      return 'constrain';
    case 'rr_tp3_exit':
    case 'target_exit_deadline':
    case 'time_stop':
    case 'session_close':
      return 'observe';
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function resolveExitQty(qty: bigint, reason: PositionExitReason): bigint {
  const ladder = getRrTargetLadder();
  switch (reason) {
    case 'rr_tp1_scale_out':
      return scaleOutQty(qty, ladder.tp1ScalePct);
    case 'rr_tp2_scale_out':
      return scaleOutQty(qty, ladder.tp2ScalePct);
    case 'measurable_gain_take':
      // Skim half when sized for tranches; full exit on qty=1.
      return scaleOutQty(qty, ladder.tp1ScalePct);
    case 'rr_tp3_exit':
    case 'atr_stop':
    case 'breakeven':
    case 'target_exit_deadline':
    case 'time_stop':
    case 'session_close':
      return qty;
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function exitIdempotencyKey(
  moduleId: string,
  symbol: string,
  reason: PositionExitReason,
  nowMs: number,
): string {
  switch (reason) {
    case 'measurable_gain_take':
    case 'rr_tp1_scale_out':
    case 'rr_tp2_scale_out':
    case 'rr_tp3_exit':
      // Once per day per stage so maintenance ticks do not re-scale every minute.
      return `position-exit-${moduleId}-${symbol}-${reason}-${dayBucket(nowMs)}`;
    case 'atr_stop':
    case 'breakeven':
    case 'target_exit_deadline':
    case 'time_stop':
    case 'session_close':
      return `position-exit-${moduleId}-${symbol}-${reason}-${minuteBucket(nowMs)}`;
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
  opts?: { timeStopEnabled?: boolean; catalogExitsEnabled?: boolean },
): Promise<PositionExitSignal[]> {
  const nowMs = clock.nowMs();
  const session = await getSession(db, 'XNYS', venueDate(nowMs, 'America/New_York'));
  const phase = sessionPhase(session, nowMs);
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

    const openedAtMs = row.openedAt.getTime();
    const openSession = await getSession(
      db,
      'XNYS',
      venueDate(openedAtMs, 'America/New_York'),
    );
    const openedPhase = sessionPhase(openSession, openedAtMs);
    const openedDuringOpenSession = !isCashSessionClosed(openedPhase);

    const reason = resolvePositionExitReason({
      avgCostCents: row.avgCostCents,
      markCents,
      targetExitMs,
      openedAtMs,
      nowMs,
      sessionPhase: phase,
      openedDuringOpenSession,
      ...(opts?.timeStopEnabled !== undefined
        ? { timeStopEnabled: opts.timeStopEnabled }
        : {}),
      ...(opts?.catalogExitsEnabled !== undefined
        ? { catalogExitsEnabled: opts.catalogExitsEnabled }
        : {}),
    });
    if (!reason) continue;

    const exitQty = resolveExitQty(row.qty, reason);
    if (exitQty <= 0n) continue;

    signals.push({
      companyId,
      moduleId: row.moduleId,
      symbol: row.symbol,
      qty: exitQty,
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

  const nowMs = clock.nowMs();
  const idempotencyKey = exitIdempotencyKey(
    signal.moduleId,
    signal.symbol,
    signal.reason,
    nowMs,
  );

  const quantityRef = await record(db, clock, {
    kind: 'quantity',
    unit: 'shares',
    scale: 0,
    valueInt: BigInt(qty),
    sourceClass: 'derived',
    sourceId: `position_exit:${signal.moduleId}:${signal.symbol}:${signal.reason}:qty`,
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
    causationRefs: [exitReasonLabel(signal.reason), recoveryPhaseForExit(signal.reason)],
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
