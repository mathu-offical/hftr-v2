/**
 * Assigns concept → folder / article membership for galaxy simulation nodes (D-078).
 */

import type {
  ResearchGraphArticleOrbit,
  ResearchGraphFolderStar,
  ResearchGraphNode,
} from '@hftr/contracts';
import { conceptSimilarityText, similarityBandBetweenTexts } from './galaxy-similarity';
import { SEED_CATALOG_SHELVES } from './research-library-shelves';
import { tagSatelliteId } from './galaxy-nest-hulls';

const CATALOG_KEY_SET = new Set(SEED_CATALOG_SHELVES.map((s) => s.catalog));

export function buildConceptFolderIndex(
  folders: readonly ResearchGraphFolderStar[],
): Map<string, { folderKey: string; libraryId: string; mass: number }> {
  const map = new Map<string, { folderKey: string; libraryId: string; mass: number }>();
  for (const folder of folders) {
    for (const conceptId of folder.memberConceptIds) {
      if (!map.has(conceptId)) {
        map.set(conceptId, {
          folderKey: folder.folderKey,
          libraryId: folder.libraryId,
          mass: folder.mass,
        });
      }
    }
  }
  return map;
}

/** Prefer smallest article (tightest orbit) when a concept is in multiple topics. */
export function buildConceptArticleIndex(
  articles: readonly ResearchGraphArticleOrbit[],
): Map<string, string> {
  const map = new Map<string, { topicId: string; size: number }>();
  for (const article of articles) {
    const size = article.memberConceptIds.length;
    for (const conceptId of article.memberConceptIds) {
      const prev = map.get(conceptId);
      if (!prev || size < prev.size) {
        map.set(conceptId, { topicId: article.topicId, size });
      }
    }
  }
  return new Map([...map].map(([id, v]) => [id, v.topicId]));
}

export function similarityBandForLink(
  from: ResearchGraphNode | undefined,
  to: ResearchGraphNode | undefined,
): 'high' | 'medium' | 'low' {
  if (!from || !to) return 'low';
  return similarityBandBetweenTexts(conceptSimilarityText(from), conceptSimilarityText(to));
}

export type TagSatelliteNode = {
  id: string;
  __kind: 'tag-sat';
  __parentConceptId: string;
  title: string;
  tags: string[];
  body: string;
  val: number;
  primaryLibraryId: string | null;
  primaryFolderKey: string | null;
  primaryArticleId: string | null;
  x?: number;
  y?: number;
  z?: number;
};

/** Lightweight tag satellites orbiting parent concepts (capped). */
export function buildTagSatelliteNodes(
  concepts: ReadonlyArray<
    ResearchGraphNode & {
      primaryFolderKey?: string | null;
      primaryArticleId?: string | null;
      x?: number;
      y?: number;
      z?: number;
    }
  >,
  opts?: { maxPerConcept?: number; maxTotal?: number },
): TagSatelliteNode[] {
  const maxPer = opts?.maxPerConcept ?? 2;
  const maxTotal = opts?.maxTotal ?? 100;
  const out: TagSatelliteNode[] = [];

  for (const concept of concepts) {
    const tags = concept.tags.filter(
      (t) => !CATALOG_KEY_SET.has(t as never) && t !== 'baseline_sector',
    );
    let added = 0;
    for (const tag of tags) {
      if (added >= maxPer || out.length >= maxTotal) break;
      const angle = (added / Math.max(maxPer, 1)) * Math.PI * 2;
      const r = 10 + added * 3;
      out.push({
        id: tagSatelliteId(concept.id, tag),
        __kind: 'tag-sat',
        __parentConceptId: concept.id,
        title: tag,
        tags: [tag],
        body: '',
        val: 0.35,
        primaryLibraryId: concept.primaryLibraryId ?? null,
        primaryFolderKey: concept.primaryFolderKey ?? null,
        primaryArticleId: concept.primaryArticleId ?? null,
        x: (concept.x ?? 0) + Math.cos(angle) * r,
        y: (concept.y ?? 0) + Math.sin(angle) * r,
        z: (concept.z ?? 0) + (added - 0.5) * 4,
      });
      added += 1;
    }
    if (out.length >= maxTotal) break;
  }

  return out;
}
