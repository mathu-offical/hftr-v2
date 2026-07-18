import type { AdmissionMode, CurationStatus } from '@hftr/contracts';

/** Map module admission mode to library curation status. */
export function resolveAdmissionStatus(admissionMode: AdmissionMode): 'auto_admitted' | 'proposed' {
  switch (admissionMode) {
    case 'auto_admit_validated':
      return 'auto_admitted';
    case 'require_operator_approval':
      return 'proposed';
    default: {
      const _exhaustive: never = admissionMode;
      throw new Error(`unknown_admission_mode:${String(_exhaustive)}`);
    }
  }
}

export function admissionStatusToCuration(
  admissionStatus: 'auto_admitted' | 'proposed',
): CurationStatus {
  return admissionStatus;
}
