import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { trendCandidates } from '@hftr/db/schema';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  trendId: z.string().uuid(),
});
type Ctx = { params: Promise<{ companyId: string; trendId: string }> };

/** D-077: bind (or clear) a trend candidate to an execution engine / trading module. */
const PatchTrendBindInput = z.object({
  engineInstanceId: z.string().uuid().nullable().optional(),
  tradingModuleId: z.string().uuid().nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, trendId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, PatchTrendBindInput);

    const [existing] = await db
      .select()
      .from(trendCandidates)
      .where(and(eq(trendCandidates.id, trendId), eq(trendCandidates.companyId, companyId)))
      .limit(1);
    if (!existing) throw new ApiError(404, 'trend_not_found');

    let engineInstanceId =
      input.engineInstanceId !== undefined
        ? input.engineInstanceId
        : existing.engineInstanceId;
    let tradingModuleId =
      input.tradingModuleId !== undefined ? input.tradingModuleId : existing.tradingModuleId;

    if (tradingModuleId) {
      const trading = await scoping.getOwnedModule(
        db,
        clerkUserId,
        companyId,
        tradingModuleId,
      );
      if (trading.type !== 'trading') {
        throw new ApiError(422, 'bind_target_not_trading');
      }
      // Prefer the trading module's engine when binding.
      if (trading.engineInstanceId) {
        engineInstanceId = trading.engineInstanceId;
      }
    }

    if (engineInstanceId) {
      const engines = await scoping.listEngineInstances(db, clerkUserId, companyId);
      if (!engines.some((e) => e.id === engineInstanceId)) {
        throw new ApiError(422, 'engine_instance_not_found');
      }
    }

    const [updated] = await db
      .update(trendCandidates)
      .set({
        engineInstanceId,
        tradingModuleId,
      })
      .where(and(eq(trendCandidates.id, trendId), eq(trendCandidates.companyId, companyId)))
      .returning();

    if (!updated) throw new ApiError(500, 'trend_bind_failed');
    return { trend: updated };
  });
}
