import { describe, expect, it } from 'vitest';
import { MarketHubRefreshResponse, MarketHubResponse } from './market-hub';

describe('MarketHubResponse', () => {
  it('parses a ready hub with empty collections', () => {
    const parsed = MarketHubResponse.parse({
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
    expect(parsed.watchlists).toEqual([]);
  });

  it('parses movers ready + position cents as strings', () => {
    const parsed = MarketHubResponse.parse({
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
      watchlists: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          moduleId: '33333333-3333-3333-3333-333333333333',
          moduleName: 'Trend desk',
          moduleType: 'trend',
          symbol: 'AAPL',
          bias: 'long',
          note: '',
          sourceClass: 'operator',
          status: 'watching',
          updatedAt: '2026-07-18T10:00:00.000Z',
        },
      ],
      trendCandidates: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          moduleId: '33333333-3333-3333-3333-333333333333',
          symbol: 'AAPL',
          direction: 'up',
          strengthBand: 'moderate',
          status: 'candidate',
          tradingModuleId: null,
          engineInstanceId: null,
          scannedAt: '2026-07-18T10:30:00.000Z',
          createdAt: '2026-07-18T10:30:00.000Z',
        },
      ],
      positions: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          symbol: 'AAPL',
          qty: '10',
          avgCostCents: 15000,
          markCents: '15100',
          unrealizedPnlCents: '1000',
          updatedAt: '2026-07-18T10:45:00.000Z',
        },
      ],
      pipeline: [
        {
          symbol: 'AAPL',
          lead: {
            id: '66666666-6666-6666-6666-666666666666',
            symbol: 'AAPL',
            status: 'admitted',
            direction: 'up',
            strategyFamily: 'momentum',
            createdAt: '2026-07-18T10:40:00.000Z',
          },
          tree: {
            id: '77777777-7777-7777-7777-777777777777',
            leadId: '66666666-6666-6666-6666-666666666666',
            symbol: 'AAPL',
            status: 'draft',
            recoveryLadder: ['defer', 'cancel', 'escalate'],
            createdAt: '2026-07-18T10:41:00.000Z',
          },
        },
      ],
      freshness: {
        moversExpiresAt: '2026-07-19T11:00:00.000Z',
        fetchedAt: '2026-07-18T12:00:00.000Z',
      },
    });
    expect(parsed.movers.items[0]?.symbolOrSector).toBe('SPY');
    expect(parsed.pipeline[0]?.tree?.recoveryLadder).toEqual(['defer', 'cancel', 'escalate']);
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
