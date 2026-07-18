import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateResearchQueryInput } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { modules } from '@hftr/db/schema';
import { createSystemClock, drainQueues, enqueue, estimateLlmJobCost } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { createWebModelGateway } from '@/lib/model-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Manual research query — enqueues research.curate on a research module. */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const input = await parseBody(req, CreateResearchQueryInput);
    let moduleId = input.moduleId;

    if (moduleId) {
      const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
      if (module_.type !== 'research') throw new ApiError(422, 'module_type_not_research');
      if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');
    } else {
      const activeResearch = await db
        .select({ id: modules.id })
        .from(modules)
        .where(
          and(
            eq(modules.companyId, companyId),
            eq(modules.type, 'research'),
            eq(modules.status, 'active'),
          ),
        )
        .limit(1);
      const first = activeResearch[0];
      if (!first) throw new ApiError(422, 'no_active_research_module');
      moduleId = first.id;
    }

    // D-074: identity + intent only — gather keys resolve inside research.gather.
    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'research.curate',
      costEstimate: estimateLlmJobCost('research.curate'),
      payload: {
        companyId,
        moduleId,
        queryText: input.queryText,
        mode: input.mode,
        topicId: input.topicId,
        topicScope: input.topicScope,
        sourceKinds: input.sourceKinds,
      },
      idempotencyKey: `research-query-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
      moduleId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 15_000,
      batchSize: 3,
      modelGateway: createWebModelGateway(db, clerkUserId),
    });
    return { queued: true, moduleId, drained };
  });
}
