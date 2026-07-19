import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, ledgerEntries } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * D-206: lightweight ribbon ticker feed.
 * Traces + ledger only (no task/instruction/job/tree causation walk).
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const traces = await db
      .select({
        id: actionTraces.id,
        outcome: actionTraces.outcome,
        mode: actionTraces.mode,
        venue: actionTraces.venue,
        createdAt: actionTraces.createdAt,
        simulatorGapTags: actionTraces.simulatorGapTags,
      })
      .from(actionTraces)
      .where(eq(actionTraces.companyId, companyId))
      .orderBy(desc(actionTraces.createdAt))
      .limit(20);

    const traceIds = traces.map((t) => t.id);
    const ledgerRows = traceIds.length
      ? await db
          .select({
            traceId: ledgerEntries.traceId,
            amountCents: ledgerEntries.amountCents,
            description: ledgerEntries.description,
          })
          .from(ledgerEntries)
          .where(inArray(ledgerEntries.traceId, traceIds))
      : [];
    const ledgerByTrace = new Map(ledgerRows.map((l) => [l.traceId, l]));

    return {
      executions: traces.map((t) => {
        const ledger = ledgerByTrace.get(t.id);
        return {
          id: t.id,
          outcome: t.outcome,
          mode: t.mode,
          venue: t.venue,
          createdAt: t.createdAt,
          simulatorGapTags: t.simulatorGapTags ?? [],
          amountCents: ledger?.amountCents ?? null,
          description: ledger?.description ?? null,
        };
      }),
    };
  });
}
