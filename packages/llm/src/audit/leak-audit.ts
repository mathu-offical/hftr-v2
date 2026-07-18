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

export interface LeakAuditCallMeta {
  id: string;
  schemaValid: boolean;
  leakLintPassed: boolean;
  failure: string | null;
}

export interface StoredLlmArtifactOutput {
  llmCallId: string;
  output: unknown;
}

export type LeakAuditScanMode = 'artifacts' | 'metadata' | 'mixed';

export interface CompanyLeakAuditReport {
  ok: boolean;
  sampleSize: number;
  leakCleanCount: number;
  leakFailCount: number;
  schemaValidCount: number;
  failures: Array<{ id: string; reasons?: LeakAuditFailureReason[] }>;
  scannedAt: string;
  scanMode: LeakAuditScanMode;
  note?: string;
}

const METADATA_ONLY_NOTE =
  'Full artifact re-scan requires stored output payloads (llm_artifacts); aggregate reflects leakLintPassed/schemaValid columns only.';

/**
 * Company-scoped leak audit: re-scan stored artifact JSON when present, otherwise
 * aggregate from llm_calls metadata columns (G2/G3 ledger evidence).
 */
export function buildCompanyLeakAuditReport(
  calls: readonly LeakAuditCallMeta[],
  artifacts: readonly StoredLlmArtifactOutput[],
  scannedAt = new Date().toISOString(),
): CompanyLeakAuditReport {
  const sampleSize = calls.length;
  const failures: CompanyLeakAuditReport['failures'] = [];
  let leakCleanCount = 0;
  let leakFailCount = 0;
  let schemaValidCount = 0;

  if (artifacts.length === 0) {
    for (const call of calls) {
      if (call.failure) {
        leakFailCount += 1;
        failures.push({ id: call.id });
        continue;
      }
      if (call.schemaValid) schemaValidCount += 1;
      if (call.leakLintPassed) leakCleanCount += 1;
      else {
        leakFailCount += 1;
        failures.push({ id: call.id });
      }
    }

    return {
      ok: sampleSize === 0 || leakFailCount === 0,
      sampleSize,
      leakCleanCount,
      leakFailCount,
      schemaValidCount,
      failures,
      scannedAt,
      scanMode: 'metadata',
      ...(sampleSize > 0 ? { note: METADATA_ONLY_NOTE } : {}),
    };
  }

  const artifactAudit = auditLlmCallArtifacts(
    artifacts.map((a) => ({ id: a.llmCallId, content: a.output })),
  );
  const auditedCallIds = new Set(artifacts.map((a) => a.llmCallId));
  const reasonsByCallId = new Map(
    artifactAudit.failures.map((f) => [f.id, f.reasons] as const),
  );

  for (const call of calls) {
    if (call.failure) {
      leakFailCount += 1;
      failures.push({ id: call.id });
      continue;
    }
    if (call.schemaValid) schemaValidCount += 1;

    if (auditedCallIds.has(call.id)) {
      const reasons = reasonsByCallId.get(call.id);
      if (reasons) {
        leakFailCount += 1;
        failures.push({ id: call.id, reasons });
      } else {
        leakCleanCount += 1;
      }
      continue;
    }

    if (call.leakLintPassed) leakCleanCount += 1;
    else {
      leakFailCount += 1;
      failures.push({ id: call.id });
    }
  }

  const allCallsHaveArtifacts = calls.every((c) => auditedCallIds.has(c.id));
  const scanMode: LeakAuditScanMode = allCallsHaveArtifacts ? 'artifacts' : 'mixed';

  return {
    ok: sampleSize === 0 || leakFailCount === 0,
    sampleSize,
    leakCleanCount,
    leakFailCount,
    schemaValidCount,
    failures,
    scannedAt,
    scanMode,
    ...(scanMode === 'mixed' ? { note: METADATA_ONLY_NOTE } : {}),
  };
}
