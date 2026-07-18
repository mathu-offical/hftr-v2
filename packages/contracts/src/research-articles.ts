import { z } from 'zod';

/**
 * Research articles (D-127) are library-backed concepts produced by research modules
 * (or operator submit). They are distinct from research **topics** (work directives)
 * and from catalog seed knowledge. Marker tag is always present; display tags are 1–3
 * operator/agent chips shown in the Articles list.
 */

/** Stable system marker — not shown as a display chip. */
export const RESEARCH_ARTICLE_TAG = 'hftr:article';

export const ARTICLE_DISPLAY_TAG_MAX = 3;

const SYSTEM_TAG_PREFIXES = ['hftr:', 'operator_', 'system_', 'tier_', 'sector_'] as const;

export function isSystemArticleTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  if (t === RESEARCH_ARTICLE_TAG) return true;
  if (t === 'catalog' || t === 'catalog_seed') return true;
  for (const prefix of SYSTEM_TAG_PREFIXES) {
    if (t.startsWith(prefix)) return true;
  }
  return false;
}

/** True when tags mark a research article (agent or operator). */
export function isResearchArticleConcept(tags: readonly string[]): boolean {
  return tags.some((t) => t.trim() === RESEARCH_ARTICLE_TAG);
}

/** 1–3 chips for the Articles list line (excludes system markers). */
export function articleDisplayTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || isSystemArticleTag(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= ARTICLE_DISPLAY_TAG_MAX) break;
  }
  return out;
}

/**
 * Normalize tags for an article concept: keep at most 3 display tags + marker.
 * System tags besides the marker are dropped from the display set but operator_*
 * provenance tags may be re-added by callers after this helper.
 */
export function withResearchArticleTag(
  displayOrMixedTags: readonly string[] = [],
): string[] {
  const display = articleDisplayTags(displayOrMixedTags);
  return [RESEARCH_ARTICLE_TAG, ...display];
}

export const ArticleDisplayTagsInput = z
  .array(z.string().trim().min(1).max(64))
  .max(ARTICLE_DISPLAY_TAG_MAX);

export type ArticleDisplayTagsInput = z.infer<typeof ArticleDisplayTagsInput>;

export const LibraryLibrarianAction = z.enum(['curate', 'verify', 'refresh']);
export type LibraryLibrarianAction = z.infer<typeof LibraryLibrarianAction>;

export const LibraryLibrarianActionInput = z.object({
  action: LibraryLibrarianAction,
  /** Research module that owns gather/curate for this company library. */
  moduleId: z.string().uuid().optional(),
});
export type LibraryLibrarianActionInput = z.infer<typeof LibraryLibrarianActionInput>;

export const LibraryLibrarianActionResult = z.object({
  action: LibraryLibrarianAction,
  libraryId: z.string().uuid(),
  queued: z.boolean().optional(),
  verifiedCount: z.number().int().nonnegative().optional(),
  refreshed: z.boolean().optional(),
});
export type LibraryLibrarianActionResult = z.infer<typeof LibraryLibrarianActionResult>;
