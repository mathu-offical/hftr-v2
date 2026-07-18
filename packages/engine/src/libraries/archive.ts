import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  conceptLinks,
  concepts,
  libraries,
  libraryConcepts,
  researchTopics,
  topicConcepts,
} from '@hftr/db/schema';

export const SEEDED_LIBRARY_NAME = 'Seeded trading mechanisms';
export const SEEDED_TOPIC_TITLE = 'Seeded trading mechanisms';

export type ConfidenceBand = 'low' | 'medium' | 'high';
export type ConfidenceDirection = 'up' | 'down' | 'verify';

export type ArchiveConceptSummary = {
  id: string;
  title: string;
  sourceClass: string;
  confidenceBand: ConfidenceBand;
  archivedAt: Date | null;
};

export type ArchiveTopicSummary = {
  id: string;
  title: string;
  confidenceBand: ConfidenceBand;
  archivedAt: Date | null;
};

export type ArchiveLibrarySummary = {
  id: string;
  name: string;
  archivedAt: Date | null;
};

export type ArchiveListResult = {
  concepts: ArchiveConceptSummary[];
  topics: ArchiveTopicSummary[];
  libraries: ArchiveLibrarySummary[];
};

export type ArchiveCounts = {
  concepts: number;
  topics: number;
  libraries: number;
};

/** Advance or retreat qualitative confidence (NRA bands only). */
export function nextConfidenceBand(
  current: ConfidenceBand,
  direction: ConfidenceDirection,
): ConfidenceBand {
  switch (direction) {
    case 'up':
      switch (current) {
        case 'low':
          return 'medium';
        case 'medium':
          return 'high';
        case 'high':
          return 'high';
        default: {
          const _exhaustive: never = current;
          throw new Error(`unknown_confidence_band:${String(_exhaustive)}`);
        }
      }
    case 'down':
      switch (current) {
        case 'low':
          return 'low';
        case 'medium':
          return 'low';
        case 'high':
          return 'medium';
        default: {
          const _exhaustive: never = current;
          throw new Error(`unknown_confidence_band:${String(_exhaustive)}`);
        }
      }
    case 'verify':
      return nextConfidenceBand(current, 'up');
    default: {
      const _exhaustive: never = direction;
      throw new Error(`unknown_confidence_direction:${String(_exhaustive)}`);
    }
  }
}

function parseConfidenceBand(value: string | null | undefined): ConfidenceBand {
  switch (value) {
    case 'low':
    case 'medium':
    case 'high':
      return value;
    default:
      return 'medium';
  }
}

export async function bumpConceptConfidence(
  db: Db,
  conceptId: string,
  direction: ConfidenceDirection,
  now: Date,
): Promise<ConfidenceBand> {
  const [row] = await db
    .select({ confidenceBand: concepts.confidenceBand })
    .from(concepts)
    .where(eq(concepts.id, conceptId))
    .limit(1);
  if (!row) throw new Error('concept_not_found');

  const current = parseConfidenceBand(row.confidenceBand);
  const next = nextConfidenceBand(current, direction);
  if (next === current) return next;

  await db
    .update(concepts)
    .set({ confidenceBand: next, updatedAt: now })
    .where(eq(concepts.id, conceptId));

  return next;
}

export async function bumpTopicConfidence(
  db: Db,
  topicId: string,
  direction: ConfidenceDirection,
  now: Date,
): Promise<ConfidenceBand> {
  const [row] = await db
    .select({ confidenceBand: researchTopics.confidenceBand })
    .from(researchTopics)
    .where(eq(researchTopics.id, topicId))
    .limit(1);
  if (!row) throw new Error('topic_not_found');

  const current = parseConfidenceBand(row.confidenceBand);
  const next = nextConfidenceBand(current, direction);
  if (next === current) return next;

  await db
    .update(researchTopics)
    .set({ confidenceBand: next, updatedAt: now })
    .where(eq(researchTopics.id, topicId));

  return next;
}

