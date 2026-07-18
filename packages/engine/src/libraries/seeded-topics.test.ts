import { describe, expect, it } from 'vitest';
import {
  buildDeskFocusTopicSpecs,
  buildSeededDirectiveSynopsisMd,
  buildSeededTopicSpecsForCompany,
  DESK_FOCUS_TOPIC_PREFIX,
  isSeededTopicTitle,
  matchSeededTopicMembers,
  SEEDED_TOPIC_CATALOG_ROOT_TITLES,
  SEEDED_TOPIC_SPECS,
  SEEDED_TOPIC_TITLES,
  STRATEGY_FAMILY_CLASSES,
} from './seeded-topics';

describe('seeded topics (D-086 / D-096)', () => {
  it('defines separate catalog roots plus an overview index', () => {
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
    expect(SEEDED_TOPIC_CATALOG_ROOT_TITLES).toEqual(
      expect.arrayContaining([
        'Strategy families',
        'Guardrails',
        'Compound strategies',
        'Sector knowledge',
        'Session constraints',
        'Broker policy',
      ]),
    );
    expect(SEEDED_TOPIC_CATALOG_ROOT_TITLES).not.toContain('Seeded trading mechanisms');
  });

  it('does not nest catalog roots under Seeded trading mechanisms', () => {
    const nestedUnderProgram = SEEDED_TOPIC_SPECS.filter(
      (s) => s.parentTitle === 'Seeded trading mechanisms',
    );
    expect(nestedUnderProgram).toEqual([]);

    const tierA = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Strategy families — Tier A')!;
    expect(tierA.parentTitle).toBe('Strategy families');
    const sector = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Sector — Energy')!;
    expect(sector.parentTitle).toBe('Sector knowledge');

    const strategyFamilies = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Strategy families')!;
    expect(strategyFamilies.parentTitle).toBeUndefined();
  });

  it('builds desk-focus combination topics from company sector focuses', () => {
    const desk = buildDeskFocusTopicSpecs(['Semiconductors', 'Oil & gas producers']);
    expect(desk.some((s) => s.title === `${DESK_FOCUS_TOPIC_PREFIX}Semiconductors`)).toBe(
      true,
    );
    expect(
      desk.some((s) => s.title === `${DESK_FOCUS_TOPIC_PREFIX}Semiconductors · Strategies`),
    ).toBe(true);
    expect(
      desk.some((s) => s.title === `${DESK_FOCUS_TOPIC_PREFIX}Oil & gas producers · Trend leads`),
    ).toBe(true);

    const strategies = desk.find(
      (s) => s.title === `${DESK_FOCUS_TOPIC_PREFIX}Semiconductors · Strategies`,
    )!;
    expect(strategies.parentTitle).toBe(`${DESK_FOCUS_TOPIC_PREFIX}Semiconductors`);
    expect(strategies.members).toEqual(
      expect.arrayContaining([
        { catalog: 'sector_seeds', class: 'technology' },
        { catalog: 'strategy_families' },
      ]),
    );

    expect(isSeededTopicTitle(`${DESK_FOCUS_TOPIC_PREFIX}Semiconductors · Strategies`)).toBe(
      true,
    );
    expect(buildSeededTopicSpecsForCompany(['Semiconductors']).length).toBe(
      SEEDED_TOPIC_SPECS.length + desk.filter((s) => s.title.includes('Semiconductors')).length,
    );
  });

  it('matches members by catalog, tier, and class (OR across member filters)', () => {
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
      {
        id: '4',
        title: 'tech',
        sourceRef: 'sector_seeds/technology',
        tier: null,
      },
    ];
    const classBySourceRef = new Map<string, string | null>([
      ['strategy_families/x', 'opening_auction_and_opening_range'],
      ['strategy_families/y', 'intraday_trend_and_momentum'],
      ['guardrail_packages/z', 'catalyst_conflict_guardrail'],
      ['sector_seeds/technology', 'technology'],
    ]);
    expect(matchSeededTopicMembers(tierA, rows).map((m) => m.id)).toEqual(['1']);
    expect(
      matchSeededTopicMembers(opening, rows, undefined, classBySourceRef).map((m) => m.id),
    ).toEqual(['1']);

    const combo = buildDeskFocusTopicSpecs(['Semiconductors']).find(
      (s) => s.title === `${DESK_FOCUS_TOPIC_PREFIX}Semiconductors · Strategies`,
    )!;
    expect(
      matchSeededTopicMembers(combo, rows, undefined, classBySourceRef)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['1', '2', '4']);
  });

  it('builds leak-clean directive synopses with peer/child links', () => {
    const md = buildSeededDirectiveSynopsisMd({
      title: 'Guardrails',
      directive: 'Directive: keep guardrail packages visible.',
      childTitles: ['Guardrail — Catalyst conflict guardrail'],
    });
    expect(md).toContain('# Guardrails');
    expect(md).toContain('[[Guardrail — Catalyst conflict guardrail]]');
    expect(md).toContain('module-side');

    const overview = buildSeededDirectiveSynopsisMd({
      title: 'Seeded trading mechanisms',
      directive: 'Overview index.',
      isProgram: true,
      childTitles: ['Strategy families', 'Guardrails'],
    });
    expect(overview).toContain('## Peer directives');
    expect(overview).toContain('[[Strategy families]]');
  });
});
