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
    expect(researchTopicDisplayLabel('Strategy families', 0)).toBe('Strategy families');
  });

  it('strips nested seeded prefixes', () => {
    expect(
      researchTopicDisplayLabel('Strategy class — Opening auction and opening range', 2),
    ).toBe('Opening auction and opening range');
    expect(researchTopicDisplayLabel('Strategy families — Tier A', 2)).toBe('Tier A');
    expect(researchTopicDisplayLabel('Guardrail — Catalyst conflict guardrail', 2)).toBe(
      'Catalyst conflict guardrail',
    );
    expect(researchTopicDisplayLabel('Sector — Technology', 2)).toBe('Technology');
    expect(researchTopicDisplayLabel('Desk focus · Semiconductors · Strategies', 1)).toBe(
      'Strategies',
    );
  });
});

describe('researchTopicDisplayKind', () => {
  it('classifies program, group, and leaf', () => {
    expect(
      researchTopicDisplayKind({
        title: 'Seeded trading mechanisms',
        childCount: 11,
        provenance: 'deterministic_bootstrap',
      }),
    ).toBe('program');
    expect(
      researchTopicDisplayKind({
        title: 'Desk focus · Semiconductors',
        childCount: 4,
        provenance: 'deterministic_bootstrap',
      }),
    ).toBe('program');
    expect(
      researchTopicDisplayKind({
        title: 'Strategy families',
        childCount: 11,
        provenance: 'deterministic_bootstrap',
      }),
    ).toBe('group');
    expect(
      researchTopicDisplayKind({
        title: 'Compound strategies',
        childCount: 0,
        provenance: 'deterministic_bootstrap',
      }),
    ).toBe('leaf');
    expect(researchTopicKindLabel('program')).toBe('Program');
  });
});
