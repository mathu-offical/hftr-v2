import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { venueDate } from '../calendar/calendar';
import { loadCompanyLinkGraph, resolveLinkedResearchModules } from '../graph/module-links';
import { enqueue } from '../queue/queue';
import { LIBRARY_RESEARCH_QUEUE } from './lanes';

export interface EnqueueLinkedResearchInput {
  companyId: string;
  sourceModuleId: string;
  queryText: string;
  topicScope?: string;
}

/**
 * Enqueue module-mode research.curate for research modules linked to the source
 * via canvas edges: direct data_feed/verification, or research→library→trend
 * multi-hop (seeded template topology). Keys omitted — gather fails closed on
 * Brave without operator keys at the API layer.
 * Uses LIBRARY_RESEARCH lane (D-098).
 */
export async function enqueueLinkedResearchCurate(
  db: Db,
  clock: Clock,
  input: EnqueueLinkedResearchInput,
): Promise<number> {
  const graph = await loadCompanyLinkGraph(db, input.companyId);
  const researchModules = resolveLinkedResearchModules(graph, input.sourceModuleId);
  if (researchModules.length === 0) return 0;

  const day = venueDate(clock.nowMs(), 'America/New_York');
  let enqueued = 0;

  for (const researchMod of researchModules) {
    await enqueue(db, clock, {
      queueClass: LIBRARY_RESEARCH_QUEUE,
      kind: 'research.curate',
      payload: {
        companyId: input.companyId,
        moduleId: researchMod.id,
        sourceModuleId: input.sourceModuleId,
        queryText: input.queryText,
        topicScope: input.topicScope ?? '',
        mode: 'module',
      },
      idempotencyKey: `research-auto-${researchMod.id}-${input.sourceModuleId}-${day}`,
      companyId: input.companyId,
      moduleId: researchMod.id,
    });
    enqueued += 1;
  }

  return enqueued;
}
