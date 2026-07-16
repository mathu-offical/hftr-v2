import type { Db } from '@hftr/db';
import { TIMEOUT_LEASE_MS, QueueClass } from '@hftr/contracts';
import type { Clock } from '../clock';
import { getHandler } from '../handlers/registry';
import { claimJobs, completeJob, failJob } from './queue';

export interface DrainResult {
  claimed: number;
  completed: number;
  failed: number;
  deadlineHit: boolean;
}

/**
 * Drain loop invoked by the Vercel cron route (/api/queue/drain).
 * Claims small batches until the wall-clock budget is spent so the
 * serverless invocation always finishes cleanly.
 */
export async function drainQueues(
  db: Db,
  clock: Clock,
  opts: { workerId: string; budgetMs: number; batchSize?: number },
): Promise<DrainResult> {
  const startedAt = clock.nowMs();
  const result: DrainResult = { claimed: 0, completed: 0, failed: 0, deadlineHit: false };

  for (;;) {
    if (clock.nowMs() - startedAt > opts.budgetMs) {
      result.deadlineHit = true;
      break;
    }
    const batch = await claimJobs(db, clock, {
      workerId: opts.workerId,
      queueClasses: [...QueueClass.options],
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
        await handler({ db, clock, job });
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
