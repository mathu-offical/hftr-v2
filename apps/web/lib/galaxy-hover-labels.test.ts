import { describe, expect, it } from 'vitest';
import {
  conceptHoverLines,
  escapeHoverHtml,
  linkHoverLines,
  linesToHoverHtml,
  nestHoverLines,
  tagHoverLines,
} from './galaxy-hover-labels';

describe('galaxy-hover-labels', () => {
  it('builds concept lines with nest, usage, and tags', () => {
    const lines = conceptHoverLines({
      kind: 'concept',
      title: 'opening_range_breakout',
      tags: ['auction', 'momentum', 'extra', 'fourth', 'hidden'],
      sourceClass: 'catalog_seed',
      curationStatus: 'auto_admitted',
      queryCount: 2,
      referenceCount: 5,
      libraryName: 'Seeded trading mechanisms',
      folderLabel: 'Strategy families',
      articleTitle: 'Opening auction',
      degree: 3,
    });
    expect(lines[0]).toMatch(/opening range breakout/i);
    expect(lines.some((l) => /Seeded|Strategy|Opening/i.test(l))).toBe(true);
    expect(lines.some((l) => /auto admitted/i.test(l))).toBe(true);
    expect(lines.some((l) => /Queried 2/.test(l) && /Referenced 5/.test(l))).toBe(true);
    expect(lines.some((l) => l.includes('auction') && l.includes('momentum'))).toBe(true);
    expect(lines.some((l) => l.includes('hidden'))).toBe(false);
  });

  it('builds tag and nest lines', () => {
    expect(tagHoverLines({ kind: 'tag-sat', title: 'momentum', parentTitle: 'orb' })[0]).toBe(
      'Tag · momentum',
    );
    expect(nestHoverLines({ kind: 'nest-hull', hullKind: 'library', label: 'Mechanisms' })[0]).toBe(
      'Library nest',
    );
  });

  it('builds link lines with similarity and endpoints', () => {
    const lines = linkHoverLines({
      relation: 'supports',
      weightBand: 'strong',
      similarityBand: 'high',
      fromTitle: 'alpha',
      toTitle: 'beta',
    });
    expect(lines[0]).toMatch(/supports · strong weight/i);
    expect(lines).toContain('Similarity · high');
    expect(lines.some((l) => l.includes('→'))).toBe(true);
  });

  it('escapes HTML for tooltips', () => {
    expect(escapeHoverHtml('a <b> & "q"')).toBe('a &lt;b&gt; &amp; &quot;q&quot;');
    expect(linesToHoverHtml(['Title', 'Meta'])).toContain('Title');
    expect(linesToHoverHtml(['Title', 'Meta'])).toContain('Meta');
  });
});
