import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { walkValueLineage } from '@hftr/engine';
import { scoping } from '@hftr/db';
import { numericValues } from '@hftr/db/schema';
import { ApiError, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  valueId: z.string().min(1),
});
type Ctx = { params: Promise<{ companyId: string; valueId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, valueId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const owned = await db
      .select({ ref: numericValues.ref })
      .from(numericValues)
      .where(and(eq(numericValues.ref, valueId), eq(numericValues.companyId, companyId)))
      .limit(1);
    if (!owned[0]) throw new ApiError(404, 'value_not_found');

    const lineage = await walkValueLineage(db, valueId);
    return lineage;
  });
}
