import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { concepts, researchTopics, topicConcepts } from '@hftr/db/schema';

/** Attach concepts to a topic with ordered membership; bumps reference counters (D-040). */
export async function attachConceptsToTopic(opts: {
  db: Db;
  companyId: string;
  topicId: string;
  conceptIds: string[];
  now: Date;
}): Promise<void> {
  if (opts.conceptIds.length === 0) return;

  const [topic] = await opts.db
    .select({ id: researchTopics.id })
    .from(researchTopics)
    .where(and(eq(researchTopics.id, opts.topicId), eq(researchTopics.companyId, opts.companyId)))
    .limit(1);
  if (!topic) return;

  let sortOrder = 0;
  const existing = await opts.db
    .select({ sortOrder: topicConcepts.sortOrder })
    .from(topicConcepts)
    .where(eq(topicConcepts.topicId, opts.topicId));
  if (existing.length > 0) {
    sortOrder = Math.max(...existing.map((r) => r.sortOrder)) + 1;
  }

  for (const conceptId of opts.conceptIds) {
    await opts.db
      .insert(topicConcepts)
      .values({
        topicId: opts.topicId,
        conceptId,
        sortOrder,
        role: null,
      })
      .onConflictDoUpdate({
        target: [topicConcepts.topicId, topicConcepts.conceptId],
        set: { updatedAt: opts.now },
      });
    sortOrder += 1;
  }

  await opts.db
    .update(concepts)
    .set({
      referenceCount: sql`${concepts.referenceCount} + 1`,
      lastReferencedAt: opts.now,
      updatedAt: opts.now,
    })
    .where(and(eq(concepts.companyId, opts.companyId), inArray(concepts.id, opts.conceptIds)));

  await opts.db
    .update(researchTopics)
    .set({
      referenceCount: sql`${researchTopics.referenceCount} + ${opts.conceptIds.length}`,
      lastReferencedAt: opts.now,
      updatedAt: opts.now,
    })
    .where(eq(researchTopics.id, opts.topicId));
}
