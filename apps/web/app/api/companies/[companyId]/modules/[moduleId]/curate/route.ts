import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ResearchQueryMode, ResearchSourceKind } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { createSystemClock, drainQueues, enqueue, estimateLlmJobCost } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { createWebModelGateway } from '@/lib/model-gateway';
import { loadResearchGatherKeys } from '@/lib/research-keys';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

const CurateInput = z
  .object({
    queryText: z.string().max(500).optional(),
    mode: ResearchQueryMode.optional(),
    topicId: z.string().uuid().optional(),
    topicScope: z.string().max(200).optional(),
    sourceKinds: z.array(ResearchSourceKind).max(24).optional(),
  })
  .default({});

/**
 * Trigger research curation (RESEARCH queue). Uses the LLM gateway when the
 * operator has configured admitted keys; otherwise deterministic catalog fallback.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const module_ = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (module_.type !== 'research') throw new ApiError(422, 'module_type_not_curatable');
    if (module_.status !== 'active') throw new ApiError(422, 'module_not_active');

    const input = await parseBody(req, CurateInput);
    const config = (module_.config ?? {}) as { topicScope?: string; focus?: string };
    const topicScope = input.topicScope ?? config.topicScope ?? config.focus ?? '';
    const queryText = input.queryText ?? topicScope;
    const mode = input.mode ?? (input.queryText ? 'manual' : 'opportunistic');
    const gatherKeys = await loadResearchGatherKeys(db, clerkUserId);

    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'research.curate',
      costEstimate: estimateLlmJobCost('research.curate'),
      payload: {
        companyId,
        moduleId,
        topicScope,
        queryText,
        mode,
        topicId: input.topicId,
        sourceKinds: input.sourceKinds,
        ...gatherKeys,
      },
      idempotencyKey: `curate-${randomUUID()}`,
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
    return { queued: true, drained };
  });
}
