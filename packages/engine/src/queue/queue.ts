import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { jobs } from '@hftr/db/schema';
import { PRIORITY_VALUE, type PriorityBand, type QueueClass } from '@hftr/contracts';
import type { Clock } from '../clock';

/**
 * Custom Postgres queue (agent-docs/architecture/job-orchestration.md).
 * At-least-once delivery: leases via locked_until, exponential backoff,
 * idempotency keys deduplicate enqueues. Handlers must be idempotent.
 */

export interface EnqueueDef {
  queueClass: QueueClass;
  kind: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  priority?: PriorityBand;
  runAfterMs?: number; // absolute epoch ms; defaults to now
  maxAttempts?: number;
  companyId?: string | null;
  moduleId?: string | null;
}

/** Insert a job; duplicate idempotency keys are silently ignored (dedup). */
export async function enqueue(db: Db, clock: Clock, def: EnqueueDef): Promise<void> {
  await db
    .insert(jobs)
    .values({
      queueClass: def.queueClass,
      kind: def.kind,
      payload: def.payload,
      idempotencyKey: def.idempotencyKey,
      priority: PRIORITY_VALUE[def.priority ?? 'NORMAL'],
      runAfter: new Date(def.runAfterMs ?? clock.nowMs()),
      maxAttempts: def.maxAttempts ?? 5,
      companyId: def.companyId ?? null,
      moduleId: def.moduleId ?? null,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey });
}

export interface ClaimOptions {
  workerId: string;
  queueClasses: QueueClass[];
  limit: number;
  leaseMs: number;
}

export type ClaimedJob = typeof jobs.$inferSelect;

/**
 * Claim due jobs with FOR UPDATE SKIP LOCKED so concurrent drains never
 * double-claim. Also reclaims jobs whose lease expired (crashed worker).
 */
export async function claimJobs(db: Db, clock: Clock, opts: ClaimOptions): Promise<ClaimedJob[]> {
  const now = new Date(clock.nowMs());
  const leaseUntil = new Date(clock.nowMs() + opts.leaseMs);
  const rows = await db.execute(sql`
    UPDATE jobs SET
      status = 'active',
      locked_by = ${opts.workerId},
      locked_until = ${leaseUntil.toISOString()},
      attempts = attempts + 1,
      updated_at = ${now.toISOString()}
    WHERE id IN (
      SELECT id FROM jobs
      WHERE queue_class IN (${sql.join(
        opts.queueClasses.map((c) => sql`${c}`),
        sql`, `,
      )})
        AND run_after <= ${now.toISOString()}
        AND (
          status = 'pending'
          OR (status = 'active' AND locked_until < ${now.toISOString()})
        )
      ORDER BY priority DESC, run_after ASC
      LIMIT ${opts.limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  return rows.rows as unknown as ClaimedJob[];
}

export async function completeJob(db: Db, clock: Clock, jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'completed',
      lockedBy: null,
      lockedUntil: null,
      updatedAt: new Date(clock.nowMs()),
    })
    .where(eq(jobs.id, jobId));
}

/** Backoff schedule: 30s, 2m, 10m, 30m, then dead-letter. */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000];

export async function failJob(db: Db, clock: Clock, job: ClaimedJob, error: string): Promise<void> {
  const isDead = job.attempts >= job.maxAttempts;
  const backoff = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)] ?? 1_800_000;
  await db
    .update(jobs)
    .set(
      isDead
        ? {
            status: 'dead',
            lastError: error,
            lockedBy: null,
            lockedUntil: null,
            updatedAt: new Date(clock.nowMs()),
          }
        : {
            status: 'pending',
            lastError: error,
            lockedBy: null,
            lockedUntil: null,
            runAfter: new Date(clock.nowMs() + backoff),
            updatedAt: new Date(clock.nowMs()),
          },
    )
    .where(eq(jobs.id, job.id));
}

/** Return counts by status/queue for the /api/queue/stats projection. */
export async function queueStats(db: Db) {
  const rows = await db
    .select({
      status: jobs.status,
      queueClass: jobs.queueClass,
      count: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .groupBy(jobs.status, jobs.queueClass);
  return rows;
}

/** Requeue jobs stuck past their lease (defensive sweep; claim also reclaims). */
export async function sweepExpiredLeases(db: Db, clock: Clock): Promise<number> {
  const now = new Date(clock.nowMs());
  const result = await db
    .update(jobs)
    .set({ status: 'pending', lockedBy: null, lockedUntil: null, updatedAt: now })
    .where(and(eq(jobs.status, 'active'), lt(jobs.lockedUntil, now)))
    .returning({ id: jobs.id });
  return result.length;
}

/** Prune completed jobs older than retentionMs (maintenance job). */
export async function pruneCompleted(db: Db, clock: Clock, retentionMs: number): Promise<number> {
  const cutoff = new Date(clock.nowMs() - retentionMs);
  const result = await db
    .delete(jobs)
    .where(and(inArray(jobs.status, ['completed']), lte(jobs.updatedAt, cutoff)))
    .returning({ id: jobs.id });
  return result.length;
}
