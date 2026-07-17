import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, verificationRecords } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    // verification_records has no companyId; scope through the owning trace.
    const rows = await db
      .select({
        id: verificationRecords.id,
        traceId: verificationRecords.traceId,
        result: verificationRecords.result,
        fieldResults: verificationRecords.fieldResults,
        failureCode: verificationRecords.failureCode,
        createdAt: verificationRecords.createdAt,
      })
      .from(verificationRecords)
      .innerJoin(actionTraces, eq(actionTraces.id, verificationRecords.traceId))
      .where(eq(actionTraces.companyId, companyId))
      .orderBy(desc(verificationRecords.createdAt))
      .limit(100);
    return { verifications: rows };
  });
}
