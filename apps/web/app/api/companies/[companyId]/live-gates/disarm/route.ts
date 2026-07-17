import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { companies } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const [updated] = await db
      .update(companies)
      .set({ liveArmedAt: null, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();
    return { liveArmedAt: updated?.liveArmedAt ?? null };
  });
}
