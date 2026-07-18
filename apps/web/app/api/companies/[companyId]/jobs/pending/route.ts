import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { jobs } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const PENDING_STATUSES = ['pending', 'active'] as const;

/**
 * Queued / in-flight instructions for the Lineage Queue column (ui-spec §4 /
 * D-097 follow-up). Dead letters stay on GET …/jobs/dead.
 */
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
        status: jobs.status,
        attempts: jobs.attempts,
        runAfter: jobs.runAfter,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(
        and(eq(jobs.companyId, companyId), inArray(jobs.status, [...PENDING_STATUSES])),
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(100);
    return {
      jobs: rows.map((r) => ({
        ...r,
        runAfter: r.runAfter.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });
}
