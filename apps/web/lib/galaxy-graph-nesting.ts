import type {
  ResearchGraphArticleOrbit,
  ResearchGraphFolderStar,
  ResearchGraphLibraryNest,
} from '@hftr/contracts';
import { isResearchArticleConcept } from '@hftr/contracts';
import { amalgamationMassFromTexts } from './galaxy-similarity';
import {
  isBaselineSeededLibrary,
  SEED_CATALOG_SHELVES,
  seedCatalogForPage,
  type SeedCatalogId,
} from './research-library-shelves';

export const CATALOG_FOLDER_KEYS = SEED_CATALOG_SHELVES.map((s) => s.catalog);

const CATALOG_LABELS = new Map<SeedCatalogId, string>(
  SEED_CATALOG_SHELVES.map((s) => [s.catalog, s.label]),
);

export type GraphNestingConcept = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  primaryLibraryId: string | null;
};

type FolderBucketKey = `${string}:${string}`;

function folderBucketKey(libraryId: string, folderKey: string): FolderBucketKey {
  return `${libraryId}:${folderKey}`;
}

function majorityValue<T>(values: ReadonlyArray<T | null | undefined>): T | null {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function resolveConceptFolderKey(
  concept: GraphNestingConcept,
  libraryById: Map<string, ResearchGraphLibraryNest>,
): string | null {
  const libraryId = concept.primaryLibraryId;
  if (!libraryId) return null;

  const catalog = seedCatalogForPage(concept.tags);
  if (catalog) return catalog;

  const library = libraryById.get(libraryId);
  if (!library || isBaselineSeededLibrary(library)) return null;

  return 'runtime';
}

function folderLabel(folderKey: string): string {
  if (folderKey === 'runtime') return 'Runtime concepts';
  const catalogLabel = CATALOG_LABELS.get(folderKey as SeedCatalogId);
  return catalogLabel ?? folderKey.replace(/_/g, ' ');
}

/** Build folder stars grouped by primary library + catalog/runtime folder key. */
export function buildFolderStars(
  concepts: ReadonlyArray<GraphNestingConcept>,
  libraries: ReadonlyArray<ResearchGraphLibraryNest>,
): ResearchGraphFolderStar[] {
  const libraryById = new Map(libraries.map((lib) => [lib.id, lib]));
  const buckets = new Map<
    FolderBucketKey,
    {
      libraryId: string;
      folderKey: string;
      memberConceptIds: string[];
      members: GraphNestingConcept[];
    }
  >();

  for (const concept of concepts) {
    const libraryId = concept.primaryLibraryId;
    if (!libraryId) continue;

    const folderKey = resolveConceptFolderKey(concept, libraryById);
    if (!folderKey) continue;

    const key = folderBucketKey(libraryId, folderKey);
    const bucket = buckets.get(key) ?? {
      libraryId,
      folderKey,
      memberConceptIds: [],
      members: [],
    };
    bucket.memberConceptIds.push(concept.id);
    bucket.members.push(concept);
    buckets.set(key, bucket);
  }

  const folders: ResearchGraphFolderStar[] = [];
  for (const bucket of buckets.values()) {
    folders.push({
      folderKey: bucket.folderKey,
      libraryId: bucket.libraryId,
      label: folderLabel(bucket.folderKey),
      mass: amalgamationMassFromTexts(bucket.members.map((m) => `${m.title} ${m.body}`)),
      memberConceptIds: bucket.memberConceptIds,
    });
  }

  return folders.sort((a, b) => {
    const libCmp = a.libraryId.localeCompare(b.libraryId);
    if (libCmp !== 0) return libCmp;
    return a.folderKey.localeCompare(b.folderKey);
  });
}

export type GraphNestingTopic = {
  id: string;
  title: string;
};

export type GraphNestingMembership = {
  topicId: string;
  conceptId: string;
};

/** Build article orbits from active topics and their concept memberships. */
export function buildArticleOrbits(
  topics: ReadonlyArray<GraphNestingTopic>,
  memberships: ReadonlyArray<GraphNestingMembership>,
  conceptsById: ReadonlyMap<string, GraphNestingConcept>,
): ResearchGraphArticleOrbit[] {
  const membersByTopic = new Map<string, string[]>();
  for (const row of memberships) {
    const list = membersByTopic.get(row.topicId) ?? [];
    list.push(row.conceptId);
    membersByTopic.set(row.topicId, list);
  }

  const articles: ResearchGraphArticleOrbit[] = [];
  for (const topic of topics) {
    const memberConceptIds = membersByTopic.get(topic.id) ?? [];
    if (memberConceptIds.length === 0) continue;

    const memberConcepts = memberConceptIds
      .map((id) => conceptsById.get(id))
      .filter((c): c is GraphNestingConcept => c != null);

    const libraryId = majorityValue(memberConcepts.map((c) => c.primaryLibraryId));
    const catalogFolder = majorityValue(memberConcepts.map((c) => seedCatalogForPage(c.tags)));
    const folderKey = catalogFolder ?? (libraryId ? 'runtime' : null);

    articles.push({
      topicId: topic.id,
      title: topic.title,
      libraryId,
      folderKey,
      memberConceptIds,
    });
  }

  return articles.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Library-scoped research articles (D-127 / D-141): every `hftr:article` concept with a
 * primary library becomes an article-star orbit hub inside that library/folder.
 * `topicId` carries the concept uuid (orbit identity for the graph response).
 */
export function buildLibraryArticleOrbits(
  concepts: ReadonlyArray<GraphNestingConcept>,
  libraries: ReadonlyArray<ResearchGraphLibraryNest>,
): ResearchGraphArticleOrbit[] {
  const libraryById = new Map(libraries.map((lib) => [lib.id, lib]));
  const articles: ResearchGraphArticleOrbit[] = [];

  for (const concept of concepts) {
    if (!isResearchArticleConcept(concept.tags)) continue;
    const libraryId = concept.primaryLibraryId;
    if (!libraryId || !libraryById.has(libraryId)) continue;

    const folderKey = resolveConceptFolderKey(concept, libraryById);
    articles.push({
      topicId: concept.id,
      title: concept.title,
      libraryId,
      folderKey,
      memberConceptIds: [concept.id],
    });
  }

  return articles.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Merge topic membership orbits + library article hubs. Library articles win on id clash
 * (same uuid is extremely unlikely across topics vs concepts).
 */
export function mergeArticleOrbits(
  topicOrbits: ReadonlyArray<ResearchGraphArticleOrbit>,
  libraryArticleOrbits: ReadonlyArray<ResearchGraphArticleOrbit>,
): ResearchGraphArticleOrbit[] {
  const byId = new Map<string, ResearchGraphArticleOrbit>();
  for (const orbit of topicOrbits) byId.set(orbit.topicId, orbit);
  for (const orbit of libraryArticleOrbits) byId.set(orbit.topicId, orbit);
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}
