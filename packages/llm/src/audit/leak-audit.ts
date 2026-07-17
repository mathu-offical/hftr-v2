import { leakLint } from '@hftr/contracts';

export interface LeakAuditArtifact {
  id: string;
  content: unknown;
}

export interface LeakAuditFailureReason {
  path: string;
  value: string;
  reason: 'numeric' | 'datetime';
}

export interface LeakAuditFailure {
  id: string;
  reasons: LeakAuditFailureReason[];
}

/**
 * Post-run audit: scan stored LLM artifact payloads for numeric/temporal leaks.
 */
export function auditLlmCallArtifacts(
  artifacts: readonly LeakAuditArtifact[],
  whitelistPaths: readonly string[] = [],
): { ok: boolean; failures: LeakAuditFailure[] } {
  const failures: LeakAuditFailure[] = [];
  for (const artifact of artifacts) {
    const lint = leakLint(artifact.content, whitelistPaths);
    if (!lint.ok) {
      failures.push({ id: artifact.id, reasons: lint.leaks });
    }
  }
  return { ok: failures.length === 0, failures };
}
