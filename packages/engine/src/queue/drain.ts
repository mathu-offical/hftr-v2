import type { Db } from '@hftr/db';
import { TIMEOUT_LEASE_MS, QueueClass, type QueueClass as QueueClassT } from '@hftr/contracts';
import type { Clock } from '../clock';
import type { ModelGateway } from '../handlers/model-gateway';
import { getHandler } from '../handlers/registry';
import { claimJobs, completeJob, enqueue, failJob } from './queue';

export interface DrainResult {
  claimed: number;
  completed: number;
  failed: number;
  deadlineHit: boolean;
}

export interface DrainOptions {
  workerId: string;
  budgetMs: number;
  batchSize?: number;
  modelGateway?: ModelGateway;
  /**
   * Restrict claim to these queue classes. Inline promote uses the execution
   * spine so POSTURE/LIBRARY research cannot starve compile/dispatch.
   */
  queueClasses?: QueueClassT[];
  /** When false, skip the per-minute maintenance.sweep kick (inline promote). */
  kickMaintenanceSweep?: boolean;
}

function venueMinuteBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 16);
}

/**
 * Drain loop invoked by the Vercel cron route (/api/queue/drain).
 * Claims small batches until the wall-clock budget is spent so the
 * serverless invocation always finishes cleanly.
 *
 * Each drain tick idempotently enqueues `maintenance.sweep` (once per UTC
 * minute) so due `job_schedules` materialize — research cadence, system:movers,
 * and lease/retention housekeeping (D-065).
 */
export async function drainQueues(db: Db, clock: Clock, opts: DrainOptions): Promise<DrainResult> {
  const startedAt = clock.nowMs();
  const result: DrainResult = { claimed: 0, completed: 0, failed: 0, deadlineHit: false };
  const queueClasses = opts.queueClasses ?? [...QueueClass.options];
  const kickMaintenance = opts.kickMaintenanceSweep !== false;

  if (kickMaintenance) {
    await enqueue(db, clock, {
      queueClass: 'MAINTENANCE',
      kind: 'maintenance.sweep',
      payload: {},
      idempotencyKey: `maintenance-sweep-${venueMinuteBucket(startedAt)}`,
      priority: 'LOW',
    });
  }

  for (;;) {
    if (clock.nowMs() - startedAt > opts.budgetMs) {
      result.deadlineHit = true;
      break;
    }
    const batch = await claimJobs(db, clock, {
      workerId: opts.workerId,
      queueClasses,
      limit: opts.batchSize ?? 5,
      leaseMs: TIMEOUT_LEASE_MS.MEDIUM,
    });
    if (batch.length === 0) break;
    result.claimed += batch.length;

    for (const job of batch) {
      const handler = getHandler(job.kind);
      if (!handler) {
        await failJob(db, clock, job, `no handler registered for kind "${job.kind}"`);
        result.failed += 1;
        continue;
      }
      try {
        await handler({
          db,
          clock,
          job,
          ...(opts.modelGateway !== undefined ? { modelGateway: opts.modelGateway } : {}),
        });
        await completeJob(db, clock, job.id);
        result.completed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await failJob(db, clock, job, message);
        result.failed += 1;
      }
    }
  }
  return result;
}
