import { describe, expect, it } from 'vitest';
import { admissionStatusToCuration, resolveAdmissionStatus } from './admission';

describe('resolveAdmissionStatus', () => {
  it('maps auto_admit_validated to auto_admitted', () => {
    expect(resolveAdmissionStatus('auto_admit_validated')).toBe('auto_admitted');
  });

  it('maps require_operator_approval to proposed', () => {
    expect(resolveAdmissionStatus('require_operator_approval')).toBe('proposed');
  });

  it('returns curation status compatible with library join', () => {
    expect(admissionStatusToCuration('auto_admitted')).toBe('auto_admitted');
    expect(admissionStatusToCuration('proposed')).toBe('proposed');
  });
});
