import { describe, expect, it } from 'vitest';
import { ConceptBatch } from '@hftr/contracts';
import {
  allowedRefsFromEvidence,
  assertBatchEvidenceGrounded,
} from './evidence-grounding';

describe('assertBatchEvidenceGrounded', () => {
  it('accepts evidence: and seal: refs in the allow sets', () => {
    const batch = ConceptBatch.parse({
      concepts: [
        {
          title: 'alpha_note',
          body: 'Qualitative note grounded in evidence.',
          tags: ['research'],
          sourceRef: 'evidence:digestabcdefgh',
        },
        {
          title: 'seal_note',
          body: 'Qualitative note grounded in a seal.',
          tags: ['research'],
          sourceRef: 'seal:sha256-abcdef0123456789',
        },
      ],
      links: [],
      escalateToStrategic: false,
      escalateReason: 'none',
    });

    const allowed = {
      digests: new Set(['digestabcdefgh']),
      sealIds: new Set(['sha256-abcdef0123456789']),
    };
    expect(assertBatchEvidenceGrounded(batch, allowed)).not.toBeNull();
  });

  it('rejects uncited drafts', () => {
    const batch = ConceptBatch.parse({
      concepts: [
        {
          title: 'orphan',
          body: 'No citation.',
          tags: [],
          sourceRef: null,
        },
      ],
      links: [],
    });
    const allowed = allowedRefsFromEvidence([]);
    expect(assertBatchEvidenceGrounded(batch, allowed)).toBeNull();
  });
});
