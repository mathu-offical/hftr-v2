/**
 * Resolve nest hull visual emphasis from hover / selection / concept ancestry.
 * Company envelope never disappears; other nests stay visible but can dim.
 */

import type { NestEmphasis } from './galaxy-nest-mesh';
import {
  COMPANY_HULL_ID,
  articleHullId,
  folderHullId,
  nestHullId,
  type NestHullKind,
} from './galaxy-nest-hulls';

export interface NestEmphasisContext {
  hoveredHullId: string | null;
  selectedHullId: string | null;
  /** Concept under pointer (or parent of tag sat). */
  hoveredConceptId: string | null;
  hoveredConceptLibraryId: string | null;
  hoveredConceptFolderKey: string | null;
  hoveredConceptArticleId: string | null;
  /** Concept selected via inspector highlight. */
  highlightConceptId: string | null;
  highlightLibraryId: string | null;
  highlightFolderKey: string | null;
  highlightArticleId: string | null;
}

export function relatedHullIdsForConcept(opts: {
  libraryId: string | null;
  folderKey: string | null;
  articleId: string | null;
}): string[] {
  const ids: string[] = [COMPANY_HULL_ID];
  if (opts.libraryId) ids.push(nestHullId(opts.libraryId));
  if (opts.libraryId && opts.folderKey) {
    ids.push(folderHullId(opts.libraryId, opts.folderKey));
  }
  if (opts.articleId) ids.push(articleHullId(opts.articleId));
  return ids;
}

export function resolveNestEmphasis(
  hull: { id: string; __hullKind: NestHullKind; __libraryId?: string | undefined },
  ctx: NestEmphasisContext,
): NestEmphasis {
  const id = hull.id;

  if (ctx.selectedHullId && id === ctx.selectedHullId) return 'selected';
  if (ctx.hoveredHullId && id === ctx.hoveredHullId) return 'hover';

  const hoverRelated = relatedHullIdsForConcept({
    libraryId: ctx.hoveredConceptLibraryId,
    folderKey: ctx.hoveredConceptFolderKey,
    articleId: ctx.hoveredConceptArticleId,
  });
  const highlightRelated = relatedHullIdsForConcept({
    libraryId: ctx.highlightLibraryId,
    folderKey: ctx.highlightFolderKey,
    articleId: ctx.highlightArticleId,
  });

  if (ctx.hoveredConceptId && hoverRelated.includes(id)) {
    return id === COMPANY_HULL_ID ? 'hover' : 'hover';
  }
  if (ctx.highlightConceptId && highlightRelated.includes(id)) {
    return id === COMPANY_HULL_ID ? 'hover' : 'selected';
  }

  const anyFocus =
    Boolean(ctx.hoveredHullId) ||
    Boolean(ctx.selectedHullId) ||
    Boolean(ctx.hoveredConceptId) ||
    Boolean(ctx.highlightConceptId);

  if (!anyFocus) return 'idle';

  // Company stays present as calm envelope while nested spheres take focus.
  if (hull.__hullKind === 'company') return 'dim';
  return 'dim';
}
