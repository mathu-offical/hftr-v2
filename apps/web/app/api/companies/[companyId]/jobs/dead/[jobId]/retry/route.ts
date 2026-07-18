import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { jobs } from '@hftr/db/schema';
import { createSystemClock, enqueue, stripSecretsFromJobPayload, type JobCostEstimate } from '@hftr/engine';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), jobId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; jobId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, jobId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId), eq(jobs.status, 'dead')))
      .limit(1);
    const dead = rows[0];
    if (!dead) throw new ApiError(404, 'not_found');

    const clock = createSystemClock();
    const suffix = `${clock.nowMs()}`;
    // D-074: never re-persist legacy plaintext keys from dead rows.
    const payload = stripSecretsFromJobPayload(
      (dead.payload ?? {}) as Record<string, unknown>,
    );
    await enqueue(db, clock, {
      queueClass: dead.queueClass,
      kind: dead.kind,
      payload,
      idempotencyKey: `${dead.idempotencyKey}:retry:${suffix}`,
      priority: 'NORMAL',
      companyId: dead.companyId,
      moduleId: dead.moduleId,
      costEstimate: (dead.costEstimate ?? {}) as JobCostEstimate,
    });

    return { retried: true, sourceJobId: dead.id };
  });
}
