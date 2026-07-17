import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

const CurateInput = z.object({}).default({});

/**
 * Trigger deterministic research curation for a research module (RESEARCH
 * queue). Topic scope comes from the module config; the handler upserts
 * catalog-cited concepts labeled deterministic_placeholder.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'research') throw new ApiError(422, 'module_type_not_curatable');
    if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');

    await parseBody(req, CurateInput);
    const config = (module_.config ?? {}) as { topicScope?: string; focus?: string };
    const topicScope = config.topicScope ?? config.focus ?? '';

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'research.curate',
      payload: { companyId, moduleId, topicScope },
      idempotencyKey: `curate-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
      moduleId,
    });
    const drained = await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 15_000,
      batchSize: 3,
    });
    return { queued: true, drained };
  });
}
