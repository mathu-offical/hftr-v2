import { describe, expect, it } from 'vitest';
import { evidenceFromLibraryConcepts } from './library-concepts';

describe('evidenceFromLibraryConcepts', () => {
  it('normalizes admitted concepts to library EvidencePackages', () => {
    const pkgs = evidenceFromLibraryConcepts([
      {
        conceptId: '11111111-1111-1111-1111-111111111111',
        title: 'Regime note with 42 digits',
        body: 'Qualitative backdrop; ignore 100 for model paths.',
        libraryId: '22222222-2222-2222-2222-222222222222',
        libraryName: 'Strategy Evidence Library',
      },
    ]);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.sourceKind).toBe('library');
    expect(pkgs[0]?.feedClass).toBe('company_library');
    expect(pkgs[0]?.title).toContain('[n]');
    expect(pkgs[0]?.artifactRefs).toContain('concept:11111111-1111-1111-1111-111111111111');
  });

  it('returns empty when no rows', () => {
    expect(evidenceFromLibraryConcepts([])).toEqual([]);
  });
});