/** Operator verify pass: bump confidence without body edits. */
export async function verifyResearchObject(
  db: Db,
  companyId: string,
  objectKind: 'concept' | 'topic',
  objectId: string,
  now: Date,
): Promise<{ confidenceBand: ConfidenceBand }> {
  switch (objectKind) {
    case 'concept': {
      const [row] = await db
        .select({ id: concepts.id, status: concepts.status })
        .from(concepts)
        .where(and(eq(concepts.id, objectId), eq(concepts.companyId, companyId)))
        .limit(1);
      if (!row) throw new Error('concept_not_found');
      if (row.status === 'archived') throw new Error('concept_archived');
      const confidenceBand = await bumpConceptConfidence(db, objectId, 'verify', now);
      return { confidenceBand };
    }
    case 'topic': {
      const [row] = await db
        .select({ id: researchTopics.id, status: researchTopics.status })
        .from(researchTopics)
        .where(and(eq(researchTopics.id, objectId), eq(researchTopics.companyId, companyId)))
        .limit(1);
      if (!row) throw new Error('topic_not_found');
      if (row.status === 'archived') throw new Error('topic_archived');
      const confidenceBand = await bumpTopicConfidence(db, objectId, 'verify', now);
      return { confidenceBand };
    }
    default: {
      const _exhaustive: never = objectKind;
      throw new Error(`unknown_object_kind:${String(_exhaustive)}`);
    }
  }
}

function isCatalogSeedConcept(sourceClass: string): boolean {
  return sourceClass === 'catalog_seed';
}

function isSeededLibraryName(name: string): boolean {
  return name === SEEDED_LIBRARY_NAME;
}

function isSeededTopicTitle(title: string): boolean {
  return title === SEEDED_TOPIC_TITLE;
}

export async function softArchiveConcept(
  db: Db,
  companyId: string,
  conceptId: string,
  now: Date,
): Promise<{ archived: boolean }> {
  const [row] = await db
    .select({
      id: concepts.id,
      status: concepts.status,
      sourceClass: concepts.sourceClass,
    })
    .from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.companyId, companyId)))
    .limit(1);
  if (!row) throw new Error('concept_not_found');
  if (isCatalogSeedConcept(row.sourceClass)) {
    throw new Error('concept_catalog_seed_protected');
  }
  if (row.status === 'archived') return { archived: false };

  await db
    .update(concepts)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(eq(concepts.id, conceptId));

  return { archived: true };
}

export async function softArchiveTopic(
  db: Db,
  companyId: string,
  topicId: string,
  now: Date,
): Promise<{ archived: boolean }> {
  const [row] = await db
    .select({
      id: researchTopics.id,
      title: researchTopics.title,
      status: researchTopics.status,
    })
    .from(researchTopics)
    .where(and(eq(researchTopics.id, topicId), eq(researchTopics.companyId, companyId)))
    .limit(1);
  if (!row) throw new Error('topic_not_found');
  if (isSeededTopicTitle(row.title)) throw new Error('topic_seeded_protected');
  if (row.status === 'archived') return { archived: false };

  await db
    .update(researchTopics)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(eq(researchTopics.id, topicId));

  return { archived: true };
}

export async function softArchiveLibrary(
  db: Db,
  companyId: string,
  libraryId: string,
  now: Date,
): Promise<{ archived: boolean }> {
  const [row] = await db
    .select({
      id: libraries.id,
      name: libraries.name,
      status: libraries.status,
    })
    .from(libraries)
    .where(and(eq(libraries.id, libraryId), eq(libraries.companyId, companyId)))
    .limit(1);
  if (!row) throw new Error('library_not_found');
  if (isSeededLibraryName(row.name)) throw new Error('library_seeded_protected');
  if (row.status === 'archived') return { archived: false };

  await db
    .update(libraries)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(eq(libraries.id, libraryId));

  return { archived: true };
}

export async function restoreConcept(
  db: Db,
  companyId: string,
  conceptId: string,
  now: Date,
): Promise<{ restored: boolean }> {
  const [row] = await db
    .select({ id: concepts.id, status: concepts.status })
    .from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.companyId, companyId)))
    .limit(1);
  if (!row) throw new Error('concept_not_found');
  if (row.status !== 'archived') return { restored: false };

  await db
    .update(concepts)
    .set({ status: 'active', archivedAt: null, updatedAt: now })
    .where(eq(concepts.id, conceptId));

  return { restored: true };
}

