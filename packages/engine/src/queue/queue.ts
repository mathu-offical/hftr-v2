import { and, eq, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { jobs, llmBudgets } from '@hftr/db/schema';
import { PRIORITY_VALUE, type PriorityBand, type QueueClass } from '@hftr/contracts';
import type { Clock } from '../clock';
import {
  BUDGET_QUEUED_ERROR,
  hasNonEmptyCostEstimate,
  isBudgetExhausted,
  isLlmBudgetQueueClass,
  LLM_BUDGET_QUEUE_CLASSES,
  resolveBudgetProvider,
  type JobCostEstimate,
} from './budget-admission';
import { assertNoSecretsInJobPayload } from './payload-secrets';

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
  costEstimate?: JobCostEstimate;
}

export type { JobCostEstimate };

/** Insert a job; duplicate idempotency keys are silently ignored (dedup). */
export async function enqueue(db: Db, clock: Clock, def: EnqueueDef): Promise<void> {
  // D-074: fail-closed — never persist operator secrets into jobs.payload jsonb.
  assertNoSecretsInJobPayload(def.payload);
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
      costEstimate: def.costEstimate ?? {},
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
 *
 * D-052: company-wide serial queue — skip companies with an active lease;
 * within a claim batch keep ≤1 job per company_id (null-company maintenance
 * stays parallel). Engines on one company therefore run sequentially.
 */
/** Stamp budget_queued on pending LLM jobs when company budget is exhausted. */
export async function deferBudgetQueuedJobs(db: Db, clock: Clock): Promise<number> {
  const nowMs = clock.nowMs();
  const now = new Date(nowMs);
  const pending = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, 'pending'),
        inArray(jobs.queueClass, [...LLM_BUDGET_QUEUE_CLASSES]),
        isNotNull(jobs.companyId),
        or(sql`${jobs.lastError} IS NULL`, sql`${jobs.lastError} <> ${BUDGET_QUEUED_ERROR}`),
      ),
    );

  let deferred = 0;
  for (const job of pending) {
    const estimate = (job.costEstimate ?? {}) as JobCostEstimate;
    if (!hasNonEmptyCostEstimate(estimate) || !job.companyId) continue;
    const provider = resolveBudgetProvider(estimate);
    if (!provider) continue;

    const budgetRows = await db
      .select()
      .from(llmBudgets)
      .where(
        and(
          eq(llmBudgets.scope, 'company'),
          eq(llmBudgets.scopeId, job.companyId),
          eq(llmBudgets.provider, provider),
        ),
      )
      .limit(1);
    const budget = budgetRows[0];
    if (!budget) continue;

    if (
      isBudgetExhausted(
        {
          consumedCalls: budget.consumedCalls,
          maxCalls: budget.maxCalls,
          consumedCostCents: budget.consumedCostCents,
          maxCostCents: budget.maxCostCents,
          windowMinutes: budget.windowMinutes,
          windowStartedAt: budget.windowStartedAt,
        },
        estimate,
        nowMs,
      )
    ) {
      await db
        .update(jobs)
        .set({ lastError: BUDGET_QUEUED_ERROR, updatedAt: now })
        .where(eq(jobs.id, job.id));
      deferred += 1;
    }
  }
  return deferred;
}

