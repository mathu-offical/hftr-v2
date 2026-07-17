import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, ledgerEntries } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Executions feed: append-only action traces enriched with ledger money. */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const traces = await db
      .select()
      .from(actionTraces)
      .where(eq(actionTraces.companyId, companyId))
      .orderBy(desc(actionTraces.createdAt))
      .limit(100);

    const traceIds = traces.map((t) => t.id);
    const ledgerRows = traceIds.length
      ? await db.select().from(ledgerEntries).where(inArray(ledgerEntries.traceId, traceIds))
      : [];
    const ledgerByTrace = new Map(ledgerRows.map((l) => [l.traceId, l]));

    return {
      executions: traces.map((t) => {
        const ledger = ledgerByTrace.get(t.id);
        return {
          id: t.id,
          moduleId: t.moduleId,
          venue: t.venue,
          mode: t.mode,
          outcome: t.outcome,
          failureCode: t.failureCode,
          fills: t.fills,
          createdAt: t.createdAt,
          amountCents: ledger ? ledger.amountCents : null,
          description: ledger ? ledger.description : null,
        };
      }),
    };
  });
}