export async function restoreTopic(
  db: Db,
  companyId: string,
  topicId: string,
  now: Date,
): Promise<{ restored: boolean }> {
  const [row] = await db
    .select({ id: researchTopics.id, status: researchTopics.status })
    .from(researchTopics)
    .where(and(eq(researchTopics.id, topicId), eq(researchTopics.companyId, companyId)))
    .limit(1);
  if (!row) throw new Error('topic_not_found');
  if (row.status !== 'archived') return { restored: false };

  await db
    .update(researchTopics)
    .set({ status: 'active', archivedAt: null, updatedAt: now })
    .where(eq(researchTopics.id, topicId));

  return { restored: true };
}

export async function restoreLibrary(
  db: Db,
  companyId: string,
  libraryId: string,
  now: Date,
): Promise<{ restored: boolean }> {
  const [row] = await db
    .select({ id: libraries.id, status: libraries.status })
    .from(libraries)
    .where(and(eq(libraries.id, libraryId), eq(libraries.companyId, companyId)))
    .limit(1);
  if (!row) throw new Error('library_not_found');
  if (row.status !== 'archived') return { restored: false };

  await db
    .update(libraries)
    .set({ status: 'active', archivedAt: null, updatedAt: now })
    .where(eq(libraries.id, libraryId));

  return { restored: true };
}

export async function archiveAllRuntimeResearch(
  db: Db,
  companyId: string,
  now: Date,
): Promise<ArchiveCounts> {
  const conceptRows = await db
    .update(concepts)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(concepts.companyId, companyId),
        eq(concepts.status, 'active'),
        ne(concepts.sourceClass, 'catalog_seed'),
      ),
    )
    .returning({ id: concepts.id });

  const topicRows = await db
    .update(researchTopics)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(researchTopics.companyId, companyId),
        eq(researchTopics.status, 'active'),
        ne(researchTopics.title, SEEDED_TOPIC_TITLE),
      ),
    )
    .returning({ id: researchTopics.id });

  const libraryRows = await db
    .update(libraries)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.status, 'active'),
        ne(libraries.name, SEEDED_LIBRARY_NAME),
      ),
    )
    .returning({ id: libraries.id });

  return {
    concepts: conceptRows.length,
    topics: topicRows.length,
    libraries: libraryRows.length,
  };
}

async function deleteConceptLinksForConcepts(db: Db, conceptIds: string[]): Promise<void> {
  if (conceptIds.length === 0) return;
  await db
    .delete(conceptLinks)
    .where(
      or(
        inArray(conceptLinks.fromConceptId, conceptIds),
        inArray(conceptLinks.toConceptId, conceptIds),
      ),
    );
}

async function deleteTopicConceptsForConcepts(db: Db, conceptIds: string[]): Promise<void> {
  if (conceptIds.length === 0) return;
  await db.delete(topicConcepts).where(inArray(topicConcepts.conceptId, conceptIds));
}

async function deleteTopicConceptsForTopics(db: Db, topicIds: string[]): Promise<void> {
  if (topicIds.length === 0) return;
  await db.delete(topicConcepts).where(inArray(topicConcepts.topicId, topicIds));
}

async function deleteLibraryConceptsForConcepts(db: Db, conceptIds: string[]): Promise<void> {
  if (conceptIds.length === 0) return;
  await db.delete(libraryConcepts).where(inArray(libraryConcepts.conceptId, conceptIds));
}

async function deleteLibraryConceptsForLibraries(db: Db, libraryIds: string[]): Promise<void> {
  if (libraryIds.length === 0) return;
  await db.delete(libraryConcepts).where(inArray(libraryConcepts.libraryId, libraryIds));
}

