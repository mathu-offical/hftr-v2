import { describe, expect, it } from 'vitest';
import { auditLlmCallArtifacts } from './leak-audit';

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
