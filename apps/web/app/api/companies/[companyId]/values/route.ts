import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { numericValues } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Math module projection: the company's slice of the append-only ValueRef
 * store, newest first, with full lineage fields so every number and timestamp
 * in the system is auditable down to its source (number-handling.md §8).
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const rows = await db
      .select({
        ref: numericValues.ref,
        kind: numericValues.kind,
        unit: numericValues.unit,
        scale: numericValues.scale,
        valueInt: numericValues.valueInt,
        sourceClass: numericValues.sourceClass,
        sourceId: numericValues.sourceId,
        capturedAt: numericValues.capturedAt,
        parentRefs: numericValues.parentRefs,
        lineageHash: numericValues.lineageHash,
      })
      .from(numericValues)
      .where(eq(numericValues.companyId, companyId))
      .orderBy(desc(numericValues.capturedAt))
      .limit(100);
    return { values: rows };
  });
}