/** Hard-delete archived runtime rows; seeded catalog_seed / mechanisms are never removed. */
export async function clearArchive(db: Db, companyId: string): Promise<ArchiveCounts> {
  const archivedConceptRows = await db
    .select({ id: concepts.id })
    .from(concepts)
    .where(
      and(
        eq(concepts.companyId, companyId),
        eq(concepts.status, 'archived'),
        ne(concepts.sourceClass, 'catalog_seed'),
      ),
    );
  const archivedTopicRows = await db
    .select({ id: researchTopics.id })
    .from(researchTopics)
    .where(
      and(
        eq(researchTopics.companyId, companyId),
        eq(researchTopics.status, 'archived'),
        ne(researchTopics.title, SEEDED_TOPIC_TITLE),
      ),
    );
  const archivedLibraryRows = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.status, 'archived'),
        ne(libraries.name, SEEDED_LIBRARY_NAME),
      ),
    );

  const conceptIds = archivedConceptRows.map((r) => r.id);
  const topicIds = archivedTopicRows.map((r) => r.id);
  const libraryIds = archivedLibraryRows.map((r) => r.id);

  await deleteConceptLinksForConcepts(db, conceptIds);
  await deleteTopicConceptsForConcepts(db, conceptIds);
  await deleteTopicConceptsForTopics(db, topicIds);
  await deleteLibraryConceptsForConcepts(db, conceptIds);
  await deleteLibraryConceptsForLibraries(db, libraryIds);

  if (libraryIds.length > 0) {
    await db
      .update(concepts)
      .set({ primaryLibraryId: null })
      .where(
        and(eq(concepts.companyId, companyId), inArray(concepts.primaryLibraryId, libraryIds)),
      );
  }

  let conceptsDeleted = 0;
  let topicsDeleted = 0;
  let librariesDeleted = 0;

  if (conceptIds.length > 0) {
    const deleted = await db
      .delete(concepts)
      .where(and(eq(concepts.companyId, companyId), inArray(concepts.id, conceptIds)))
      .returning({ id: concepts.id });
    conceptsDeleted = deleted.length;
  }

  if (topicIds.length > 0) {
    const deleted = await db
      .delete(researchTopics)
      .where(and(eq(researchTopics.companyId, companyId), inArray(researchTopics.id, topicIds)))
      .returning({ id: researchTopics.id });
    topicsDeleted = deleted.length;
  }

  if (libraryIds.length > 0) {
    const deleted = await db
      .delete(libraries)
      .where(and(eq(libraries.companyId, companyId), inArray(libraries.id, libraryIds)))
      .returning({ id: libraries.id });
    librariesDeleted = deleted.length;
  }

  return {
    concepts: conceptsDeleted,
    topics: topicsDeleted,
    libraries: librariesDeleted,
  };
}

export async function listArchive(db: Db, companyId: string): Promise<ArchiveListResult> {
  const [conceptRows, topicRows, libraryRows] = await Promise.all([
    db
      .select({
        id: concepts.id,
        title: concepts.title,
        sourceClass: concepts.sourceClass,
        confidenceBand: concepts.confidenceBand,
        archivedAt: concepts.archivedAt,
      })
      .from(concepts)
      .where(and(eq(concepts.companyId, companyId), eq(concepts.status, 'archived')))
      .orderBy(sql`${concepts.archivedAt} DESC NULLS LAST`),
    db
      .select({
        id: researchTopics.id,
        title: researchTopics.title,
        confidenceBand: researchTopics.confidenceBand,
        archivedAt: researchTopics.archivedAt,
      })
      .from(researchTopics)
      .where(and(eq(researchTopics.companyId, companyId), eq(researchTopics.status, 'archived')))
      .orderBy(sql`${researchTopics.archivedAt} DESC NULLS LAST`),
    db
      .select({
        id: libraries.id,
        name: libraries.name,
        archivedAt: libraries.archivedAt,
      })
      .from(libraries)
      .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'archived')))
      .orderBy(sql`${libraries.archivedAt} DESC NULLS LAST`),
  ]);

  return {
    concepts: conceptRows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceClass: row.sourceClass,
      confidenceBand: parseConfidenceBand(row.confidenceBand),
      archivedAt: row.archivedAt,
    })),
    topics: topicRows.map((row) => ({
      id: row.id,
      title: row.title,
      confidenceBand: parseConfidenceBand(row.confidenceBand),
      archivedAt: row.archivedAt,
    })),
    libraries: libraryRows.map((row) => ({
      id: row.id,
      name: row.name,
      archivedAt: row.archivedAt,
    })),
  };
}
