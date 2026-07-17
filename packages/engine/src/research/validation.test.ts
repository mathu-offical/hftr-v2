import { describe, expect, it } from 'vitest';
import type { EvidencePackage } from '@hftr/contracts';
import { validateEvidencePackages } from './validation';

function pkg(overrides: Partial<EvidencePackage> = {}): EvidencePackage {
  return {
    sourceKind: 'brave_search',
    feedClass: 'brave_search',
    title: 'Semiconductor supply outlook',
    summary: 'Qualitative note on chip supply without raw figures.',
    digest: 'digest-semiconductor-supply',
    legalUseClass: 'ALLOWED',
    expiresAt: null,
    artifactRefs: [],
    externalRef: null,
    authorityClass: 'DETERMINISTIC',
    ...overrides,
  };
}

describe('validateEvidencePackages', () => {
  const nowMs = Date.parse('2026-07-17T12:00:00.000Z');

  it('passes when evidence is relevant, entitled, and leak-clean', () => {
    const result = validateEvidencePackages({
      evidencePackages: [pkg()],
      queryText: 'semiconductor supply',
      topicScope: 'chips',
      existingConceptTitles: [],
      nowMs,
    });
    expect(result.overallPass).toBe(true);
    expect(result.gates.find((g) => g.gateId === 'relevance')?.passed).toBe(true);
    expect(result.gates.find((g) => g.gateId === 'leak_recheck')?.passed).toBe(true);
  });

  it('fails leak_recheck on digit-heavy summaries', () => {
    const result = validateEvidencePackages({
      evidencePackages: [pkg({ summary: 'Revenue grew to 5000000 units last quarter.' })],
      queryText: 'semiconductor',
      topicScope: 'chips',
      existingConceptTitles: [],
      nowMs,
    });
    expect(result.overallPass).toBe(false);
    expect(result.gates.find((g) => g.gateId === 'leak_recheck')?.passed).toBe(false);
  });

  it('fails source_entitlement on RESTRICTED packages', () => {
    const result = validateEvidencePackages({
      evidencePackages: [pkg({ legalUseClass: 'RESTRICTED' })],
      queryText: 'semiconductor supply',
      topicScope: 'chips',
      existingConceptTitles: [],
      nowMs,
    });
    expect(result.overallPass).toBe(false);
    expect(result.gates.find((g) => g.gateId === 'source_entitlement')?.passed).toBe(false);
  });

  it('fails coherence when no evidence packages', () => {
    const result = validateEvidencePackages({
      evidencePackages: [],
      queryText: 'semiconductor',
      topicScope: 'chips',
      existingConceptTitles: [],
      nowMs,
    });
    expect(result.overallPass).toBe(false);
    expect(result.gates.find((g) => g.gateId === 'coherence')?.passed).toBe(false);
  });

  it('honors requiredGateIds subset for overallPass', () => {
    const result = validateEvidencePackages({
      evidencePackages: [pkg({ title: 'Unrelated topic entirely' })],
      queryText: 'quantum batteries',
      topicScope: 'energy',
      existingConceptTitles: [],
      nowMs,
      requiredGateIds: ['relevance', 'leak_recheck', 'source_entitlement'],
    });
    const required = result.gates.filter((g) =>
      ['relevance', 'leak_recheck', 'source_entitlement'].includes(g.gateId),
    );
    expect(result.overallPass).toBe(required.every((g) => g.passed));
  });
});
