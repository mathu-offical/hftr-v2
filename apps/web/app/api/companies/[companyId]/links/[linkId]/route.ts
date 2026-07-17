import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping, NotFoundError } from '@hftr/db';
import { moduleLinks } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), linkId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; linkId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, linkId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const deleted = await db
      .delete(moduleLinks)
      .where(and(eq(moduleLinks.id, linkId), eq(moduleLinks.companyId, companyId)))
      .returning({ id: moduleLinks.id });
    if (deleted.length === 0) throw new NotFoundError('link');
    return { deleted: true };
  });
}
