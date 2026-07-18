import { normalizeToEvidencePackage } from './normalize';
import type { EvidencePackage } from '@hftr/contracts';

export interface OperatorArticleEvidenceInput {
  kind: 'link' | 'text';
  title: string;
  /** Full operator body (may contain digits — stored on concept, redacted in evidence). */
  body: string;
  externalRef?: string | null;
}

/**
 * Build a single OPERATOR_INPUT evidence package for user article submit (D-079).
 * Digits are redacted in title/summary for model-safe bus records; concept body
 * retains operator original via the caller.
 */
export function normalizeOperatorArticleEvidence(
  input: OperatorArticleEvidenceInput,
): EvidencePackage {
  const summary =
    input.body.trim().slice(0, 3900) ||
    (input.kind === 'link'
      ? 'Operator-submitted link reference without additional notes.'
      : 'Operator-submitted research article.');

  return normalizeToEvidencePackage({
    sourceKind: 'operator',
    feedClass: 'operator_input',
    title: input.title.slice(0, 300),
    summary,
    externalRef: input.externalRef ?? null,
    authorityClass: 'OPERATOR_INPUT',
    legalUseClass: 'ALLOWED',
    expiresAt: null,
    artifactRefs: [],
  });
}

/** Derive a display title when the operator omits one. */
export function deriveOperatorArticleTitle(opts: {
  kind: 'link' | 'text';
  content: string;
  title?: string;
}): string {
  if (opts.title?.trim()) return opts.title.trim().slice(0, 200);
  if (opts.kind === 'link') {
    try {
      const host = new URL(opts.content.trim()).hostname.replace(/^www\./, '');
      return `Operator link: ${host}`.slice(0, 200);
    } catch {
      return 'Operator link';
    }
  }
  const firstLine = opts.content
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  return (firstLine ?? 'Operator article').slice(0, 200);
}
