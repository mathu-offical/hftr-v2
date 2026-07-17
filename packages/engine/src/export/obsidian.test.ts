import { describe, expect, it } from 'vitest';
import { exportObsidianNotes } from './obsidian';

const CONCEPT_A = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Momentum Regime',
  body: 'Qualitative note about regime shifts without numeric literals.',
  tags: ['regime', 'momentum'],
  sourceClass: 'model_generated' as const,
  sourceRef: 'catalog/momentum_v1',
};

const CONCEPT_B = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  title: 'Risk Posture',
  body: 'Conservative posture when uncertainty is elevated.',
  tags: ['risk'],
  sourceClass: 'operator' as const,
  sourceRef: null,
};

describe('exportObsidianNotes', () => {
  it('emits YAML frontmatter with tags and provenance', () => {
    const notes = exportObsidianNotes({
      concepts: [CONCEPT_A],
      links: [],
      libraryName: 'Master Library',
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.markdown).toContain('---');
    expect(notes[0]?.markdown).toContain('title: Momentum Regime');
    expect(notes[0]?.markdown).toContain('hftr_id: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(notes[0]?.markdown).toContain('source_class: model_generated');
    expect(notes[0]?.markdown).toContain('library: Master Library');
    expect(notes[0]?.markdown).toContain('  - regime');
    expect(notes[0]?.markdown).toContain('  - momentum');
  });

  it('renders outgoing edges as wikilinks in body and frontmatter', () => {
    const notes = exportObsidianNotes({
      concepts: [CONCEPT_A, CONCEPT_B],
      links: [
        {
          fromConceptId: CONCEPT_A.id,
          toConceptId: CONCEPT_B.id,
          relation: 'supports',
          weightBand: 'strong',
        },
      ],
    });
    const noteA = notes.find((n) => n.filename.startsWith('momentum-regime'));
    expect(noteA?.markdown).toContain('target: "[[Risk Posture]]"');
    expect(noteA?.markdown).toContain('## Links');
    expect(noteA?.markdown).toContain('- [[Risk Posture]] (strong)');
    expect(noteA?.markdown).toContain('### supports');
  });

  it('produces zip-ready unique filenames', () => {
    const notes = exportObsidianNotes({
      concepts: [
        CONCEPT_A,
        { ...CONCEPT_A, id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', title: 'Momentum Regime' },
        { ...CONCEPT_B, id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', title: '!!!' },
      ],
      links: [],
    });
    const filenames = notes.map((n) => n.filename);
    expect(filenames).toEqual(['momentum-regime.md', 'momentum-regime-2.md', 'concept.md']);
    for (const name of filenames) {
      expect(name).toMatch(/^[a-z0-9][a-z0-9-]*\.md$/);
    }
  });
});

describe('exportObsidianTopicNotes', () => {
  it('emits topic notes with member wikilinks', async () => {
    const { exportObsidianTopicNotes } = await import('./obsidian');
    const notes = exportObsidianTopicNotes({
      topics: [
        {
          id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          title: 'Semiconductor Cycle',
          synopsisMd: '## Overview\nSee linked concepts without numeric literals.',
          status: 'active',
          priority: 'high',
          memberTitles: ['Momentum Regime', 'Risk Posture'],
        },
      ],
      folder: 'topics',
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.filename).toBe('topics/topic-semiconductor-cycle.md');
    expect(notes[0]?.markdown).toContain('kind: research_topic');
    expect(notes[0]?.markdown).toContain('## Overview');
    expect(notes[0]?.markdown).toContain('- [[Momentum Regime]]');
    expect(notes[0]?.markdown).toContain('- [[Risk Posture]]');
  });
});
