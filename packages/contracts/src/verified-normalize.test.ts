import { describe, expect, it } from 'vitest';
import {
  ResearchDirective,
  EvidenceSummaryForSynth,
  SealSummaryForSynth,
} from './research-artifacts';
import { ResearchArtifactRef, ValidationGateId } from './research-bus';
import {
  ResearchQueryPlan,
  SystemNormalizedView,
  VerifiedNormalizedBundle,
} from './verified-normalize';

describe('verified-normalize (D-072)', () => {
  it('roundtrips VerifiedNormalizedBundle', () => {
    const verifiedAt = '2026-07-18T12:00:00.000Z';
    const expiresAt = '2026-07-19T12:00:00.000Z';

    const bundle = VerifiedNormalizedBundle.parse({
      sealId: 'sha256-abc123digest',
      view: {
        kind: 'movers_board',
        subjectKey: 'semiconductors',
        title: 'Movers board — semiconductors',
        items: [
          {
            symbolOrSector: 'SOXX',
            directionBand: 'high',
            strengthBand: 'medium',
            headline: 'Leadership rotation into equipment names',
          },
        ],
        sourceDigests: ['digest-alpha', 'digest-beta'],
        metricRefs: ['value_ref:nv_momentum_band'],
      },
      corroborationBand: 'medium',
      sourceDigests: ['digest-alpha', 'digest-beta'],
      verifiedAt,
      expiresAt,
      gatesSnapshot: [
        {
          gateId: 'corroboration',
          passed: true,
          scoreBand: 'medium',
          reason: 'two independent domains',
        },
        {
          gateId: 'sector_scope',
          passed: true,
          scoreBand: 'high',
          reason: 'topic overlap',
        },
      ],
      reportConceptId: '11111111-1111-4111-8111-111111111111',
    });

    expect(bundle.view.kind).toBe('movers_board');
    expect(bundle.gatesSnapshot).toHaveLength(2);
    expect(VerifiedNormalizedBundle.safeParse(bundle).success).toBe(true);
  });

  it('parses SystemNormalizedView with empty defaults', () => {
    const view = SystemNormalizedView.parse({
      kind: 'sector_bulletin',
      subjectKey: 'energy',
      title: 'Sector bulletin — energy',
    });
    expect(view.items).toEqual([]);
    expect(view.metricRefs).toEqual([]);
    expect(view.sourceDigests).toEqual([]);
  });

  it('parses ResearchQueryPlan with partial bySource entries', () => {
    const plan = ResearchQueryPlan.parse({
      topicScope: 'system:sector_news',
      cadence: 'every:1440',
      bySource: {
        gdelt_news: { query: 'energy sector headlines', params: { lang: 'en' } },
        brave_search: { query: 'energy sector market narrative' },
      },
    });
    expect(plan.bySource.gdelt_news?.query).toContain('energy');
    expect(plan.bySource.brave_search?.params).toBeUndefined();
  });
});

describe('research bus extensions (D-070, D-072)', () => {
  it('accepts seal: artifact refs and new validation gates', () => {
    expect(ValidationGateId.options).toContain('sector_scope');
    expect(ValidationGateId.options).toContain('source_credibility');
    expect(ValidationGateId.options).toContain('corroboration');

    expect(ResearchArtifactRef.safeParse('seal:sha256-abc123digest').success).toBe(true);
    expect(ResearchArtifactRef.safeParse('evidence:abc12345digest').success).toBe(true);
    expect(ResearchArtifactRef.safeParse('invalid:ref').success).toBe(false);
  });
});

describe('research-artifacts synthesize grounding', () => {
  it('extends ResearchDirective with evidence and seal summaries', () => {
    const directive = ResearchDirective.parse({
      topicScope: 'system:movers',
      evidenceSummaries: [
        EvidenceSummaryForSynth.parse({
          digest: 'digest-alpha',
          title: 'Supply note',
          summary: 'Qualitative leadership shift without raw figures.',
        }),
      ],
      sealSummaries: [
        SealSummaryForSynth.parse({
          sealId: 'sha256-abc123digest',
          kind: 'movers_board',
          title: 'Movers board seal',
        }),
      ],
    });
    expect(directive.evidenceSummaries).toHaveLength(1);
    expect(directive.sealSummaries[0]?.kind).toBe('movers_board');
  });
});
