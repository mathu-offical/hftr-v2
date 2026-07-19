import { describe, expect, it } from 'vitest';
import {
  buildAwarenessLinks,
  linkBandsForSymbol,
  linkCoverageBandForKinds,
  rollupEvidenceRows,
  tickerStrengthInText,
} from './movers-awareness-links';

const UNIVERSE = ['SPY', 'NVDA', 'AMD', 'AAPL'] as const;
const AS_OF = '2026-07-19T12:00:00.000Z';

describe('movers-awareness-links', () => {
  it('builds news and library links with strength bands', () => {
    const { links, evidenceRows, trendRows } = buildAwarenessLinks({
      asOfIso: AS_OF,
      universe: [...UNIVERSE],
      newsPkgs: [
        {
          digest: 'digest-news-1',
          title: 'Semiconductor leadership',
          summary: '$NVDA extended gains while AMD followed on volume.',
          sourceKind: 'news',
        },
      ],
      macroPkgs: [],
      libraryTitles: ['Relative strength in NVDA'],
      trends: [{ id: 'trend-1', symbol: 'NVDA', status: 'active' }],
    });

    expect(links.some((l) => l.id === 'news:digest-news-1:NVDA' && l.strengthBand === 'high')).toBe(
      true,
    );
    expect(links.some((l) => l.id === 'news:digest-news-1:AMD' && l.strengthBand === 'medium')).toBe(
      true,
    );
    expect(
      links.some((l) => l.fromKind === 'library_concept' && l.toId === 'NVDA'),
    ).toBe(true);
    expect(links.some((l) => l.id === 'trend:trend-1:NVDA' && l.strengthBand === 'high')).toBe(
      true,
    );
    expect(links.length).toBeLessThanOrEqual(128);
    expect(evidenceRows.length).toBeGreaterThan(0);
    expect(trendRows.find((t) => t.id === 'trend-1')?.linkStrengthBand).toBe('high');
  });

  it('derives per-symbol link bands and coverage', () => {
    const { links } = buildAwarenessLinks({
      asOfIso: AS_OF,
      universe: [...UNIVERSE],
      newsPkgs: [
        {
          digest: 'n1',
          title: 'Tape',
          summary: '$NVDA leads',
          sourceKind: 'news',
        },
      ],
      macroPkgs: [
        {
          digest: 'm1',
          title: 'Macro',
          summary: 'Risk-on lifts NVDA',
          sourceKind: 'macro',
        },
      ],
      libraryTitles: ['NVDA leadership lens'],
      trends: [{ id: 't1', symbol: 'NVDA', status: 'watch' }],
    });

    const bands = linkBandsForSymbol(links, 'NVDA');
    expect(bands.newsLinkBand).toBe('high');
    expect(bands.libraryLinkBand).toBe('medium');
    expect(bands.trendLinkBand).toBe('high');
    expect(bands.linkCoverageBand).toBe('high');
    expect(linkCoverageBandForKinds(['news', 'macro', 'library_concept', 'trend'])).toBe('high');
    expect(linkCoverageBandForKinds(['news'])).toBe('low');
    expect(linkCoverageBandForKinds(['news', 'macro'])).toBe('medium');
  });

  it('caps links and rolls up evidence by source', () => {
    const newsPkgs = Array.from({ length: 200 }, (_, i) => ({
      digest: `digest-${i}`,
      title: `Headline ${i}`,
      summary: `$NVDA move ${i}`,
      sourceKind: 'news',
    }));
    const { links } = buildAwarenessLinks({
      asOfIso: AS_OF,
      universe: ['NVDA'],
      newsPkgs,
      macroPkgs: [],
      libraryTitles: [],
      trends: [],
    });
    expect(links.length).toBe(128);

    const evidence = rollupEvidenceRows(links);
    expect(evidence.every((row) => row.linkedSymbolCount >= 1)).toBe(true);
    expect(tickerStrengthInText('NASDAQ:NVDA rips', 'NVDA')).toBe('high');
    expect(tickerStrengthInText('NVDA rips', 'NVDA')).toBe('medium');
  });
});
