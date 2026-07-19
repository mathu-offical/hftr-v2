import { describe, expect, it } from 'vitest';
import type { ResearchGraphNode } from '@hftr/contracts';
import {
  buildSemanticGalaxyLinks,
  conceptSemanticCorpus,
  displayTagsForGalaxy,
  isDisplayGalaxyTag,
} from './galaxy-semantic-springs';

function node(
  partial: Partial<ResearchGraphNode> & Pick<ResearchGraphNode, 'id' | 'title'>,
): ResearchGraphNode {
  return {
    moduleId: '11111111-1111-1111-1111-111111111111',
    body: partial.body ?? '',
    tags: partial.tags ?? [],
    sourceClass: partial.sourceClass ?? 'catalog_seed',
    status: 'active',
    primaryLibraryId: partial.primaryLibraryId ?? '22222222-2222-2222-2222-222222222222',
    ...partial,
  };
}

describe('galaxy-semantic-springs', () => {
  it('filters system tags from display chips', () => {
    expect(isDisplayGalaxyTag('hftr:article')).toBe(false);
    expect(isDisplayGalaxyTag('catalog_seed')).toBe(false);
    expect(isDisplayGalaxyTag('strategy_families')).toBe(false);
    expect(isDisplayGalaxyTag('macro')).toBe(true);
    expect(displayTagsForGalaxy(['hftr:article', 'macro', 'intraday'])).toEqual([
      'macro',
      'intraday',
    ]);
  });

  it('weights display tags in semantic corpus', () => {
    const corpus = conceptSemanticCorpus({
      title: 'Alpha thesis',
      body: 'long body text about markets',
      tags: ['hftr:article', 'macro', 'liquidity'],
    });
    expect(corpus).toContain('macro');
    expect(corpus).toContain('liquidity');
    expect(corpus.match(/macro/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('builds membership springs from article hubs', () => {
    const hub = node({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      title: 'Article hub',
      tags: ['hftr:article', 'macro'],
      sourceClass: 'operator',
    });
    const member = node({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'Member concept',
      tags: ['macro'],
      body: 'macro liquidity note',
    });
    const springs = buildSemanticGalaxyLinks(
      [hub, member],
      [],
      [
        {
          topicId: hub.id,
          title: hub.title,
          libraryId: hub.primaryLibraryId ?? null,
          folderKey: 'runtime',
          memberConceptIds: [hub.id, member.id],
        },
      ],
    );
    expect(springs.some((s) => s.__semanticKind === 'membership')).toBe(true);
    expect(
      springs.some(
        (s) =>
          (s.fromConceptId === hub.id && s.toConceptId === member.id) ||
          (s.fromConceptId === member.id && s.toConceptId === hub.id),
      ),
    ).toBe(true);
  });

  it('builds shared-tag and overlap springs and skips persisted pairs', () => {
    const a = node({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      title: 'Momentum leaders',
      body: 'relative strength momentum leaders across sectors',
      tags: ['momentum', 'leaders'],
      primaryLibraryId: '11111111-1111-1111-1111-111111111111',
    });
    const b = node({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'Momentum roster',
      body: 'relative strength momentum leaders watchlist',
      tags: ['roster'],
      primaryLibraryId: '22222222-2222-2222-2222-222222222222',
    });
    const c = node({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      title: 'Unrelated compliance hold',
      body: 'legal retention precedence archive',
      tags: ['compliance'],
      primaryLibraryId: '33333333-3333-3333-3333-333333333333',
    });
    const d = node({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      title: 'Liquidity profile note',
      body: 'session liquidity profile intraday depth',
      tags: ['momentum'],
      primaryLibraryId: '11111111-1111-1111-1111-111111111111',
    });

    const springs = buildSemanticGalaxyLinks([a, b, c, d], [], []);
    expect(springs.some((s) => s.__semanticKind === 'shared_tag')).toBe(true);
    expect(springs.some((s) => s.__semanticKind === 'overlap' && s.similarityBand !== 'low')).toBe(
      true,
    );

    const skipped = buildSemanticGalaxyLinks(
      [a, b, c, d],
      [{ fromConceptId: a.id, toConceptId: b.id }],
      [],
    );
    expect(
      skipped.some(
        (s) =>
          (s.fromConceptId === a.id && s.toConceptId === b.id) ||
          (s.fromConceptId === b.id && s.toConceptId === a.id),
      ),
    ).toBe(false);
  });
});
