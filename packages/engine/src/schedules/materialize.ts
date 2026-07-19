import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { QueueClass } from '@hftr/contracts';
import { companies, jobSchedules } from '@hftr/db/schema';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { venueDate } from '../calendar/calendar';
import { venueLocalTimeToUtcMs } from '../calendar/analyze-phase';
import { enqueue } from '../queue/queue';
import { LIBRARY_RESEARCH_QUEUE, POSTURE_RESEARCH_QUEUE } from '../research/lanes';

export type ParsedScheduleExpr =
  | { kind: 'interval'; minutes: number }
  | { kind: 'daily_et'; hour: number; minute: number };

const EVERY_PREFIX = 'every:';
const ET_PREFIX = 'et:';
const ET_TZ = 'America/New_York';

/** Parse cadence: every:<minutes>, star-slash-N cron, or et:HH:MM (America/New_York daily). */
export function parseScheduleExpr(cronExpr: string): ParsedScheduleExpr | null {
  if (cronExpr.startsWith(EVERY_PREFIX)) {
    const minutes = Number.parseInt(cronExpr.slice(EVERY_PREFIX.length), 10);
    if (!Number.isFinite(minutes) || minutes < 1) return null;
    return { kind: 'interval', minutes };
  }
  if (cronExpr.startsWith(ET_PREFIX)) {
    const match = /^et:(\d{1,2}):(\d{2})$/.exec(cronExpr.trim());
    if (!match?.[1] || !match[2]) return null;
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { kind: 'daily_et', hour, minute };
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

  if (parsed.kind === 'daily_et') {
    const dateStr = venueDate(nowMs, ET_TZ);
    const windowStartMs = venueLocalTimeToUtcMs(dateStr, parsed.hour, parsed.minute, ET_TZ);
    if (nowMs < windowStartMs) {
      return { due: false, windowStartMs };
    }
    const lastMs = schedule.lastMaterializedWindow?.getTime() ?? 0;
    if (lastMs >= windowStartMs) {
      return { due: false, windowStartMs };
    }
    return { due: true, windowStartMs };
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
  const companyIds = [
    ...new Set(
      schedules
        .map((schedule) => schedule.companyId)
        .filter((companyId): companyId is string => typeof companyId === 'string'),
    ),
  ];
  const archivedCompanyIds = new Set<string>();
  if (companyIds.length > 0) {
    const archivedRows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(inArray(companies.id, companyIds), isNotNull(companies.archivedAt)));
    for (const row of archivedRows) {
      archivedCompanyIds.add(row.id);
    }
  }

  let materialized = 0;
  for (const schedule of schedules) {
    if (schedule.companyId && archivedCompanyIds.has(schedule.companyId)) continue;
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
        queueClass: LIBRARY_RESEARCH_QUEUE,
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
    queueClass: LIBRARY_RESEARCH_QUEUE,
    kind: 'research.curate',
    payloadTemplate,
    companyId: opts.companyId,
    moduleId: opts.moduleId,
    enabled: true,
  });
}

/** Daily cadence for system:movers placeholder refresh (`library.system_movers`). */
export const SYSTEM_MOVERS_CADENCE_MINUTES = 1440;

function systemMoversScheduleName(companyId: string): string {
  return `system-movers-${companyId}`;
}

export async function ensureSystemLibrarySchedule(
  db: Db,
  clock: Clock,
  opts: {
    companyId: string;
    scheduleName: string;
    kind: string;
    /** Interval minutes when cronExpr omitted. */
    cadenceMinutes?: number;
    /** Prefer over cadenceMinutes — supports `et:HH:MM` (D-181). */
    cronExpr?: string;
    payloadTemplate?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date(clock.nowMs());
  const cronExpr =
    opts.cronExpr ??
    `${EVERY_PREFIX}${opts.cadenceMinutes ?? SYSTEM_MOVERS_CADENCE_MINUTES}`;
  const payloadTemplate = opts.payloadTemplate ?? { companyId: opts.companyId };

  const existing = await db
    .select({ id: jobSchedules.id })
    .from(jobSchedules)
    .where(
      and(eq(jobSchedules.companyId, opts.companyId), eq(jobSchedules.name, opts.scheduleName)),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(jobSchedules)
      .set({
        cronExpr,
        queueClass: POSTURE_RESEARCH_QUEUE,
        kind: opts.kind,
        payloadTemplate,
        moduleId: null,
        enabled: true,
        updatedAt: now,
      })
      .where(eq(jobSchedules.id, existing[0].id));
    return;
  }

  await db.insert(jobSchedules).values({
    name: opts.scheduleName,
    cronExpr,
    queueClass: POSTURE_RESEARCH_QUEUE,
    kind: opts.kind,
    payloadTemplate,
    companyId: opts.companyId,
    moduleId: null,
    enabled: true,
  });
}

/** Upsert company-scoped daily schedule for `library.system_movers` (D-062). */
export async function ensureSystemMoversSchedule(
  db: Db,
  clock: Clock,
  opts: { companyId: string },
): Promise<void> {
  await ensureSystemLibrarySchedule(db, clock, {
    companyId: opts.companyId,
    scheduleName: systemMoversScheduleName(opts.companyId),
    kind: 'library.system_movers',
    cadenceMinutes: SYSTEM_MOVERS_CADENCE_MINUTES,
    payloadTemplate: { companyId: opts.companyId },
  });
}
