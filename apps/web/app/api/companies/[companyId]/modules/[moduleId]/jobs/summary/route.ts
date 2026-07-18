import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { jobs } from '@hftr/db/schema';
import { BUDGET_QUEUED_ERROR } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

type ModuleJobSummaryRow = {
  kind: string;
  status: 'pending' | 'active' | 'dead';
  lastError: string | null;
  budgetQueued: boolean;
};

/**
 * Thin per-module job rows for process detail modal (layer mapping + queue strip).
 * Aggregated counts remain on GET …/canvas.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);

    const rows = await db
      .select({
        kind: jobs.kind,
        status: jobs.status,
        lastError: jobs.lastError,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.moduleId, moduleId),
          inArray(jobs.status, ['pending', 'active', 'dead']),
        ),
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(30);

    const jobsOut: ModuleJobSummaryRow[] = rows.map((row) => ({
      kind: row.kind,
      status: row.status as ModuleJobSummaryRow['status'],
      lastError: row.lastError,
      budgetQueued: row.status === 'pending' && row.lastError === BUDGET_QUEUED_ERROR,
    }));

    return { jobs: jobsOut };
  });
}
