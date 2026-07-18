import { describe, expect, it } from 'vitest';
import { classifyLibraryShelf } from './research-library-shelves';

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
