import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { positions } from '@hftr/db/schema';
import { createSystemClock, getSyntheticQuote } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Positions with mark-to-market against the current quote source. */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const rows = await db
      .select()
      .from(positions)
      .where(eq(positions.companyId, companyId))
      .orderBy(desc(positions.updatedAt));

    const clock = createSystemClock();
    return {
      positions: rows.map((p) => {
        const quote = getSyntheticQuote(p.symbol, clock);
        const markCents = quote.lastCents ?? p.avgCostCents;
        const unrealized = p.qty * BigInt(markCents - p.avgCostCents);
        return { ...p, markCents, unrealizedPnlCents: unrealized };
      }),
    };
  });
}
