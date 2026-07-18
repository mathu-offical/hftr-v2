import { describe, expect, it } from 'vitest';
import { resolveNestEmphasis, relatedHullIdsForConcept } from './galaxy-nest-emphasis';
import { COMPANY_HULL_ID, folderHullId, nestHullId } from './galaxy-nest-hulls';

describe('galaxy-nest-emphasis', () => {
  it('marks selected and hovered hulls', () => {
    const libId = nestHullId('lib-a');
    expect(
      resolveNestEmphasis(
        { id: libId, __hullKind: 'library', __libraryId: 'lib-a' },
        {
          hoveredHullId: null,
          selectedHullId: libId,
          hoveredConceptId: null,
          hoveredConceptLibraryId: null,
          hoveredConceptFolderKey: null,
          hoveredConceptArticleId: null,
          highlightConceptId: null,
          highlightLibraryId: null,
          highlightFolderKey: null,
          highlightArticleId: null,
        },
      ),
    ).toBe('selected');

    expect(
      resolveNestEmphasis(
        { id: libId, __hullKind: 'library', __libraryId: 'lib-a' },
        {
          hoveredHullId: libId,
          selectedHullId: null,
          hoveredConceptId: null,
          hoveredConceptLibraryId: null,
          hoveredConceptFolderKey: null,
          hoveredConceptArticleId: null,
          highlightConceptId: null,
          highlightLibraryId: null,
          highlightFolderKey: null,
          highlightArticleId: null,
        },
      ),
    ).toBe('hover');
  });

  it('dims siblings while keeping company present on concept hover', () => {
    const ctx = {
      hoveredHullId: null,
      selectedHullId: null,
      hoveredConceptId: 'c1',
      hoveredConceptLibraryId: 'lib-a',
      hoveredConceptFolderKey: 'strategy_families',
      hoveredConceptArticleId: null as string | null,
      highlightConceptId: null,
      highlightLibraryId: null,
      highlightFolderKey: null,
      highlightArticleId: null,
    };
    expect(
      resolveNestEmphasis({ id: COMPANY_HULL_ID, __hullKind: 'company' }, ctx),
    ).toBe('hover');
    expect(
      resolveNestEmphasis(
        { id: nestHullId('lib-a'), __hullKind: 'library', __libraryId: 'lib-a' },
        ctx,
      ),
    ).toBe('hover');
    expect(
      resolveNestEmphasis(
        { id: nestHullId('lib-b'), __hullKind: 'library', __libraryId: 'lib-b' },
        ctx,
      ),
    ).toBe('dim');
    expect(
      resolveNestEmphasis(
        {
          id: folderHullId('lib-a', 'strategy_families'),
          __hullKind: 'folder',
          __libraryId: 'lib-a',
        },
        ctx,
      ),
    ).toBe('hover');
  });

  it('lists related hull ids for a concept ancestry', () => {
    const ids = relatedHullIdsForConcept({
      libraryId: 'lib-a',
      folderKey: 'f1',
      articleId: 't1',
    });
    expect(ids[0]).toBe(COMPANY_HULL_ID);
    expect(ids).toContain(nestHullId('lib-a'));
    expect(ids).toContain(folderHullId('lib-a', 'f1'));
  });
});
