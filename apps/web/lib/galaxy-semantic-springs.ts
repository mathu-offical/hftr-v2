/**
 * Client-side semantic springs for the research galaxy (D-145).
 * Persisted concept_links are often sparse; medium/high qualitative overlap,
 * shared display tags, and article/topic membership still pull related
 * concepts (and their nests) into interaction.
 */

import type { ResearchGraphArticleOrbit, ResearchGraphLink, ResearchGraphNode } from '@hftr/contracts';
import {
  galaxyDisplayTagsFromList,
  isResearchArticleConcept,
  RESEARCH_ARTICLE_TAG,
  tokenizeQualitativeText,
  tokenOverlapRatio,
  overlapToSimilarityBand,
  type SimilarityBand,
} from '@hftr/contracts';
import { conceptSimilarityText } from './galaxy-similarity';
import { SEED_CATALOG_SHELVES } from './research-library-shelves';

const CATALOG_KEY_SET = new Set(SEED_CATALOG_SHELVES.map((s) => s.catalog));

const SYSTEM_TAG_EXACT = new Set([
  RESEARCH_ARTICLE_TAG,
  'catalog_seed',
  'catalog',
  'system_curated',
  'baseline_sector',
]);

export type GalaxySemanticLink = {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  relation: ResearchGraphLink['relation'];
  weightBand: ResearchGraphLink['weightBand'];
  sourceClass: ResearchGraphLink['sourceClass'];
  /** Qualitative similarity band driving the spring. */
  similarityBand: SimilarityBand;
  /** How the spring was inferred. */
  __semanticKind: 'overlap' | 'shared_tag' | 'membership';
  __semantic: true;
};

export function isDisplayGalaxyTag(tag: string): boolean {
  const t = tag.trim();
  if (!t) return false;
  if (SYSTEM_TAG_EXACT.has(t)) return false;
  if (CATALOG_KEY_SET.has(t as never)) return false;
  if (t.startsWith('hftr:') || t.startsWith('operator_') || t.startsWith('system_')) return false;
  if (t.startsWith('tier_') || t.startsWith('sector_')) return false;
  return galaxyDisplayTagsFromList([t]).length > 0;
}

export function displayTagsForGalaxy(tags: readonly string[]): string[] {
  return galaxyDisplayTagsFromList(tags).filter((tag) => {
    const key = tag.toLowerCase();
    if (CATALOG_KEY_SET.has(key as never)) return false;
    if (CATALOG_KEY_SET.has(tag as never)) return false;
    return true;
  });
}

