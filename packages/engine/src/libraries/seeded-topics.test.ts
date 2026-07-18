import { describe, expect, it } from 'vitest';
import {
  buildDeskFocusTopicSpecs,
  buildSeededDirectiveSynopsisMd,
  buildSeededTopicSpecsForCompany,
  buildSectorResearchTopicSpecs,
  CURRENT_AWARENESS_TOPIC_TITLE,
  DESK_FOCUS_TOPIC_PREFIX,
  isSeededTopicTitle,
  matchSeededTopicMembers,
  SECTOR_RESEARCH_TOPIC_PREFIX,
  SEEDED_TOPIC_CATALOG_ROOT_TITLES,
  SEEDED_TOPIC_SPECS,
  SEEDED_TOPIC_TITLES,
} from './seeded-topics';

describe('seeded topics (D-126 awareness + sector research points)', () => {
  it('seeds awareness + library overview — not catalog class mirrors', () => {
    expect(SEEDED_TOPIC_SPECS.length).toBe(5);
    expect(SEEDED_TOPIC_SPECS.some((s) => s.title === 'Seeded trading mechanisms')).toBe(
      true,
    );
    expect(SEEDED_TOPIC_SPECS.some((s) => s.title === CURRENT_AWARENESS_TOPIC_TITLE)).toBe(
      true,
    );
    expect(SEEDED_TOPIC_SPECS.some((s) => s.title === 'Market regime and breadth')).toBe(
      true,
    );
    expect(SEEDED_TOPIC_SPECS.some((s) => s.title === 'Strategy families')).toBe(false);
    expect(SEEDED_TOPIC_SPECS.some((s) => s.title.startsWith('Guardrail —'))).toBe(false);
    expect(SEEDED_TOPIC_SPECS.some((s) => s.title.startsWith('Sector —'))).toBe(false);

    expect(SEEDED_TOPIC_CATALOG_ROOT_TITLES).toEqual([CURRENT_AWARENESS_TOPIC_TITLE]);
    expect(isSeededTopicTitle('Seeded trading mechanisms')).toBe(true);
    expect(isSeededTopicTitle('Macro and policy watch')).toBe(true);
    expect(isSeededTopicTitle('Strategy families')).toBe(false);
  });

  it('nests awareness children under Current awareness', () => {
    const regime = SEEDED_TOPIC_SPECS.find((s) => s.title === 'Market regime and breadth')!;
    expect(regime.parentTitle).toBe(CURRENT_AWARENESS_TOPIC_TITLE);
    const program = SEEDED_TOPIC_SPECS.find((s) => s.title === CURRENT_AWARENESS_TOPIC_TITLE)!;
    expect(program.isProgram).toBe(true);
    expect(program.parentTitle).toBeUndefined();
  });

  it('builds one Sector · research point per company focus (no catalog combos)', () => {
    const sectors = buildSectorResearchTopicSpecs([
      'Semiconductors',
      'Oil & gas producers',
      'Custom niche label',
    ]);
    expect(sectors.map((s) => s.title)).toEqual([
      `${SECTOR_RESEARCH_TOPIC_PREFIX}Semiconductors`,
      `${SECTOR_RESEARCH_TOPIC_PREFIX}Oil & gas producers`,
      `${SECTOR_RESEARCH_TOPIC_PREFIX}Custom niche label`,
    ]);
    expect(sectors.every((s) => !s.parentTitle)).toBe(true);
    expect(sectors.some((s) => s.title.includes('Strategies'))).toBe(false);

    const semis = sectors.find(
      (s) => s.title === `${SECTOR_RESEARCH_TOPIC_PREFIX}Semiconductors`,
    )!;
    expect(semis.members).toEqual([{ catalog: 'sector_seeds', class: 'technology' }]);

    const custom = sectors.find(
      (s) => s.title === `${SECTOR_RESEARCH_TOPIC_PREFIX}Custom niche label`,
    )!;
    expect(custom.members).toEqual([]);

    expect(isSeededTopicTitle(`${SECTOR_RESEARCH_TOPIC_PREFIX}Semiconductors`)).toBe(true);
    expect(isSeededTopicTitle(`${DESK_FOCUS_TOPIC_PREFIX}Semiconductors · Strategies`)).toBe(
      true,
    );

    // Deprecated alias still works.
    expect(buildDeskFocusTopicSpecs(['Semiconductors']).length).toBe(1);

    expect(buildSeededTopicSpecsForCompany(['Semiconductors']).length).toBe(
      SEEDED_TOPIC_SPECS.length + 1,
    );
  });

  it('matches light sector_seeds membership for mapped focuses', () => {
    const semis = buildSectorResearchTopicSpecs(['Semiconductors'])[0]!;
    const rows = [
      {
        id: '1',
        title: 'tech seed',
        sourceRef: 'sector_seeds/technology',
        tier: null,
      },
      {
        id: '2',
        title: 'strategy',
        sourceRef: 'strategy_families/x',
        tier: 'tier_a',
      },
    ];
    const classBySourceRef = new Map<string, string | null>([
      ['sector_seeds/technology', 'technology'],
      ['strategy_families/x', 'opening_auction_and_opening_range'],
    ]);
    expect(
      matchSeededTopicMembers(semis, rows, undefined, classBySourceRef).map((m) => m.id),
    ).toEqual(['1']);
  });

  it('builds leak-clean awareness synopses', () => {
    const md = buildSeededDirectiveSynopsisMd({
      title: CURRENT_AWARENESS_TOPIC_TITLE,
      directive: 'Research point: seed awareness.',
      isProgram: true,
      childTitles: ['Market regime and breadth'],
    });
    expect(md).toContain(`# ${CURRENT_AWARENESS_TOPIC_TITLE}`);
    expect(md).toContain('[[Market regime and breadth]]');
    expect(md).toContain('distinct from seeded library knowledge');

    const overview = buildSeededDirectiveSynopsisMd({
      title: 'Seeded trading mechanisms',
      directive: 'Library nest overview.',
      childTitles: [CURRENT_AWARENESS_TOPIC_TITLE],
    });
    expect(overview).toContain('not a research queue');
    expect(overview).toContain(`[[${CURRENT_AWARENESS_TOPIC_TITLE}]]`);
    expect(SEEDED_TOPIC_TITLES.has('News and event readthrough')).toBe(true);
  });
});
