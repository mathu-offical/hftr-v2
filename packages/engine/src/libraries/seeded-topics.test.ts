import { describe, expect, it } from 'vitest';
import {
  buildSeededDirectiveSynopsisMd,
  matchSeededTopicMembers,
  SEEDED_TOPIC_SPECS,
  SEEDED_TOPIC_TITLES,
  STRATEGY_FAMILY_CLASSES,
  isSeededTopicTitle,
} from './seeded-topics';

describe('seeded topics (D-086)', () => {
  it('defines a deep program tree (groups + class/tier/sector leaves)', () => {
    expect(SEEDED_TOPIC_SPECS.some((s) => s.isProgram)).toBe(true);
    expect(SEEDED_TOPIC_SPECS.length).toBe(78);
    expect(isSeededTopicTitle('Seeded trading mechanisms')).toBe(true);
    expect(isSeededTopicTitle('Strategy families')).toBe(true);
    expect(isSeededTopicTitle('Strategy families — Tier A')).toBe(true);
    expect(isSeededTopicTitle('Strategy class — Opening auction and opening range')).toBe(
      true,
    );
    expect(isSeededTopicTitle('Guardrail — Catalyst conflict guardrail')).toBe(true);
    expect(isSeededTopicTitle('Sector — Technology')).toBe(true);
    expect(isSeededTopicTitle('Compliance packages')).toBe(true);
    expect(SEEDED_TOPIC_TITLES.has('Macro triggers')).toBe(true);
    expect(STRATEGY_FAMILY_CLASSES.length).toBe(8);
  });

  it('nests leaves under mid-level groups, not only the program', () => {
    const tierA = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Strategy families — Tier A')!;
    expect(tierA.parentTitle).toBe('Strategy families');
    const sector = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Sector — Energy')!;
    expect(sector.parentTitle).toBe('Sector knowledge');
    const programChildren = SEEDED_TOPIC_SPECS.filter(
      (s) => s.parentTitle === 'Seeded trading mechanisms',
    );
    expect(programChildren.map((c) => c.title)).toEqual(
      expect.arrayContaining([
        'Strategy families',
        'Guardrails',
        'Compound strategies',
        'Sector knowledge',
      ]),
    );
  });

  it('matches members by catalog, tier, and class', () => {
    const tierA = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Strategy families — Tier A')!;
    const opening = SEEDED_TOPIC_SPECS.find(
      (s) => s.title === 'Strategy class — Opening auction and opening range',
    )!;
    const rows = [
      {
        id: '1',
        title: 'a',
        sourceRef: 'strategy_families/x',
        tier: 'tier_a',
      },
      {
        id: '2',
        title: 'b',
        sourceRef: 'strategy_families/y',
        tier: 'tier_b',
      },
      {
        id: '3',
        title: 'c',
        sourceRef: 'guardrail_packages/z',
        tier: null,
      },
    ];
    const classBySourceRef = new Map<string, string | null>([
      ['strategy_families/x', 'opening_auction_and_opening_range'],
      ['strategy_families/y', 'intraday_trend_and_momentum'],
      ['guardrail_packages/z', 'catalyst_conflict_guardrail'],
    ]);
    expect(matchSeededTopicMembers(tierA, rows).map((m) => m.id)).toEqual(['1']);
    expect(
      matchSeededTopicMembers(opening, rows, undefined, classBySourceRef).map((m) => m.id),
    ).toEqual(['1']);
  });

  it('builds leak-clean directive synopses with child links', () => {
    const md = buildSeededDirectiveSynopsisMd({
      title: 'Guardrails',
      directive: 'Directive: keep guardrail packages visible.',
      childTitles: ['Guardrail — Catalyst conflict guardrail'],
    });
    expect(md).toContain('# Guardrails');
    expect(md).toContain('[[Guardrail — Catalyst conflict guardrail]]');
    expect(md).toContain('module-side');
  });
});
