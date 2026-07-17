import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  concepts,
  libraries,
  libraryConcepts,
  researchTopics,
  topicConcepts,
} from '@hftr/db/schema';

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function serializeTopic(row: typeof researchTopics.$inferSelect, conceptCount?: number) {
  return {
    id: row.id,
    companyId: row.companyId,
    moduleId: row.moduleId,
    parentTopicId: row.parentTopicId,
    title: row.title,
    status: row.status,
    priority: row.priority,
    provenance: row.provenance,
    synopsisMd: row.synopsisMd ?? '',
    conceptCount: conceptCount ?? 0,
    queryCount: row.queryCount ?? 0,
    lastQueriedAt: iso(row.lastQueriedAt),
    referenceCount: row.referenceCount ?? 0,
    lastReferencedAt: iso(row.lastReferencedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function topicConceptCounts(db: Db, topicIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (topicIds.length === 0) return map;
  const rows = await db
    .select({ topicId: topicConcepts.topicId, n: count() })
    .from(topicConcepts)
    .where(inArray(topicConcepts.topicId, topicIds))
    .groupBy(topicConcepts.topicId);
  for (const row of rows) map.set(row.topicId, Number(row.n));
  return map;
}

export async function loadTopicMemberships(db: Db, topicId: string) {
  const rows = await db
    .select({
      membership: topicConcepts,
      concept: concepts,
    })
    .from(topicConcepts)
    .innerJoin(concepts, eq(concepts.id, topicConcepts.conceptId))
    .where(eq(topicConcepts.topicId, topicId))
    .orderBy(asc(topicConcepts.sortOrder));

  const conceptIds = rows.map((r) => r.concept.id);
  const curationByConcept = new Map<string, string>();
  if (conceptIds.length > 0) {
    const curationRows = await db
      .select({
        conceptId: libraryConcepts.conceptId,
        curationStatus: libraryConcepts.curationStatus,
      })
      .from(libraryConcepts)
      .where(inArray(libraryConcepts.conceptId, conceptIds));
    for (const row of curationRows) {
      if (!curationByConcept.has(row.conceptId)) {
        curationByConcept.set(row.conceptId, row.curationStatus);
      }
    }
  }

  return rows.map((row) => ({
    id: row.membership.id,
    topicId: row.membership.topicId,
    conceptId: row.membership.conceptId,
    sortOrder: row.membership.sortOrder,
    role: row.membership.role,
    title: row.concept.title,
    body: row.concept.body,
    tags: Array.isArray(row.concept.tags) ? (row.concept.tags as string[]) : [],
    curationStatus: curationByConcept.get(row.concept.id) ?? null,
    primaryLibraryId: row.concept.primaryLibraryId,
    queryCount: row.concept.queryCount ?? 0,
    referenceCount: row.concept.referenceCount ?? 0,
    createdAt: row.membership.createdAt.toISOString(),
    updatedAt: row.membership.updatedAt.toISOString(),
  }));
}

export async function bumpTopicQuery(db: Db, topicId: string, now: Date) {
  await db
    .update(researchTopics)
    .set({
      queryCount: sql`${researchTopics.queryCount} + 1`,
      lastQueriedAt: now,
      updatedAt: now,
    })
    .where(eq(researchTopics.id, topicId));
}

export async function bumpConceptQueries(db: Db, conceptIds: string[], now: Date) {
  if (conceptIds.length === 0) return;
  await db
    .update(concepts)
    .set({
      queryCount: sql`${concepts.queryCount} + 1`,
      lastQueriedAt: now,
      updatedAt: now,
    })
    .where(inArray(concepts.id, conceptIds));
}

export async function replaceTopicConcepts(
  db: Db,
  opts: {
    companyId: string;
    topicId: string;
    items: Array<{ conceptId: string; sortOrder: number; role: string | null }>;
    now: Date;
  },
) {
  const conceptIds = opts.items.map((i) => i.conceptId);
  if (conceptIds.length > 0) {
    const owned = await db
      .select({ id: concepts.id })
      .from(concepts)
      .where(and(eq(concepts.companyId, opts.companyId), inArray(concepts.id, conceptIds)));
    if (owned.length !== conceptIds.length) {
      throw new Error('concept_not_in_company');
    }
  }

  await db.delete(topicConcepts).where(eq(topicConcepts.topicId, opts.topicId));

  for (const item of opts.items) {
    await db.insert(topicConcepts).values({
      topicId: opts.topicId,
      conceptId: item.conceptId,
      sortOrder: item.sortOrder,
      role: item.role,
    });
  }

  if (conceptIds.length > 0) {
    await db
      .update(concepts)
      .set({
        referenceCount: sql`${concepts.referenceCount} + 1`,
        lastReferencedAt: opts.now,
        updatedAt: opts.now,
      })
      .where(inArray(concepts.id, conceptIds));
  }

  await db
    .update(researchTopics)
    .set({
      referenceCount: sql`${researchTopics.referenceCount} + ${Math.max(conceptIds.length, 1)}`,
      lastReferencedAt: opts.now,
      updatedAt: opts.now,
    })
    .where(eq(researchTopics.id, opts.topicId));
}

export async function listLibraryNests(db: Db, companyId: string) {
  const libRows = await db
    .select()
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active')));

  const counts = await db
    .select({
      libraryId: concepts.primaryLibraryId,
      n: count(),
    })
    .from(concepts)
    .where(eq(concepts.companyId, companyId))
    .groupBy(concepts.primaryLibraryId);

  const countMap = new Map<string, number>();
  for (const row of counts) {
    if (row.libraryId) countMap.set(row.libraryId, Number(row.n));
  }

  return libRows.map((lib) => ({
    id: lib.id,
    name: lib.name,
    masterLibrary: lib.masterLibrary,
    topicScope: lib.topicScope,
    conceptCount: countMap.get(lib.id) ?? 0,
  }));
}
