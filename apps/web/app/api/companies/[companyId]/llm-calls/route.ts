import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { llmCalls } from '@hftr/db/schema';
import { requireCompany, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await requireCompany(db, companyId, clerkUserId);

    const url = new URL(req.url);
    const { limit } = Query.parse({ limit: url.searchParams.get('limit') ?? '20' });

    const rows = await db
      .select({
        id: llmCalls.id,
        provider: llmCalls.provider,
        model: llmCalls.model,
        tier: llmCalls.tier,
        tokensIn: llmCalls.tokensIn,
        tokensOut: llmCalls.tokensOut,
        costCents: llmCalls.costCents,
        latencyMs: llmCalls.latencyMs,
        schemaValid: llmCalls.schemaValid,
        leakLintPassed: llmCalls.leakLintPassed,
        failure: llmCalls.failure,
        requestId: llmCalls.requestId,
        retentionClass: llmCalls.retentionClass,
        createdAt: llmCalls.createdAt,
      })
      .from(llmCalls)
      .where(eq(llmCalls.companyId, companyId))
      .orderBy(desc(llmCalls.createdAt))
      .limit(limit);

    return {
      calls: rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        model: row.model,
        tier: row.tier,
        tokens: { in: row.tokensIn, out: row.tokensOut },
        costCents: row.costCents,
        latencyMs: row.latencyMs,
        schemaValid: row.schemaValid,
        leakLintPassed: row.leakLintPassed,
        failure: row.failure,
        requestId: row.requestId,
        retentionClass: row.retentionClass,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
