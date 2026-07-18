import { describe, expect, it } from 'vitest';
import { auditLlmCallArtifacts, buildCompanyLeakAuditReport } from './leak-audit';

describe('auditLlmCallArtifacts', () => {
  it('passes ref-only artifact payloads', () => {
    const result = auditLlmCallArtifacts([
      {
        id: 'artifact-1',
        content: { rationale: 'momentum thesis', quantityRef: 'nv_abc123' },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('flags artifacts with numeric leaks', () => {
    const result = auditLlmCallArtifacts([
      {
        id: 'clean',
        content: { note: 'use nv_handle only', ref: 'nv_ok' },
      },
      {
        id: 'dirty',
        content: { sizing: 'allocate 500 shares' },
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.id).toBe('dirty');
    expect(result.failures[0]?.reasons.length).toBeGreaterThan(0);
    expect(result.failures[0]?.reasons[0]?.reason).toBe('numeric');
  });

  it('respects whitelist paths across artifacts', () => {
    const result = auditLlmCallArtifacts(
      [{ id: 'a1', content: { display: { title: 'Q2 2026 outlook' }, thesis: 'momentum' } }],
      ['$.display'],
    );
    expect(result.ok).toBe(true);
  });
});

describe('buildCompanyLeakAuditReport', () => {
  it('aggregates metadata-only when no artifacts are stored', () => {
    const report = buildCompanyLeakAuditReport(
      [
        { id: 'c1', schemaValid: true, leakLintPassed: true, failure: null },
        { id: 'c2', schemaValid: true, leakLintPassed: false, failure: null },
      ],
      [],
      '2026-07-17T00:00:00.000Z',
    );
    expect(report.scanMode).toBe('metadata');
    expect(report.ok).toBe(false);
    expect(report.sampleSize).toBe(2);
    expect(report.leakCleanCount).toBe(1);
    expect(report.leakFailCount).toBe(1);
    expect(report.failures).toEqual([{ id: 'c2' }]);
    expect(report.note).toContain('llm_artifacts');
  });

  it('re-scans stored artifact payloads when present', () => {
    const report = buildCompanyLeakAuditReport(
      [{ id: 'c1', schemaValid: true, leakLintPassed: true, failure: null }],
      [{ llmCallId: 'c1', output: { sizing: 'allocate 500 shares' } }],
      '2026-07-17T00:00:00.000Z',
    );
    expect(report.scanMode).toBe('artifacts');
    expect(report.ok).toBe(false);
    expect(report.leakFailCount).toBe(1);
    expect(report.failures[0]?.reasons?.[0]?.reason).toBe('numeric');
  });
});
