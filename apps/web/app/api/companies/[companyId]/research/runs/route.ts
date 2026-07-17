import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { researchRequests, researchRuns } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Recent research run projections with request summary (limit 20). */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const runs = await db
      .select({
        id: researchRuns.id,
        requestId: researchRuns.requestId,
        moduleId: researchRuns.moduleId,
        phase: researchRuns.phase,
        evidenceCount: researchRuns.evidenceCount,
        conceptCount: researchRuns.conceptCount,
        validationPassed: researchRuns.validationPassed,
        admissionApplied: researchRuns.admissionApplied,
        createdAt: researchRuns.createdAt,
        updatedAt: researchRuns.updatedAt,
        requestMode: researchRequests.mode,
        requestStatus: researchRequests.status,
        queryText: researchRequests.queryText,
        topicScope: researchRequests.topicScope,
        sourceModuleId: researchRequests.sourceModuleId,
      })
      .from(researchRuns)
      .innerJoin(researchRequests, eq(researchRequests.id, researchRuns.requestId))
      .where(eq(researchRuns.companyId, companyId))
      .orderBy(desc(researchRuns.createdAt))
      .limit(20);

    return { runs };
  });
}
