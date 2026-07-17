import { and, eq } from 'drizzle-orm';
import type { QueueClass } from '@hftr/contracts';
import { jobSchedules } from '@hftr/db/schema';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { enqueue } from '../queue/queue';

export interface ParsedScheduleExpr {
  kind: 'interval';
  minutes: number;
}

const EVERY_PREFIX = 'every:';

/** Parse cadence-driven every:<minutes> or simple minute-step cron (star-slash-N). */
export function parseScheduleExpr(cronExpr: string): ParsedScheduleExpr | null {
  if (cronExpr.startsWith(EVERY_PREFIX)) {
    const minutes = Number.parseInt(cronExpr.slice(EVERY_PREFIX.length), 10);
    if (!Number.isFinite(minutes) || minutes < 1) return null;
    return { kind: 'interval', minutes };
  }
  const minuteCron = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/;
  const match = minuteCron.exec(cronExpr.trim());
  if (!match?.[1]) return null;
  const minutes = Number.parseInt(match[1], 10);
  if (!Number.isFinite(minutes) || minutes < 1) return null;
  return { kind: 'interval', minutes };
}

export function scheduleWindowKey(scheduleId: string, windowStartMs: number): string {
  return `${scheduleId}:${new Date(windowStartMs).toISOString()}`;
}

export function isScheduleDue(
  schedule: {
    cronExpr: string;
    lastMaterializedWindow: Date | null;
    createdAt: Date;
  },
  nowMs: number,
): { due: boolean; windowStartMs: number } {
  const parsed = parseScheduleExpr(schedule.cronExpr);
  if (!parsed) {
    return { due: false, windowStartMs: nowMs };
  }
  const anchorMs = schedule.lastMaterializedWindow?.getTime() ?? schedule.createdAt.getTime();
  const nextDueMs = anchorMs + parsed.minutes * 60_000;
  if (nowMs < nextDueMs) {
    return { due: false, windowStartMs: anchorMs };
  }
  return { due: true, windowStartMs: nextDueMs };
}

export async function materializeSchedules(db: Db, clock: Clock): Promise<number> {
  const nowMs = clock.nowMs();
  const now = new Date(nowMs);
  const schedules = await db.select().from(jobSchedules).where(eq(jobSchedules.enabled, true));

  let materialized = 0;
  for (const schedule of schedules) {
    const { due, windowStartMs } = isScheduleDue(schedule, nowMs);
    if (!due) continue;

    const windowKey = scheduleWindowKey(schedule.id, windowStartMs);
    await enqueue(db, clock, {
      queueClass: schedule.queueClass as QueueClass,
      kind: schedule.kind,
      payload: (schedule.payloadTemplate ?? {}) as Record<string, unknown>,
      idempotencyKey: `schedule-${windowKey}`,
      companyId: schedule.companyId,
      moduleId: schedule.moduleId,
    });

    await db
      .update(jobSchedules)
      .set({
        lastMaterializedWindow: now,
        updatedAt: now,
      })
      .where(eq(jobSchedules.id, schedule.id));
    materialized += 1;
  }
  return materialized;
}

function researchScheduleName(moduleId: string): string {
  return `research-cadence-${moduleId}`;
}

/** Upsert a research module cadence schedule (`every:<minutes>` materialization). */
export async function ensureResearchCadenceSchedule(
  db: Db,
  clock: Clock,
  opts: {
    companyId: string;
    moduleId: string;
    cadenceMinutes: number;
    topicScope: string;
  },
): Promise<void> {
  const now = new Date(clock.nowMs());
  const name = researchScheduleName(opts.moduleId);
  const cronExpr = `${EVERY_PREFIX}${opts.cadenceMinutes}`;
  const payloadTemplate = {
    companyId: opts.companyId,
    moduleId: opts.moduleId,
    topicScope: opts.topicScope,
  };

  const existing = await db
    .select({ id: jobSchedules.id })
    .from(jobSchedules)
    .where(and(eq(jobSchedules.companyId, opts.companyId), eq(jobSchedules.name, name)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(jobSchedules)
      .set({
        cronExpr,
        queueClass: 'RESEARCH',
        kind: 'research.curate',
        payloadTemplate,
        moduleId: opts.moduleId,
        enabled: true,
        updatedAt: now,
      })
      .where(eq(jobSchedules.id, existing[0].id));
    return;
  }

  await db.insert(jobSchedules).values({
    name,
    cronExpr,
    queueClass: 'RESEARCH',
    kind: 'research.curate',
    payloadTemplate,
    companyId: opts.companyId,
    moduleId: opts.moduleId,
    enabled: true,
  });
}
