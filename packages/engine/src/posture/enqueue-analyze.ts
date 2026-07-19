/**
 * Shared Market Hub Analyze enqueue (D-111 / D-181 / D-183).
 * Manual button, scheduled ET slots, and movement auto-trigger all use this path.
 */

import { randomUUID } from 'node:crypto';
import {
  MARKET_HUB_ANALYZE_PHASE_META,
  normalizeAnalyzePhase,
  type MarketHubAnalyzePhase,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { resolveAnalyzePhase } from '../calendar/analyze-phase';
import { getSession, venueDate } from '../calendar/calendar';
import { createMarketHubSynthesisRun } from '../research/market-hub-synthesis';
import { enqueue } from '../queue/queue';

export type AnalyzeEnqueueReason = 'manual' | 'schedule' | 'movement';

export type EnqueueMarketHubAnalyzeOpts = {
  companyId: string;
  /** Explicit phase (schedules); omit to resolve from clock + session. */
  phase?: string | undefined;
  reason: AnalyzeEnqueueReason;
  forceReseal?: boolean | undefined;
  /** Optional movement trigger metadata (no secrets). */
  movementReasons?: string[] | undefined;
};

export type EnqueueMarketHubAnalyzeResult = {
  runId: string;
  analyzePhase: MarketHubAnalyzePhase;
  analyzePhaseLabel: string;
  asOfIso: string;
};

export async function enqueueMarketHubAnalyze(
  db: Db,
  clock: Clock,
  opts: EnqueueMarketHubAnalyzeOpts,
): Promise<EnqueueMarketHubAnalyzeResult> {
  const nowMs = clock.nowMs();
  const now = new Date(nowMs);
  const date = venueDate(nowMs, 'America/New_York');
  const session =
    (await getSession(db, 'XNYS', date)) ??
    ({
      venue: 'XNYS',
      sessionDate: date,
      timezone: 'America/New_York',
      openMsUtc: null,
      closeMsUtc: null,
      dayKind: 'open' as const,
    });

  const analyzePhase =
    normalizeAnalyzePhase(opts.phase) ?? resolveAnalyzePhase(session, nowMs);
  const analyzePhaseLabel = MARKET_HUB_ANALYZE_PHASE_META[analyzePhase].label;
  const forceReseal = opts.forceReseal ?? true;
  const runId = await createMarketHubSynthesisRun(db, { companyId: opts.companyId, now });
  const suffix = `${opts.reason}-${runId}`;

  await enqueue(db, clock, {
    queueClass: 'POSTURE_RESEARCH',
    kind: 'library.system_movers',
    payload: {
      companyId: opts.companyId,
      forceReseal,
      synthesisRunId: runId,
      analyzePhase,
      analyzeReason: opts.reason,
    },
    idempotencyKey: `market-hub-analyze-movers-${opts.companyId}-${suffix}`,
    priority: 'NORMAL',
    companyId: opts.companyId,
  });
  await enqueue(db, clock, {
    queueClass: 'POSTURE_RESEARCH',
    kind: 'library.system_sector_news',
    payload: {
      companyId: opts.companyId,
      forceReseal,
      synthesisRunId: runId,
      analyzePhase,
    },
    idempotencyKey: `market-hub-analyze-sector-${opts.companyId}-${suffix}`,
    priority: 'NORMAL',
    companyId: opts.companyId,
  });
  await enqueue(db, clock, {
    queueClass: 'POSTURE_RESEARCH',
    kind: 'library.system_daily_summaries',
    payload: {
      companyId: opts.companyId,
      phase: analyzePhase,
      forceReseal,
      synthesisRunId: runId,
    },
    idempotencyKey: `market-hub-analyze-daily-${opts.companyId}-${analyzePhase}-${suffix}`,
    priority: 'NORMAL',
    companyId: opts.companyId,
  });
  await enqueue(db, clock, {
    queueClass: 'POSTURE_RESEARCH',
    kind: 'library.posture_narrative',
    payload: {
      companyId: opts.companyId,
      synthesisRunId: runId,
      phase: analyzePhase,
      analyzeReason: opts.reason,
      movementReasons: opts.movementReasons?.slice(0, 12),
    },
    idempotencyKey: `market-hub-analyze-narrative-${opts.companyId}-${suffix}`,
    priority: 'LOW',
    companyId: opts.companyId,
    runAfterMs: clock.nowMs() + 5_000,
  });

  return {
    runId,
    analyzePhase,
    analyzePhaseLabel,
    asOfIso: now.toISOString(),
  };
}

/** Thin schedule/orchestrator job — payload phase drives the slot. */
export async function runScheduledMarketHubAnalyze(
  db: Db,
  clock: Clock,
  opts: { companyId: string; phase?: string },
): Promise<EnqueueMarketHubAnalyzeResult> {
  return enqueueMarketHubAnalyze(db, clock, {
    companyId: opts.companyId,
    phase: opts.phase,
    reason: 'schedule',
    forceReseal: true,
  });
}

/** Idempotency helper for movement auto-trigger keys. */
export function movementAnalyzeIdempotencySeed(): string {
  return randomUUID();
}
