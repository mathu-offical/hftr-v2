import { describe, expect, it } from 'vitest';
import {
  classifyLibraryShelf,
  findLibraryOverviewTopic,
  groupSeededPagesIntoCatalogShelves,
  humanizeSeedTag,
  seedCatalogForPage,
  shortLibraryLabel,
} from './research-library-shelves';

describe('classifyLibraryShelf', () => {
  it('classifies baseline seeded by name', () => {
    expect(
      classifyLibraryShelf({
        name: 'Seeded trading mechanisms',
        topicScope: 'other',
      }),
    ).toBe('baseline_seeded');
  });

  it('classifies baseline seeded by topicScope', () => {
    expect(
      classifyLibraryShelf({
        name: 'Custom catalog',
        topicScope: 'compile_time_mechanisms',
      }),
    ).toBe('baseline_seeded');
  });

  it('classifies system curated and runtime shelves', () => {
    expect(
      classifyLibraryShelf({
        name: 'Movers cadence',
        topicScope: 'system:movers',
      }),
    ).toBe('system_curated');
    expect(
      classifyLibraryShelf({
        name: 'Operator notes',
        topicScope: 'macro',
      }),
    ).toBe('runtime');
  });
});

describe('findLibraryOverviewTopic', () => {
  it('matches library folder to overview topic by exact title', () => {
    const topics = [
      { id: 't1', title: 'E2E Topic Nest' },
      { id: 't2', title: 'Seeded trading mechanisms' },
    ];
    expect(findLibraryOverviewTopic('Seeded trading mechanisms', topics)).toEqual({
      id: 't2',
      title: 'Seeded trading mechanisms',
    });
    expect(findLibraryOverviewTopic('Missing', topics)).toBeNull();
  });
});

describe('shortLibraryLabel', () => {
  it('keeps the head segment before arrow chains and truncates', () => {
    expect(
      shortLibraryLabel(
        'Strategy Evidence Library ← Evidence Librarian · Market Regime Research → Market 0',
        28,
      ),
    ).toBe('Strategy Evidence Library');
    expect(shortLibraryLabel('Seeded trading mechanisms', 12)).toBe('Seeded trad…');
  });
});

describe('groupSeededPagesIntoCatalogShelves', () => {
  it('splits pages into catalog shelves with tier subfolders', () => {
    const groups = groupSeededPagesIntoCatalogShelves([
      {
        conceptId: '1',
        title: 'opening_range_breakout',
        tags: ['strategy_families', 'tier_a'],
      },
      {
        conceptId: '2',
        title: 'vwap_reversion',
        tags: ['strategy_families', 'tier_b'],
      },
      {
        conceptId: '3',
        title: 'event_conflict_blackout',
        tags: ['guardrail_packages', 'tier_a'],
      },
      {
        conceptId: '4',
        title: 'regular_equities',
        tags: ['session_constraints'],
      },
    ]);

    expect(seedCatalogForPage(['strategy_families', 'tier_a'])).toBe('strategy_families');
    expect(humanizeSeedTag('tier_a')).toBe('Tier A');

    const strategies = groups.find((g) => g.catalog === 'strategy_families');
    expect(strategies?.label).toBe('Strategy families');
    expect(strategies?.showOverview).toBe(true);
    expect(strategies?.flatPages).toBeNull();
    expect(strategies?.subfolders.map((s) => s.id)).toEqual(['tier_a', 'tier_b']);
    expect(strategies?.subfolders[0]?.pages).toHaveLength(1);

    const sessions = groups.find((g) => g.catalog === 'session_constraints');
    expect(sessions?.flatPages).toHaveLength(1);
    expect(sessions?.subfolders).toHaveLength(0);

    const guardrails = groups.find((g) => g.catalog === 'guardrail_packages');
    expect(guardrails?.showOverview).toBe(false);
    expect(guardrails?.flatPages).toHaveLength(1);
  });
});
