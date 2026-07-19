import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { bookDeltas } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Read-only BookDelta feed (D-122 / D-205). Observation rows from both_verify
 * shadow compares — never secrets.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const rows = await db
      .select({
        id: bookDeltas.id,
        engineModuleId: bookDeltas.engineModuleId,
        instructionId: bookDeltas.instructionId,
        traceId: bookDeltas.traceId,
        routingMode: bookDeltas.routingMode,
        delta: bookDeltas.delta,
        createdAt: bookDeltas.createdAt,
      })
      .from(bookDeltas)
      .where(eq(bookDeltas.companyId, companyId))
      .orderBy(desc(bookDeltas.createdAt))
      .limit(50);

    return { bookDeltas: rows };
  });
}
