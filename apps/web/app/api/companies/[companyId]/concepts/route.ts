import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { concepts } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Curated research concepts, newest first; ?moduleId= narrows to one module. */
export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const moduleId = z
      .string()
      .uuid()
      .nullable()
      .parse(new URL(req.url).searchParams.get('moduleId'));
    const rows = await db
      .select()
      .from(concepts)
      .where(
        moduleId
          ? and(
              eq(concepts.companyId, companyId),
              eq(concepts.moduleId, moduleId),
              eq(concepts.status, 'active'),
            )
          : and(eq(concepts.companyId, companyId), eq(concepts.status, 'active')),
      )
      .orderBy(desc(concepts.createdAt))
      .limit(200);
    return { concepts: rows };
  });
}
