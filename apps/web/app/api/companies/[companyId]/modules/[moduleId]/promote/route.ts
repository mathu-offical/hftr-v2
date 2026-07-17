import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { trendCandidates } from '@hftr/db/schema';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { createWebModelGateway } from '@/lib/model-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

const PromoteInput = z.object({
  trendId: z.string().uuid(),
  targetModuleId: z.string().uuid().optional(),
});

/**
 * Promote a trend candidate through the pipeline spine:
 * trend.promote (admission) → tactical.expand → compile.select → dispatch.
 * Inline drain runs the multi-hop chain with the user-key ModelGateway.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'trend') throw new ApiError(422, 'module_type_not_promotable');
    if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');

    const input = await parseBody(req, PromoteInput);
    const trend = (
      await db
        .select({ id: trendCandidates.id })
        .from(trendCandidates)
        .where(and(eq(trendCandidates.id, input.trendId), eq(trendCandidates.companyId, companyId)))
        .limit(1)
    )[0];
    if (!trend) throw new ApiError(404, 'trend_not_found');

    if (input.targetModuleId) {
      const target = await scoping.getOwnedModule(db, clerkUserId, companyId, input.targetModuleId);
      if (target.type !== 'trading') throw new ApiError(422, 'target_module_not_trading');
    }

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'trend.promote',
      payload: {
        companyId,
        moduleId,
        trendId: input.trendId,
        ...(input.targetModuleId ? { targetModuleId: input.targetModuleId } : {}),
      },
      idempotencyKey: `promote-trend-${input.trendId}`,
      priority: 'NORMAL',
      companyId,
      moduleId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 45_000,
      batchSize: 8,
      modelGateway: createWebModelGateway(db, clerkUserId),
    });
    return { queued: true, drained };
  });
}
