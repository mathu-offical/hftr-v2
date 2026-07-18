import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { jobs } from '@hftr/db/schema';
import {
  createSystemClock,
  enqueue,
  stripSecretsFromJobPayload,
  type JobCostEstimate,
} from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
const BulkRetryBody = z.object({ jobIds: z.array(z.string().uuid()).min(1).max(20) });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select({
        id: jobs.id,
        kind: jobs.kind,
        queueClass: jobs.queueClass,
        moduleId: jobs.moduleId,
        lastError: jobs.lastError,
        attempts: jobs.attempts,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.status, 'dead')))
      .orderBy(desc(jobs.updatedAt))
      .limit(100);
    return {
      jobs: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const { jobIds } = await parseBody(req, BulkRetryBody);

    const deadRows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.status, 'dead'), inArray(jobs.id, jobIds)));

    if (deadRows.length === 0) {
      throw new ApiError(404, 'not_found');
    }

    const clock = createSystemClock();
    const suffix = `${clock.nowMs()}`;
    const retried: string[] = [];

    for (const dead of deadRows) {
      // D-074: never re-persist legacy plaintext keys from dead rows.
      const payload = stripSecretsFromJobPayload((dead.payload ?? {}) as Record<string, unknown>);
      await enqueue(db, clock, {
        queueClass: dead.queueClass,
        kind: dead.kind,
        payload,
        idempotencyKey: `${dead.idempotencyKey}:retry:${suffix}:${dead.id}`,
        priority: 'NORMAL',
        companyId: dead.companyId,
        moduleId: dead.moduleId,
        costEstimate: (dead.costEstimate ?? {}) as JobCostEstimate,
      });
      retried.push(dead.id);
    }

    return { retried: true, jobIds: retried };
  });
}
