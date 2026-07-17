import { and, eq } from 'drizzle-orm';
import type { ConceptBatch } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { conceptLinks, concepts } from '@hftr/db/schema';
import type { CurationStatus } from '@hftr/contracts';
import { attachConceptsToLibraries } from '../libraries/attach';

export interface PersistConceptBatchOptions {
  db: Db;
  companyId: string;
  moduleId: string;
  batch: ConceptBatch;
  now: Date;
  researchRunId?: string | null;
  sourceClass?: 'deterministic_placeholder' | 'model_generated' | 'operator';
  curationStatus?: CurationStatus;
}

export async function persistConceptBatch(opts: PersistConceptBatchOptions): Promise<string[]> {
  const sourceClass = opts.sourceClass ?? 'model_generated';
  const titleToId = new Map<string, string>();
  const persistedIds: string[] = [];

  for (const draft of opts.batch.concepts) {
    const rows = await opts.db
      .insert(concepts)
      .values({
        companyId: opts.companyId,
        moduleId: opts.moduleId,
        title: draft.title,
        body: draft.body,
        tags: draft.tags,
        sourceClass,
        sourceRef: draft.sourceRef,
        researchRunId: opts.researchRunId ?? null,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body: draft.body,
          tags: draft.tags,
          sourceClass,
          sourceRef: draft.sourceRef,
          researchRunId: opts.researchRunId ?? null,
          status: 'active',
          updatedAt: opts.now,
        },
      })
      .returning({ id: concepts.id, title: concepts.title });
    const row = rows[0];
    if (row) {
      titleToId.set(row.title, row.id);
      persistedIds.push(row.id);
    }
  }

  if (opts.batch.links.length > 0) {
    const all = await opts.db
      .select({ id: concepts.id, title: concepts.title })
      .from(concepts)
      .where(eq(concepts.moduleId, opts.moduleId));
    for (const c of all) titleToId.set(c.title, c.id);
  }

  for (const link of opts.batch.links) {
    const fromId = titleToId.get(link.fromTitle);
    const toId = titleToId.get(link.toTitle);
    if (!fromId || !toId || fromId === toId) continue;
    await opts.db
      .insert(conceptLinks)
      .values({
        companyId: opts.companyId,
        fromConceptId: fromId,
        toConceptId: toId,
        relation: link.relation,
        weightBand: link.weightBand,
        sourceClass,
      })
      .onConflictDoUpdate({
        target: [conceptLinks.fromConceptId, conceptLinks.toConceptId, conceptLinks.relation],
        set: {
          weightBand: link.weightBand,
          sourceClass,
          updatedAt: opts.now,
        },
      });
  }

  await attachConceptsToLibraries({
    db: opts.db,
    companyId: opts.companyId,
    moduleId: opts.moduleId,
    conceptIds: persistedIds,
    now: opts.now,
    ...(opts.curationStatus !== undefined ? { curationStatus: opts.curationStatus } : {}),
    ...(opts.researchRunId !== undefined ? { researchRunId: opts.researchRunId } : {}),
  });

  return persistedIds;
}
