import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { buildCompanyLeakAuditReport } from '@hftr/llm';
import { llmArtifacts, llmCalls } from '@hftr/db/schema';
import { requireCompany, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await requireCompany(db, companyId, clerkUserId);

    const url = new URL(req.url);
    const { limit } = Query.parse({ limit: url.searchParams.get('limit') ?? '50' });

    const rows = await db
      .select({
        id: llmCalls.id,
        schemaValid: llmCalls.schemaValid,
        leakLintPassed: llmCalls.leakLintPassed,
        failure: llmCalls.failure,
      })
      .from(llmCalls)
      .where(eq(llmCalls.companyId, companyId))
      .orderBy(desc(llmCalls.createdAt))
      .limit(limit);

    const callIds = rows.map((row) => row.id);
    const artifactRows =
      callIds.length === 0
        ? []
        : await db
            .select({
              llmCallId: llmArtifacts.llmCallId,
              output: llmArtifacts.output,
            })
            .from(llmArtifacts)
            .where(
              and(
                eq(llmArtifacts.companyId, companyId),
                isNotNull(llmArtifacts.llmCallId),
                inArray(llmArtifacts.llmCallId, callIds),
              ),
            );

    const artifacts = artifactRows.flatMap((row) =>
      row.llmCallId ? [{ llmCallId: row.llmCallId, output: row.output }] : [],
    );

    return buildCompanyLeakAuditReport(rows, artifacts);
  });
}
