import { describe, expect, it } from 'vitest';
import { SYSTEM_DOC_SHAPE_SPECS } from '@hftr/contracts';
import { validateDocumentShape } from './document-shape';

describe('validateDocumentShape', () => {
  it('passes a shaped movers report with wikilinks and tags', () => {
    const spec = SYSTEM_DOC_SHAPE_SPECS.movers_report;
    const result = validateDocumentShape({
      kind: 'movers_report',
      body: [
        '# Daily movers report',
        '',
        '## Scan window',
        'Session leadership scan.',
        '',
        '## Leadership notes',
        'See [[relative_strength_leaders]] for context.',
        '',
        '## Related lenses',
        'Also [[volume_expansion_watch]].',
      ].join('\n'),
      tags: spec.requiredTags,
      sourceRef: 'system:movers/daily_movers_report',
    });
    expect(result.ok).toBe(true);
    expect(result.failedChecks).toEqual([]);
  });

  it('fails when required sections or wikilinks are missing', () => {
    const result = validateDocumentShape({
      kind: 'sector_bulletin',
      body: '# Sector bulletin\n\n## Sector focus\nEnergy themes.',
      tags: ['system_curated', 'sector_news'],
      sourceRef: 'system:sector_news/bulletin',
    });
    expect(result.ok).toBe(false);
    expect(result.failedChecks.length).toBeGreaterThan(0);
    expect(result.repairHints.length).toBeGreaterThan(0);
  });

  it('fails leak lint on digit-heavy bodies', () => {
    const result = validateDocumentShape({
      kind: 'execution_log',
      body: [
        '# Execution log',
        '',
        '## Session',
        'Traded 50000 shares.',
        '',
        '## Actions',
        'None',
        '',
        '## Outcomes',
        'Flat',
      ].join('\n'),
      tags: ['system_curated', 'execution_logs'],
      sourceRef: 'system:execution_logs/session',
    });
    expect(result.ok).toBe(false);
    expect(result.failedChecks).toContain('leak_lint');
  });

  it('requires sourceRef prefix', () => {
    const result = validateDocumentShape({
      kind: 'movers_lens',
      body: '# Lens title\n\nQualitative prose only.',
      tags: ['system_curated', 'movers'],
      sourceRef: 'invalid/ref',
    });
    expect(result.ok).toBe(false);
    expect(result.failedChecks).toContain('source_ref_prefix');
  });
});
