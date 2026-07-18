import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { RESEARCH_ARTICLE_TAG } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { concepts } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Curated research concepts, newest first; ?moduleId= / ?kind=article narrow. */
export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const url = new URL(req.url);
    const moduleId = z
      .string()
      .uuid()
      .nullable()
      .parse(url.searchParams.get('moduleId'));
    const kind = z.enum(['article', 'all']).nullable().parse(url.searchParams.get('kind') ?? 'all');

    const filters = [eq(concepts.companyId, companyId), eq(concepts.status, 'active')];
    if (moduleId) filters.push(eq(concepts.moduleId, moduleId));
    if (kind === 'article') {
      filters.push(sql`${concepts.tags} @> ${JSON.stringify([RESEARCH_ARTICLE_TAG])}::jsonb`);
    }

    const rows = await db
      .select()
      .from(concepts)
      .where(and(...filters))
      .orderBy(desc(concepts.createdAt))
      .limit(kind === 'article' ? 100 : 200);
    return { concepts: rows };
  });
}
