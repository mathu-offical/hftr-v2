import { describe, expect, it } from 'vitest';
import {
  humanizePostureToken,
  scopedModuleOperation,
  stageScreenForScopedModuleType,
  subtypeChipForModuleConfig,
} from './market-posture-scoped-modules';

describe('market-posture-scoped-modules (D-223)', () => {
  it('humanizes desk research subtype tokens', () => {
    expect(humanizePostureToken('specialty_desk')).toBe('Specialty Desk');
    expect(subtypeChipForModuleConfig('research', { researchSubtype: 'specialty_desk' })).toBe(
      'Specialty Desk',
    );
    expect(
      subtypeChipForModuleConfig('research', { researchSubtype: 'external_filings' }),
    ).toBe('External Filings');
  });

  it('maps module types onto stage screens', () => {
    expect(stageScreenForScopedModuleType('librarian')).toBe('library');
    expect(stageScreenForScopedModuleType('trend')).toBe('outlook');
    expect(stageScreenForScopedModuleType('trading')).toBe('outlook');
    expect(stageScreenForScopedModuleType('fund_router')).toBe('capital');
    expect(stageScreenForScopedModuleType('analyzer')).toBe('process');
    expect(stageScreenForScopedModuleType('unknown_type')).toBeNull();
  });

  it('returns stable operations per module type', () => {
    expect(scopedModuleOperation('librarian')).toBe('curate evidence');
    expect(scopedModuleOperation('trading')).toBe('desk execution');
  });
});
