import { createHash } from 'node:crypto';
import { EvidencePackage, type ResearchSourceKind } from '@hftr/contracts';

/** Replace digit runs so evidence text is safe for model-facing paths. */
export function redactDigitHeavyText(text: string): string {
  return text.replace(/\d+/g, '[n]');
}

/** Stable sha256 hex digest from ordered parts (max 128 chars). */
export function digestEvidence(parts: string[]): string {
  const joined = parts.join('\x1e');
  return createHash('sha256').update(joined, 'utf8').digest('hex').slice(0, 128);
}

export interface NormalizeEvidenceInput {
  sourceKind: ResearchSourceKind;
  feedClass: string;
  title: string;
  summary: string;
  externalRef?: string | null;
  artifactRefs?: string[];
  legalUseClass?: 'ALLOWED' | 'RESTRICTED' | 'REVIEW_REQUIRED';
  expiresAt?: string | null;
  authorityClass?:
    | 'DETERMINISTIC'
    | 'PROVIDER_ANALYZED'
    | 'CURATED_BACKGROUND'
    | 'TRAINING_DERIVED'
    | 'OPERATOR_INPUT';
}

/**
 * Redact qualitative fields, compute digest, and validate against EvidencePackage schema.
 */
export function normalizeToEvidencePackage(input: NormalizeEvidenceInput): EvidencePackage {
  const title = redactDigitHeavyText(input.title.trim());
  const summary = redactDigitHeavyText(input.summary.trim());
  const externalRef = input.externalRef ?? null;

  const digest = digestEvidence([
    input.sourceKind,
    title,
    summary,
    externalRef ?? '',
  ]);

  return EvidencePackage.parse({
    sourceKind: input.sourceKind,
    feedClass: input.feedClass,
    title,
    summary,
    digest,
    externalRef,
    artifactRefs: input.artifactRefs ?? [],
    legalUseClass: input.legalUseClass,
    expiresAt: input.expiresAt ?? null,
    authorityClass: input.authorityClass,
  });
}
