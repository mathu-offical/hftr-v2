import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { researchEvidence } from '@hftr/db/schema';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

/** Research evidence packages gathered for a research module (limit 50). */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'research') throw new ApiError(422, 'module_type_not_research');

    const evidence = await db
      .select({
        id: researchEvidence.id,
        requestId: researchEvidence.requestId,
        sourceKind: researchEvidence.sourceKind,
        feedClass: researchEvidence.feedClass,
        title: researchEvidence.title,
        summary: researchEvidence.summary,
        digest: researchEvidence.digest,
        legalUseClass: researchEvidence.legalUseClass,
        expiresAt: researchEvidence.expiresAt,
        artifactRefs: researchEvidence.artifactRefs,
        externalRef: researchEvidence.externalRef,
        authorityClass: researchEvidence.authorityClass,
        createdAt: researchEvidence.createdAt,
      })
      .from(researchEvidence)
      .where(eq(researchEvidence.moduleId, moduleId))
      .orderBy(desc(researchEvidence.createdAt))
      .limit(50);

    return { evidence };
  });
}
