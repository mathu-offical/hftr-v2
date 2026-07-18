import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { researchTopics } from '@hftr/db/schema';
import type { Clock } from '../clock';
import { enqueue } from '../queue/queue';
import { estimateLlmJobCost } from '../queue/llm-cost-estimate';
import { LIBRARY_RESEARCH_QUEUE } from './lanes';

export type TopicResearchTarget = {
  id: string;
  title: string;
  moduleId: string;
};

/**
 * Enqueue library-lane research.curate jobs for research topics (D-098).
 * Each topic becomes its own queue item — initiate-all fans out, does not coalesce.
 */
export async function enqueueLibraryTopicResearch(
  db: Db,
  clock: Clock,
  opts: {
    companyId: string;
    topics: readonly TopicResearchTarget[];
  },
): Promise<{ queued: number; topicIds: string[] }> {
  const topicIds: string[] = [];
  for (const topic of opts.topics) {
    const queryText = `Research directive: ${topic.title}`.slice(0, 500);
    await enqueue(db, clock, {
      queueClass: LIBRARY_RESEARCH_QUEUE,
      kind: 'research.curate',
      costEstimate: estimateLlmJobCost('research.curate'),
      payload: {
        companyId: opts.companyId,
        moduleId: topic.moduleId,
        topicId: topic.id,
        topicScope: topic.title.slice(0, 200),
        queryText,
        mode: 'manual',
      },
      idempotencyKey: `library-topic-research-${topic.id}-${randomUUID()}`,
      priority: 'NORMAL',
      companyId: opts.companyId,
      moduleId: topic.moduleId,
    });
    topicIds.push(topic.id);
  }
  return { queued: topicIds.length, topicIds };
}

/** Load active topics for a company, optionally filtered by ids. */
export async function loadActiveResearchTopicsForQueue(
  db: Db,
  companyId: string,
  topicIds?: readonly string[],
): Promise<TopicResearchTarget[]> {
  const base = and(
    eq(researchTopics.companyId, companyId),
    eq(researchTopics.status, 'active'),
  );
  const rows = await db
    .select({
      id: researchTopics.id,
      title: researchTopics.title,
      moduleId: researchTopics.moduleId,
    })
    .from(researchTopics)
    .where(
      topicIds && topicIds.length > 0
        ? and(base, inArray(researchTopics.id, [...topicIds]))
        : base,
    );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    moduleId: r.moduleId,
  }));
}
