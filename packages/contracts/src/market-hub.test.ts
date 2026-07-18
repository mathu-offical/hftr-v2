import { describe, expect, it } from 'vitest';
import { MarketHubRefreshResponse, MarketHubResponse } from './market-hub';

describe('MarketHubResponse', () => {
  it('parses a ready hub with empty collections', () => {
    const parsed = MarketHubResponse.parse({
      sectorFocuses: ['Technology'],
      equity: {
        status: 'unavailable',
        equityCents: null,
        asOfIso: null,
        version: 0,
        series: [],
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
      reports: [],
      watchlists: [],
      trendCandidates: [],
      positions: [],
      pipeline: [],
      freshness: {
        moversExpiresAt: null,
        fetchedAt: '2026-07-18T12:00:00.000Z',
      },
    });
    expect(parsed.movers.status).toBe('missing');
    expect(parsed.sectorFocuses).toEqual(['Technology']);
  });

  it('parses position with engine chips + equity series', () => {
    const parsed = MarketHubResponse.parse({
      sectorFocuses: [],
      equity: {
        status: 'fresh',
        equityCents: '1000000',
        asOfIso: '2026-07-18T12:00:00.000Z',
        version: 1,
        series: [
          {
            t: '2026-07-18T11:00:00.000Z',
            equityCents: '990000',
            positionMarkCents: null,
          },
        ],
      },
      movers: {
        status: 'ready',
        title: 'Daily movers board',
        sealId: 'seal-abc12345',
        corroborationBand: 'medium',
        items: [
          {
            symbolOrSector: 'SPY',
            directionBand: 'high',
            strengthBand: 'high',
            headline: 'Relative strength leadership cluster',
          },
        ],
        verifiedAt: '2026-07-18T11:00:00.000Z',
        expiresAt: '2026-07-19T11:00:00.000Z',
        reportConceptId: '11111111-1111-1111-1111-111111111111',
      },
      reports: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Daily movers report',
          kind: 'movers_report',
        },
      ],
      watchlists: [],
      trendCandidates: [],
      positions: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          moduleId: '33333333-3333-3333-3333-333333333333',
          moduleName: 'Day desk',
          moduleType: 'trading',
          symbol: 'AAPL',
          qty: '10',
          avgCostCents: 15000,
          markCents: '15100',
          unrealizedPnlCents: '1000',
          engines: [{ id: '88888888-8888-8888-8888-888888888888', label: 'Day trading engine' }],
          updatedAt: '2026-07-18T10:45:00.000Z',
        },
      ],
      pipeline: [],
      freshness: {
        moversExpiresAt: '2026-07-19T11:00:00.000Z',
        fetchedAt: '2026-07-18T12:00:00.000Z',
      },
    });
    expect(parsed.positions[0]?.engines[0]?.label).toBe('Day trading engine');
    expect(parsed.equity.series).toHaveLength(1);
  });
});

describe('MarketHubRefreshResponse', () => {
  it('parses enqueue ack', () => {
    expect(
      MarketHubRefreshResponse.parse({
        enqueued: true,
        kind: 'library.system_movers',
      }),
    ).toEqual({ enqueued: true, kind: 'library.system_movers' });
  });
});
