import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, ledgerEntries, verificationRecords } from '@hftr/db/schema';
import { getCompanyBalanceCents } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Right-panel activity projection: balance, recent ledger entries, recent
 * traces with their verification results. Read-only; append-only sources.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const [balance, ledger, traces] = await Promise.all([
      getCompanyBalanceCents(db, companyId),
      db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.companyId, companyId))
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(25),
      db
        .select()
        .from(actionTraces)
        .where(eq(actionTraces.companyId, companyId))
        .orderBy(desc(actionTraces.createdAt))
        .limit(25),
    ]);

    const verifications =
      traces.length === 0
        ? []
        : await db
            .select()
            .from(verificationRecords)
            .orderBy(desc(verificationRecords.createdAt))
            .limit(50);
    const verifyByTrace = new Map(verifications.map((v) => [v.traceId, v]));

    return {
      balanceCents: balance,
      ledger,
      traces: traces.map((t) => ({
        ...t,
        verification: verifyByTrace.get(t.id) ?? null,
      })),
    };
  });
}
