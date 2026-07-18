import { describe, expect, it } from 'vitest';
import {
  classifyLibraryShelf,
  findLibraryOverviewTopic,
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
