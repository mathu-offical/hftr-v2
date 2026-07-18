import { describe, expect, it } from 'vitest';
import { SYSTEM_DOC_SHAPE_SPECS } from '@hftr/contracts';
import { scoreDocumentCuration } from './curation-score';

describe('scoreDocumentCuration', () => {
  const nowMs = Date.parse('2026-07-18T12:00:00.000Z');

  it('scores high when structure, links, and freshness are strong', () => {
    const spec = SYSTEM_DOC_SHAPE_SPECS.daily_summary;
    const score = scoreDocumentCuration({
      kind: 'daily_summary',
      body: [
        '# Market day summary',
        '',
        '## Pre-open',
        'Overnight tone.',
        '',
        '## Midday',
        'Leadership steady.',
        '',
        '## Close',
        'Participation broad.',
        '',
        '## Post-analysis',
        'Link [[sector_rotation_signal]].',
      ].join('\n'),
      tags: spec.requiredTags,
      sourceRef: 'system:daily_summaries/market_day_summary',
      updatedAt: new Date(nowMs - 60_000),
      nowMs,
    });
    expect(score.structureBand).toBe('high');
    expect(score.linkBand).not.toBe('low');
    expect(score.freshnessBand).toBe('high');
    expect(score.overallBand).not.toBe('low');
  });

  it('lowers freshness when document exceeds kind TTL', () => {
    const spec = SYSTEM_DOC_SHAPE_SPECS.runtime_policy;
    const score = scoreDocumentCuration({
      kind: 'runtime_policy',
      body: [
        '# Runtime policy',
        '',
        '## Scope',
        'Paper mode.',
        '',
        '## Constraints',
        'Immutable guardrails.',
        '',
        '## Escalation',
        'Operator review.',
      ].join('\n'),
      tags: spec.requiredTags,
      sourceRef: 'system:runtime_policies/paper_runtime_policy',
      updatedAt: new Date(nowMs - 8 * 24 * 60 * 60 * 1000),
      nowMs,
    });
    expect(score.freshnessBand).toBe('low');
    expect(score.overallBand).toBe('low');
  });
});
