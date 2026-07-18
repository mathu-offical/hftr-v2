import { describe, expect, it } from 'vitest';
import { buildArticleOrbits, buildFolderStars } from './galaxy-graph-nesting';

describe('galaxy-graph-nesting', () => {
  const baselineLibrary = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Seeded trading mechanisms',
    masterLibrary: false,
    topicScope: 'compile_time_mechanisms',
    conceptCount: 2,
  };
  const runtimeLibrary = {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Operator notes',
    masterLibrary: false,
    topicScope: '',
    conceptCount: 1,
  };

  it('groups catalog-tagged concepts into folder stars under primary library', () => {
    const folders = buildFolderStars(
      [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          title: 'Momentum family',
          body: 'Trend following qualitative note',
          tags: ['strategy_families', 'tier_a'],
          primaryLibraryId: baselineLibrary.id,
        },
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          title: 'Drawdown guard',
          body: 'Risk envelope qualitative note',
          tags: ['guardrail_packages'],
          primaryLibraryId: baselineLibrary.id,
        },
      ],
      [baselineLibrary, runtimeLibrary],
    );

    expect(folders).toHaveLength(2);
    expect(folders.map((f) => f.folderKey).sort()).toEqual([
      'guardrail_packages',
      'strategy_families',
    ]);
    expect(folders.every((f) => f.mass >= 2 && f.mass <= 24)).toBe(true);
    expect(folders.find((f) => f.folderKey === 'strategy_families')?.memberConceptIds).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ]);
  });

  it('groups non-baseline concepts without catalog tags into runtime folders', () => {
    const folders = buildFolderStars(
      [
        {
          id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          title: 'Custom thesis',
          body: 'Operator curated qualitative note',
          tags: ['custom'],
          primaryLibraryId: runtimeLibrary.id,
        },
      ],
      [baselineLibrary, runtimeLibrary],
    );

    expect(folders).toHaveLength(1);
    expect(folders[0]?.folderKey).toBe('runtime');
    expect(folders[0]?.libraryId).toBe(runtimeLibrary.id);
  });

  it('builds article orbits with majority library and folder', () => {
    const conceptA = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      title: 'A',
      body: '',
      tags: ['strategy_families'],
      primaryLibraryId: baselineLibrary.id,
    };
    const conceptB = {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      title: 'B',
      body: '',
      tags: ['strategy_families'],
      primaryLibraryId: baselineLibrary.id,
    };
    const conceptC = {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      title: 'C',
      body: '',
      tags: ['guardrail_packages'],
      primaryLibraryId: runtimeLibrary.id,
    };

    const articles = buildArticleOrbits(
      [{ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', title: 'Supply chain thesis' }],
      [
        { topicId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', conceptId: conceptA.id },
        { topicId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', conceptId: conceptB.id },
        { topicId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', conceptId: conceptC.id },
      ],
      new Map([
        [conceptA.id, conceptA],
        [conceptB.id, conceptB],
        [conceptC.id, conceptC],
      ]),
    );

    expect(articles).toHaveLength(1);
    expect(articles[0]?.libraryId).toBe(baselineLibrary.id);
    expect(articles[0]?.folderKey).toBe('strategy_families');
    expect(articles[0]?.memberConceptIds).toHaveLength(3);
  });
});
