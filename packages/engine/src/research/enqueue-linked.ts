import { and, eq, inArray, or } from 'drizzle-orm';
import { moduleLinks, modules } from '@hftr/db/schema';
import type { Db } from '@hftr/db';
import type { Clock } from '../clock';
import { venueDate } from '../calendar/calendar';
import { enqueue } from '../queue/queue';

const LINKED_RESEARCH_KINDS = ['data_feed', 'verification'] as const;

export interface EnqueueLinkedResearchInput {
  companyId: string;
  sourceModuleId: string;
  queryText: string;
  topicScope?: string;
}

/**
 * Enqueue module-mode research.curate jobs for research modules linked to the
 * source module via data_feed or verification edges. API keys are intentionally
 * omitted — gather fails closed on Brave without operator keys at the API layer.
 */
export async function enqueueLinkedResearchCurate(
  db: Db,
  clock: Clock,
  input: EnqueueLinkedResearchInput,
): Promise<number> {
  const links = await db
    .select({
      fromModuleId: moduleLinks.fromModuleId,
      toModuleId: moduleLinks.toModuleId,
    })
    .from(moduleLinks)
    .where(
      and(
        eq(moduleLinks.companyId, input.companyId),
        inArray(moduleLinks.linkKind, [...LINKED_RESEARCH_KINDS]),
        or(
          eq(moduleLinks.fromModuleId, input.sourceModuleId),
          eq(moduleLinks.toModuleId, input.sourceModuleId),
        ),
      ),
    );

  if (links.length === 0) return 0;

  const linkedModuleIds = new Set(
    links.flatMap((link) => [link.fromModuleId, link.toModuleId]),
  );
  linkedModuleIds.delete(input.sourceModuleId);

  const researchModules = await db
    .select({ id: modules.id })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, input.companyId),
        eq(modules.type, 'research'),
        eq(modules.status, 'active'),
        inArray(modules.id, [...linkedModuleIds]),
      ),
    );

  const day = venueDate(clock.nowMs(), 'America/New_York');
  let enqueued = 0;

  for (const researchMod of researchModules) {
    const connected = links.some(
      (link) =>
        (link.fromModuleId === input.sourceModuleId && link.toModuleId === researchMod.id) ||
        (link.toModuleId === input.sourceModuleId && link.fromModuleId === researchMod.id),
    );
    if (!connected) continue;

    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
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
