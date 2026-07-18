import type { ConceptBatch, EvidencePackage } from '@hftr/contracts';

/**
 * Every concept draft must cite evidence:{digest} or seal:{sealId}.
 * Returns grounded batch or null when any draft is uncited.
 */
export function assertBatchEvidenceGrounded(
  batch: ConceptBatch,
  allowed: { digests: ReadonlySet<string>; sealIds: ReadonlySet<string> },
): ConceptBatch | null {
  for (const draft of batch.concepts) {
    const ref = draft.sourceRef?.trim() ?? '';
    if (ref.startsWith('evidence:')) {
      const digest = ref.slice('evidence:'.length);
      if (!allowed.digests.has(digest)) return null;
      continue;
    }
    if (ref.startsWith('seal:')) {
      const sealId = ref.slice('seal:'.length);
      if (!allowed.sealIds.has(sealId)) return null;
      continue;
    }
    // Allow externalRef-style digests that match evidence: prefix via digest alone
    if (ref.length >= 8 && allowed.digests.has(ref)) continue;
    return null;
  }
  return batch;
}

export function allowedRefsFromEvidence(
  evidencePackages: EvidencePackage[],
  sealIds: string[] = [],
): { digests: Set<string>; sealIds: Set<string> } {
  return {
    digests: new Set(evidencePackages.map((pkg) => pkg.digest)),
    sealIds: new Set(sealIds),
  };
}
