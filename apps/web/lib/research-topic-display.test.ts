import { describe, expect, it } from 'vitest';
import {
  researchTopicDisplayKind,
  researchTopicDisplayLabel,
  researchTopicKindLabel,
} from './research-topic-display';

describe('researchTopicDisplayLabel', () => {
  it('keeps root titles intact', () => {
    expect(researchTopicDisplayLabel('Seeded trading mechanisms', 0)).toBe(
      'Seeded trading mechanisms',
    );
    expect(researchTopicDisplayLabel('Current awareness', 0)).toBe('Current awareness');
    expect(researchTopicDisplayLabel('Sector · Semiconductors', 0)).toBe(
      'Sector · Semiconductors',
    );
  });

  it('shortens nested awareness and legacy prefixes', () => {
    expect(researchTopicDisplayLabel('Market regime and breadth', 1)).toBe(
      'Market regime and breadth',
    );
    expect(researchTopicDisplayLabel('Sector · Semiconductors', 1)).toBe('Semiconductors');
    expect(researchTopicDisplayLabel('Desk focus · Semiconductors · Strategies', 1)).toBe(
      'Strategies',
    );
    expect(
      researchTopicDisplayLabel('Strategy class — Opening auction and opening range', 2),
    ).toBe('Opening auction and opening range');
  });
});

describe('researchTopicDisplayKind', () => {
  it('classifies program, group, and leaf', () => {
    expect(
      researchTopicDisplayKind({
        title: 'Current awareness',
        childCount: 3,
        provenance: 'deterministic_bootstrap',
      }),
    ).toBe('program');
    expect(
      researchTopicDisplayKind({
        title: 'Seeded trading mechanisms',
        childCount: 0,
        provenance: 'deterministic_bootstrap',
      }),
    ).toBe('leaf');
    expect(
      researchTopicDisplayKind({
        title: 'Market regime and breadth',
        childCount: 0,
      }),
    ).toBe('leaf');
    expect(researchTopicKindLabel('leaf')).toBe('Research point');
  });
});
