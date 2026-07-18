import { describe, expect, it } from 'vitest';
import { MarketHubResponse } from '@hftr/contracts';
import {
  directionGlyph,
  equityStatusLabel,
  heldSparkStroke,
  moversAreStale,
  pnlToneClass,
  relevanceTickFill,
  reportKindLabel,
  strengthTicksDisplay,
} from './market-posture-format';

describe('market-posture-format', () => {
  it('labels report kinds exhaustively', () => {
    expect(reportKindLabel('movers_report')).toBe('Movers');
    expect(reportKindLabel('sector_bulletin')).toBe('Sector');
    expect(reportKindLabel('daily_summary')).toBe('Daily');
    expect(reportKindLabel('posture_narrative')).toBe('Narrative');
    expect(reportKindLabel('other')).toBe('Report');
  });

  it('detects stale movers', () => {
    expect(moversAreStale({ status: 'missing', expiresAt: null })).toBe(true);
    expect(moversAreStale({ status: 'expired', expiresAt: null })).toBe(true);
    expect(
      moversAreStale({
        status: 'ready',
        expiresAt: '2099-01-01T00:00:00.000Z',
        nowMs: Date.parse('2026-07-18T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      moversAreStale({
        status: 'ready',
        expiresAt: '2020-01-01T00:00:00.000Z',
        nowMs: Date.parse('2026-07-18T00:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('labels equity status', () => {
    expect(equityStatusLabel('fresh')).toBe('Fresh');
    expect(equityStatusLabel('stale')).toBe('Stale');
    expect(equityStatusLabel('unavailable')).toBe('Unavailable');
  });

  it('encodes direction and strength without relying on color alone (D-109)', () => {
    expect(directionGlyph('up')).toBe('▲');
    expect(directionGlyph('down')).toBe('▼');
    expect(directionGlyph('flat')).toBe('—');
    expect(strengthTicksDisplay(3)).toBe('●●●');
    expect(strengthTicksDisplay(1)).toBe('●○○');
    expect(heldSparkStroke('up')).toContain('ok');
    expect(heldSparkStroke(null)).toContain('ink');
    expect(relevanceTickFill('high')).toContain('relevance-high');
    expect(pnlToneClass('down')).toContain('block');
    expect(pnlToneClass(null)).toContain('ink-faint');
  });
});

describe('MarketHubResponse report expiry (D-101)', () => {
  it('accepts reports with expiresAt', () => {
    const body = MarketHubResponse.parse({
      sectorFocuses: [],
      equity: {
        status: 'fresh',
        equityCents: '10000',
        asOfIso: '2026-07-18T12:00:00.000Z',
        version: 1,
        series: [
          {
            t: '2026-07-18T12:00:00.000Z',
            equityCents: '10000',
            positionMarkCents: null,
          },
        ],
      },
      movers: {
        status: 'missing',
        title: null,
        sealId: null,
        corroborationBand: null,
        items: [],
        verifiedAt: null,
        expiresAt: null,
        reportConceptId: null,
      },
      reports: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Sector bulletin',
          kind: 'sector_bulletin',
          expiresAt: '2026-07-19T12:00:00.000Z',
        },
      ],
      watchlists: [],
      trendCandidates: [],
      positions: [],
      pipeline: [],
      freshness: {
        moversExpiresAt: null,
        fetchedAt: '2026-07-18T12:00:00.000Z',
      },
      sources: {
        lanes: [
          {
            kind: 'sec_edgar',
            domain: 'filings',
            label: 'sec edgar',
            authMode: 'none',
            status: 'ready',
            contributed: true,
          },
        ],
        contributedKinds: ['sec_edgar'],
        markFeedClass: 'synthetic',
        scannedAt: '2026-07-18T12:00:00.000Z',
      },
    });
    expect(body.reports[0]?.expiresAt).toBe('2026-07-19T12:00:00.000Z');
    expect(body.sources.contributedKinds).toEqual(['sec_edgar']);
  });
});
