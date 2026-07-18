import { describe, expect, it } from 'vitest';
import {
  DocumentCurationScore,
  DocumentShapeResult,
  DocumentShapeSpec,
  SYSTEM_DOC_SHAPE_SPECS,
  SYSTEM_DOC_TOPIC_SCOPE,
  SystemDocKind,
  SystemTopicScope,
} from './system-libraries';

describe('system-libraries (D-069)', () => {
  it('exposes all SystemDocKind values with shape specs', () => {
    for (const kind of SystemDocKind.options) {
      const spec = SYSTEM_DOC_SHAPE_SPECS[kind];
      expect(spec.kind).toBe(kind);
      expect(DocumentShapeSpec.safeParse(spec).success).toBe(true);
      expect(spec.requiredTags).toContain('system_curated');
      expect(spec.requiredTags).toContain(spec.kindTag);
    }
  });

  it('maps kinds to canonical system topic scopes', () => {
    expect(SYSTEM_DOC_TOPIC_SCOPE.movers_report).toBe(SystemTopicScope.MOVERS);
    expect(SYSTEM_DOC_TOPIC_SCOPE.sector_bulletin).toBe(SystemTopicScope.SECTOR_NEWS);
    expect(SYSTEM_DOC_TOPIC_SCOPE.execution_log).toBe(SystemTopicScope.EXECUTION_LOGS);
  });

  it('requires wikilinks for report, bulletin, and summary kinds', () => {
    expect(SYSTEM_DOC_SHAPE_SPECS.movers_report.requireWikilink).toBe(true);
    expect(SYSTEM_DOC_SHAPE_SPECS.sector_bulletin.requireWikilink).toBe(true);
    expect(SYSTEM_DOC_SHAPE_SPECS.daily_summary.requireWikilink).toBe(true);
    expect(SYSTEM_DOC_SHAPE_SPECS.movers_lens.requireWikilink).toBe(false);
  });

  it('parses DocumentShapeResult and DocumentCurationScore', () => {
    const shapeResult = DocumentShapeResult.parse({
      ok: false,
      kind: 'sector_bulletin',
      repairHints: ['Add wikilink in Cross-links section'],
      failedChecks: ['wikilink_density'],
    });
    expect(shapeResult.ok).toBe(false);

    const score = DocumentCurationScore.parse({
      structureBand: 'high',
      linkBand: 'medium',
      freshnessBand: 'high',
      overallBand: 'medium',
      repairHints: [],
    });
    expect(score.overallBand).toBe('medium');
  });
});
