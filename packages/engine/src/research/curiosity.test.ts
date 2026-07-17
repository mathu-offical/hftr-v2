import { describe, expect, it } from 'vitest';
import { resolveCuriosityMaxEvidence } from './curiosity';
import { buildDeterministicBatchFromEvidence } from './synthesis';
import type { EvidencePackage } from '@hftr/contracts';

describe('research pipeline helpers', () => {
  it('caps max evidence by curiosity band', () => {
    expect(resolveCuriosityMaxEvidence('conservative')).toBe(4);
    expect(resolveCuriosityMaxEvidence('balanced')).toBe(8);
    expect(resolveCuriosityMaxEvidence('exploratory')).toBe(16);
    expect(resolveCuriosityMaxEvidence('exploratory', 24)).toBe(16);
  });

  it('builds deterministic concept batch from evidence packages', () => {
    const evidence: EvidencePackage[] = [
      {
        sourceKind: 'catalog',
        feedClass: 'seed_catalog',
        title: 'Mean reversion guard',
        summary: 'Qualitative catalog note.',
        digest: 'abc123digest',
        legalUseClass: 'ALLOWED',
        expiresAt: null,
        artifactRefs: [],
        externalRef: 'strategy_families/mean_rev',
        authorityClass: 'DETERMINISTIC',
      },
    ];
    const batch = buildDeterministicBatchFromEvidence({
      evidencePackages: evidence,
      topicScope: 'risk controls',
    });
    expect(batch.concepts).toHaveLength(1);
    expect(batch.concepts[0]?.title).toBe('Mean reversion guard');
    expect(batch.concepts[0]?.tags).toContain('catalog');
  });
});
