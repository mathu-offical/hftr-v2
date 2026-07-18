import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, ledgerEntries, verificationRecords } from '@hftr/db/schema';
import { getCompanyBalanceCents } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const ViewQuery = z.object({
  /** ledger = balance + ledger only (desk drawer / right panel). full = + traces. */
  view: z.enum(['ledger', 'full']).default('full'),
});

/**
 * Right-panel / company-drawer activity projection: balance + recent ledger.
 * Pass `?view=ledger` to skip traces (lighter path for Desk/PnL + right ledger).
 * Default `view=full` also returns recent traces with verification results.
 * Read-only; append-only sources. Verifications scoped via company-owned trace ids.
 */
export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const url = new URL(req.url);
    const { view } = ViewQuery.parse({
      view: url.searchParams.get('view') ?? undefined,
    });

    const [balance, ledger] = await Promise.all([
      getCompanyBalanceCents(db, companyId),
      db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.companyId, companyId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(25),
    ]);

    if (view === 'ledger') {
      return {
        balanceCents: balance.toString(),
        ledger,
        traces: [] as const,
      };
    }

    const traces = await db
      .select()
      .from(actionTraces)
      .where(eq(actionTraces.companyId, companyId))
      .orderBy(desc(actionTraces.createdAt))
      .limit(25);

    const traceIds = traces.map((t) => t.id);
    const verifications =
      traceIds.length === 0
        ? []
        : await db
            .select()
            .from(verificationRecords)
            .where(inArray(verificationRecords.traceId, traceIds))
            .orderBy(desc(verificationRecords.createdAt));
    const verifyByTrace = new Map(verifications.map((v) => [v.traceId, v]));

    return {
      balanceCents: balance.toString(),
      ledger,
      traces: traces.map((t) => ({
        ...t,
        verification: verifyByTrace.get(t.id) ?? null,
      })),
    };
  });
}