/** Prefer title + display tags (weighted) + body slice for overlap scoring. */
export function conceptSemanticCorpus(node: {
  title: string;
  body: string;
  tags: string[];
}): string {
  const display = displayTagsForGalaxy(node.tags);
  // Repeat display tags so shared chips outweigh long catalog bodies.
  return `${node.title} ${display.join(' ')} ${display.join(' ')} ${node.body.slice(0, 600)}`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function weightForBand(band: SimilarityBand): ResearchGraphLink['weightBand'] {
  switch (band) {
    case 'high':
      return 'strong';
    case 'medium':
      return 'typical';
    case 'low':
      return 'weak';
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

/**
 * Build inferred springs: membership stars, shared display tags, and medium+
 * token overlap. Skips pairs already present in persisted concept_links.
 */
export function buildSemanticGalaxyLinks(
  nodes: ReadonlyArray<ResearchGraphNode>,
  persistedLinks: ReadonlyArray<Pick<ResearchGraphLink, 'fromConceptId' | 'toConceptId'>>,
  articles: ReadonlyArray<ResearchGraphArticleOrbit> = [],
  opts?: {
    maxOverlapSprings?: number;
    maxTagSprings?: number;
    maxMembershipSprings?: number;
  },
): GalaxySemanticLink[] {
  const maxOverlap = opts?.maxOverlapSprings ?? 220;
  const maxTag = opts?.maxTagSprings ?? 160;
  const maxMembership = opts?.maxMembershipSprings ?? 180;

  const existing = new Set<string>();
  for (const link of persistedLinks) {
    existing.add(pairKey(link.fromConceptId, link.toConceptId));
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: GalaxySemanticLink[] = [];
  const seen = new Set<string>();

  const push = (
    fromId: string,
    toId: string,
    band: SimilarityBand,
    kind: GalaxySemanticLink['__semanticKind'],
  ) => {
    if (fromId === toId) return;
    if (!byId.has(fromId) || !byId.has(toId)) return;
    const key = pairKey(fromId, toId);
    if (existing.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push({
      id: `semantic:${kind}:${key}`,
      fromConceptId: fromId,
      toConceptId: toId,
      relation: 'correlates',
      weightBand: weightForBand(band),
      sourceClass: 'deterministic_placeholder',
      similarityBand: band,
      __semanticKind: kind,
      __semantic: true,
    });
  };

  // 1) Article / topic membership — star to hub when hub is a concept; otherwise
  //    dense member clique so topic cohorts still interact (D-151).
  let membershipCount = 0;
  for (const article of articles) {
    if (membershipCount >= maxMembership) break;
    const members = article.memberConceptIds.filter((id) => byId.has(id));
    if (members.length === 0) continue;
    const hubIsConcept = byId.has(article.topicId);
    if (hubIsConcept) {
      for (const memberId of members) {
        if (membershipCount >= maxMembership) break;
        if (memberId === article.topicId) continue;
        push(article.topicId, memberId, 'high', 'membership');
        membershipCount += 1;
      }
      // When the hub is the only member (library article star), still bridge to
      // co-tagged concepts later via shared_tag / overlap paths.
    } else {
      const cap = Math.min(members.length, 14);
      for (let i = 0; i < cap && membershipCount < maxMembership; i++) {
        for (let j = i + 1; j < cap && membershipCount < maxMembership; j++) {
          push(members[i]!, members[j]!, 'high', 'membership');
          membershipCount += 1;
        }
      }
    }
  }

  // 2) Shared display-tag bridges.
  const byTag = new Map<string, string[]>();
  for (const node of nodes) {
    for (const tag of displayTagsForGalaxy(node.tags)) {
      const key = tag.toLowerCase();
      const list = byTag.get(key) ?? [];
      list.push(node.id);
      byTag.set(key, list);
    }
  }
  let tagCount = 0;
  for (const ids of byTag.values()) {
    if (tagCount >= maxTag) break;
    if (ids.length < 2) continue;
    const cap = Math.min(ids.length, 10);
    for (let i = 0; i < cap && tagCount < maxTag; i++) {
      for (let j = i + 1; j < cap && tagCount < maxTag; j++) {
        push(ids[i]!, ids[j]!, 'medium', 'shared_tag');
        tagCount += 1;
      }
    }
  }

  // 3) Medium/high token overlap (title+tags+body). Prefer cross-folder/cross-lib pairs
  //    so separated spheres can still attract when content is related.
  const corpora = nodes.map((node) => ({
    id: node.id,
    tokens: tokenizeQualitativeText(conceptSemanticCorpus(node)),
    lib: node.primaryLibraryId ?? null,
    article: isResearchArticleConcept(node.tags),
  }));

  type Cand = { a: string; b: string; band: SimilarityBand; score: number; cross: number };
  const candidates: Cand[] = [];
  for (let i = 0; i < corpora.length; i++) {
    const left = corpora[i]!;
    if (left.tokens.length === 0) continue;
    for (let j = i + 1; j < corpora.length; j++) {
      const right = corpora[j]!;
      if (right.tokens.length === 0) continue;
      const key = pairKey(left.id, right.id);
      if (existing.has(key) || seen.has(key)) continue;
      const ratio = tokenOverlapRatio(left.tokens, right.tokens);
      const band = overlapToSimilarityBand(ratio);
      if (band === 'low') continue;
      const cross = left.lib && right.lib && left.lib !== right.lib ? 1 : 0;
      // Boost article↔related concept pairs slightly in ranking.
      const articleBoost = left.article !== right.article ? 0.02 : 0;
      candidates.push({
        a: left.id,
        b: right.id,
        band,
        score: ratio + articleBoost + cross * 0.04,
        cross,
      });
    }
  }

  candidates.sort((x, y) => y.score - x.score || y.cross - x.cross);
  let overlapCount = 0;
  for (const cand of candidates) {
    if (overlapCount >= maxOverlap) break;
    push(cand.a, cand.b, cand.band, 'overlap');
    overlapCount += 1;
  }

  return out;
}

/** @deprecated Prefer conceptSemanticCorpus — kept for call sites still using title/body/tags join. */
export function conceptSimilarityTextWithTags(node: {
  title: string;
  body: string;
  tags: string[];
}): string {
  return conceptSimilarityText({
    ...node,
    tags: displayTagsForGalaxy(node.tags),
  });
}
