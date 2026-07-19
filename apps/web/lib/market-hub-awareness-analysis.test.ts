import { describe, expect, it } from 'vitest';
import type { MarketAwarenessLink, VerifiedNormalizedBundle } from '@hftr/contracts';
import { projectMarketHubAwarenessAnalysis } from './market-hub-awareness-analysis';

const asOf = '2026-07-19T06:00:00.000Z';

function link(partial: Partial<MarketAwarenessLink> & Pick<MarketAwarenessLink, 'id' | 'fromKind' | 'toId'>): MarketAwarenessLink {
  return {
    fromId: partial.fromId ?? 'src1',
    fromLabel: partial.fromLabel ?? 'Sample evidence',
    toKind: partial.toKind ?? 'symbol',
    strengthBand: partial.strengthBand ?? 'medium',
    asOfIso: asOf,
    ...partial,
  };
}

describe('projectMarketHubAwarenessAnalysis (D-175)', () => {
  it('rolls seal links into four Posture levels', () => {
    const seal = {
      sealId: 'seal-test-awareness-01',
      view: {
        kind: 'movers_board',
        subjectKey: 'daily',
        title: 'Daily movers board',
        items: [],
        sourceDigests: [],
        metricRefs: [],
      },
      corroborationBand: 'medium',
      sourceDigests: ['abcdefgh'],
      verifiedAt: asOf,
      expiresAt: '2026-07-20T06:00:00.000Z',
      gatesSnapshot: [],
      awarenessLinks: [
        link({
          id: 'news:abc:NVDA',
          fromKind: 'news',
          fromId: 'abc',
          fromLabel: 'Chip rally',
          toId: 'NVDA',
          strengthBand: 'high',
        }),
        link({
          id: 'trend:t1:NVDA',
          fromKind: 'trend',
          fromId: 't1',
          fromLabel: 'NVDA trend',
          toId: 'NVDA',
          strengthBand: 'high',
        }),
        link({
          id: 'rec:movers:NVDA',
          fromKind: 'news',
          fromId: 'abc',
          fromLabel: 'Chip rally',
          toKind: 'recommendation',
          toId: 'movers:NVDA',
          strengthBand: 'medium',
        }),
      ],
    } as VerifiedNormalizedBundle;

    const analysis = projectMarketHubAwarenessAnalysis({
      seal,
      watchlists: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          moduleId: '00000000-0000-4000-8000-000000000002',
          moduleName: 'Trading',
          symbol: 'NVDA',
          bias: 'long',
          note: 'from movers',
          sourceClass: 'movers_rank',
          status: 'suggested_verified',
          updatedAt: asOf,
          engines: [],
          sourceChips: [],
        },
      ],
      trendCandidates: [
        {
          id: '00000000-0000-4000-8000-000000000003',
          moduleId: '00000000-0000-4000-8000-000000000002',
          symbol: 'NVDA',
          direction: 'up',
          strengthBand: 'strong',
          status: 'active',
          engines: [],
          scannedAt: asOf,
          createdAt: asOf,
        },
      ],
    });

    expect(analysis).toBeDefined();
    expect(analysis!.evidence.length).toBeGreaterThan(0);
    expect(analysis!.links.length).toBe(3);
    expect(analysis!.trends.some((t) => t.symbol === 'NVDA')).toBe(true);
    expect(analysis!.recommendations.some((r) => r.symbol === 'NVDA')).toBe(true);
    expect(analysis!.coverageSummary).toContain('links');
  });
});