/** Clear budget_queued marker when company budget has headroom again. */
export async function clearBudgetQueueErrors(db: Db, clock: Clock): Promise<number> {
  const nowMs = clock.nowMs();
  const now = new Date(nowMs);
  const queued = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'pending'), eq(jobs.lastError, BUDGET_QUEUED_ERROR)));

  let cleared = 0;
  for (const job of queued) {
    const estimate = (job.costEstimate ?? {}) as JobCostEstimate;
    if (!job.companyId || !isLlmBudgetQueueClass(job.queueClass)) {
      await db.update(jobs).set({ lastError: null, updatedAt: now }).where(eq(jobs.id, job.id));
      cleared += 1;
      continue;
    }
    if (!hasNonEmptyCostEstimate(estimate)) {
      await db.update(jobs).set({ lastError: null, updatedAt: now }).where(eq(jobs.id, job.id));
      cleared += 1;
      continue;
    }
    const provider = resolveBudgetProvider(estimate);
    if (!provider) {
      await db.update(jobs).set({ lastError: null, updatedAt: now }).where(eq(jobs.id, job.id));
      cleared += 1;
      continue;
    }

    const budgetRows = await db
      .select()
      .from(llmBudgets)
      .where(
        and(
          eq(llmBudgets.scope, 'company'),
          eq(llmBudgets.scopeId, job.companyId),
          eq(llmBudgets.provider, provider),
        ),
      )
      .limit(1);
    const budget = budgetRows[0];
    if (!budget) {
      await db.update(jobs).set({ lastError: null, updatedAt: now }).where(eq(jobs.id, job.id));
      cleared += 1;
      continue;
    }

    const snapshot = {
      consumedCalls: budget.consumedCalls,
      maxCalls: budget.maxCalls,
      consumedCostCents: budget.consumedCostCents,
      maxCostCents: budget.maxCostCents,
      windowMinutes: budget.windowMinutes,
      windowStartedAt: budget.windowStartedAt,
    };
    if (!isBudgetExhausted(snapshot, estimate, nowMs)) {
      await db.update(jobs).set({ lastError: null, updatedAt: now }).where(eq(jobs.id, job.id));
      cleared += 1;
    }
  }
  return cleared;
}

export async function claimJobs(db: Db, clock: Clock, opts: ClaimOptions): Promise<ClaimedJob[]> {
  await clearBudgetQueueErrors(db, clock);
  await deferBudgetQueuedJobs(db, clock);

  const now = new Date(clock.nowMs());
  const leaseUntil = new Date(clock.nowMs() + opts.leaseMs);
  // Oversample then dedupe by company so one SKIP LOCKED claim still yields
  // up to `limit` companies when many jobs share a company_id (D-052).
  const fetchLimit = Math.max(opts.limit * 4, opts.limit);
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
        AND COALESCE(last_error, '') <> ${BUDGET_QUEUED_ERROR}
        AND (
          company_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM jobs active_job
            WHERE active_job.company_id = jobs.company_id
              AND active_job.status = 'active'
              AND active_job.locked_until >= ${now.toISOString()}
          )
        )
      ORDER BY priority DESC, run_after ASC
      LIMIT ${fetchLimit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  const claimed = rows.rows as unknown as ClaimedJob[];
  return releaseExtraCompanyClaims(db, clock, claimed, opts.limit);
}

/**
 * Keep ≤1 job per company_id in a claim batch; requeue extras as pending
 * (attempts rolled back one) so sibling engine work waits on the company queue.
 */
export async function releaseExtraCompanyClaims(
  db: Db,
  clock: Clock,
  claimed: ClaimedJob[],
  limit: number,
): Promise<ClaimedJob[]> {
  const keep: ClaimedJob[] = [];
  const release: ClaimedJob[] = [];
  const seenCompanies = new Set<string>();

  for (const job of claimed) {
    if (keep.length >= limit) {
      release.push(job);
      continue;
    }
    if (!job.companyId) {
      keep.push(job);
      continue;
    }
    if (seenCompanies.has(job.companyId)) {
      release.push(job);
      continue;
    }
    seenCompanies.add(job.companyId);
    keep.push(job);
  }

  if (release.length === 0) return keep;

  const now = new Date(clock.nowMs());
  for (const job of release) {
    await db
      .update(jobs)
      .set({
        status: 'pending',
        lockedBy: null,
        lockedUntil: null,
        attempts: Math.max(0, job.attempts - 1),
        updatedAt: now,
      })
      .where(eq(jobs.id, job.id));
  }
  return keep;
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
