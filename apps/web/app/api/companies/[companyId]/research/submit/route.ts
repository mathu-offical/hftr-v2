import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { SubmitResearchArticleInput, SubmitResearchArticleResult } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { libraries, modules } from '@hftr/db/schema';
import { submitOperatorResearchArticle } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Operator research article submit (D-079) — model-free link or raw text ingest.
 * Concepts land with sourceClass `operator` on the Runtime shelf.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const input = await parseBody(req, SubmitResearchArticleInput);

    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, input.moduleId);
    if (module_.type !== 'research') throw new ApiError(422, 'module_type_not_research');
    if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');

    if (input.libraryId) {
      const [lib] = await db
        .select({ id: libraries.id })
        .from(libraries)
        .where(
          and(eq(libraries.id, input.libraryId), eq(libraries.companyId, companyId)),
        )
        .limit(1);
      if (!lib) throw new ApiError(404, 'library_not_found');
    }

    // Ensure module still exists under company (defense in depth).
    const [modRow] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, input.moduleId), eq(modules.companyId, companyId)))
      .limit(1);
    if (!modRow) throw new ApiError(404, 'module_not_found');

    try {
      const result = await submitOperatorResearchArticle({
        db,
        companyId,
        input,
        causationRef: `user:${clerkUserId}`,
      });
      return SubmitResearchArticleResult.parse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'operator_submit_failed';
      if (msg === 'library_not_found') throw new ApiError(404, msg);
      if (msg === 'module_not_found' || msg === 'module_type_not_research') {
        throw new ApiError(422, msg);
      }
      throw new ApiError(500, msg);
    }
  });
}
