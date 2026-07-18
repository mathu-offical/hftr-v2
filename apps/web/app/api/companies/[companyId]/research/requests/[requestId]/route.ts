import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { researchRequests, researchResults } from '@hftr/db/schema';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), requestId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; requestId: string }> };

/** Research request detail with result projection and validation gates. */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, requestId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const request = (
      await db
        .select()
        .from(researchRequests)
        .where(and(eq(researchRequests.id, requestId), eq(researchRequests.companyId, companyId)))
        .limit(1)
    )[0];
    if (!request) throw new ApiError(404, 'request_not_found');

    const result =
      (
        await db
          .select()
          .from(researchResults)
          .where(eq(researchResults.requestId, requestId))
          .limit(1)
      )[0] ?? null;

    return {
      request,
      result,
      validation: result?.validation ?? null,
    };
  });
}
