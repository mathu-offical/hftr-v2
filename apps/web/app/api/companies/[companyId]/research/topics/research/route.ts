import { z } from 'zod';
import {
  InitiateTopicResearchInput,
  InitiateTopicResearchResult,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  createSystemClock,
  drainQueues,
  enqueueLibraryTopicResearch,
  loadActiveResearchTopicsForQueue,
} from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { createWebModelGateway } from '@/lib/model-gateway';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Queue library-lane research for research topics (D-098).
 * Body: `{ topicIds: [...] }` or `{ all: true }` — each topic is a separate job.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    const input = await parseBody(req, InitiateTopicResearchInput);
    const topics = await loadActiveResearchTopicsForQueue(
      db,
      companyId,
      input.all === true ? undefined : input.topicIds,
    );
    if (topics.length === 0) {
      throw new ApiError(422, 'no_topics_to_research');
    }

    const clock = createSystemClock();
    const { queued, topicIds } = await enqueueLibraryTopicResearch(db, clock, {
      companyId,
      topics,
    });

    // Soft start drain — remaining jobs continue via cron drain.
    try {
      await drainQueues(db, clock, {
        workerId: `inline:${clerkUserId.slice(0, 12)}`,
        budgetMs: 12_000,
        batchSize: 2,
        modelGateway: createWebModelGateway(db, clerkUserId),
      });
    } catch {
      // Jobs remain pending on LIBRARY_RESEARCH.
    }

    return InitiateTopicResearchResult.parse({
      queued,
      topicIds,
      queueClass: 'LIBRARY_RESEARCH',
    });
  });
}
