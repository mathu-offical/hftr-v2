import { describe, expect, it } from 'vitest';
import type { MarketHubLiveResponse, MarketHubResponse } from '@hftr/contracts';
import { mergeMarketHubLive } from './market-hub-live-merge';

function baseHub(): MarketHubResponse {
  return {
    sectorFocuses: ['technology'],
    universeExcludes: [],
    equity: {
      status: 'stale',
      equityCents: '100',
      asOfIso: '2026-07-18T12:00:00.000Z',
      version: 1,
      series: [],
      sourceChips: [{ id: 'ledger', label: 'ledger', class: 'system' }],
    },
    movers: {
      status: 'ready',
      title: 'Movers',
      sealId: 'seal-1',
      corroborationBand: 'medium',
      items: [{ symbolOrSector: 'AAPL', strengthBand: 'high' }],
      itemViz: [],
      verifiedAt: '2026-07-18T12:00:00.000Z',
      expiresAt: '2026-07-19T12:00:00.000Z',
      reportConceptId: null,
      sourceChips: [
        { id: 'alpaca_bars', label: 'alpaca bars', class: 'api' },
        { id: 'library', label: 'library', class: 'library' },
      ],
    },
    reports: [],
    watchlists: [],
    trendCandidates: [],
    positions: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        moduleId: '22222222-2222-4222-8222-222222222222',
        moduleName: 'Desk',
        symbol: 'AAPL',
        qty: '2',
        avgCostCents: 10000,
        markCents: 10000,
        unrealizedPnlCents: '0',
        engines: [],
        updatedAt: '2026-07-18T12:00:00.000Z',
        sourceChips: [
          { id: 'synthetic_sim', label: 'synthetic mark', class: 'system' },
          { id: 'ledger', label: 'ledger', class: 'system' },
        ],
        viz: {
          symbol: 'AAPL',
          spark: {
            points: [{ t: '2026-07-18T12:00:00.000Z', valueCents: '10000' }],
            feedClass: 'synthetic_sim',
          },
          direction: 'flat',
          strengthBand: 'medium',
          strengthTicks: 2,
          relevanceBand: 'medium',
          heldVsCost: 'flat',
          markCents: 10000,
          avgCostCents: 10000,
          unrealizedPnlCents: '0',
        },
      },
    ],
    pipeline: [],
    capitalSources: [],
    news: {
      status: 'missing',
      title: null,
      sealId: null,
      corroborationBand: null,
      items: [],
      verifiedAt: null,
      expiresAt: null,
      reportConceptId: null,
      sourceChips: [],
    },
    freshness: {
      moversExpiresAt: '2026-07-19T12:00:00.000Z',
      fetchedAt: '2026-07-18T12:00:00.000Z',
    },
    sources: {
      lanes: [],
      contributedKinds: [],
      markFeedClass: 'synthetic',
      scannedAt: null,
    },
    charts: {
      allocation: [{ id: 'AAPL', label: 'AAPL', shareBps: 10_000, valueLabel: '1' }],
      watchlistTiers: [],
      trendStrength: [],
      moverDirections: [],
      sourceReady: [],
    },
  };
}

describe('mergeMarketHubLive', () => {
  it('updates equity and marks without replacing static movers/charts', () => {
    const hub = baseHub();
    const live: MarketHubLiveResponse = {
      fetchedAt: '2026-07-18T12:01:00.000Z',
      equity: {
        status: 'fresh',
        equityCents: '200',
        asOfIso: '2026-07-18T12:01:00.000Z',
        version: 2,
        series: [{ t: '2026-07-18T12:01:00.000Z', equityCents: '200', positionMarkCents: null }],
        sourceChips: [{ id: 'ledger', label: 'ledger', class: 'system' }],
      },
      positions: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          symbol: 'AAPL',
          qty: '2',
          avgCostCents: 10000,
          markCents: 11000,
          unrealizedPnlCents: '2000',
          viz: {
            symbol: 'AAPL',
            spark: {
              points: [{ t: '2026-07-18T12:01:00.000Z', valueCents: '11000' }],
              feedClass: 'synthetic_sim',
            },
            direction: 'up',
            strengthBand: 'medium',
            strengthTicks: 2,
            relevanceBand: 'medium',
            heldVsCost: 'up',
            markCents: 11000,
            avgCostCents: 10000,
            unrealizedPnlCents: '2000',
          },
        },
      ],
    };

    const next = mergeMarketHubLive(hub, live);
    expect(next.equity.equityCents).toBe('200');
    expect(next.equity.sourceChips).toEqual([
      { id: 'ledger', label: 'ledger', class: 'system' },
    ]);
    expect(next.positions[0]?.markCents).toBe(11000);
    expect(next.positions[0]?.moduleName).toBe('Desk');
    expect(next.positions[0]?.sourceChips).toHaveLength(2);
    expect(next.movers.title).toBe('Movers');
    expect(next.movers.sourceChips).toHaveLength(2);
    expect(next.charts.allocation).toHaveLength(1);
    expect(next.freshness.fetchedAt).toBe('2026-07-18T12:01:00.000Z');
    expect(next.freshness.moversExpiresAt).toBe('2026-07-19T12:00:00.000Z');
  });

  it('patches modelHydration panel surfaces without bumping asOfIso (D-161)', () => {
    const hub = baseHub();
    hub.modelHydration = {
      liveSources: [],
      librarySources: [],
      capitalSources: [],
      processingFlows: [],
      processSteps: [],
      stageOps: [
        { stageId: 'narrative', operation: 'book↔tape', amount: '1 held' },
        { stageId: 'hub_ready', operation: 'project hub', amount: 'src' },
      ],
      totals: {
        liveReady: 0,
        liveTotal: 0,
        libraryCount: 0,
        admittedConcepts: 0,
        contributedKinds: 0,
        usedLiveMarks: 0,
        syntheticMarks: 0,
      },
      asOfIso: '2026-07-18T12:00:00.000Z',
      livePatchedAt: null,
      sealStamps: {
        moversVerifiedAt: null,
        moversExpiresAt: null,
        newsVerifiedAt: null,
        newsExpiresAt: null,
        dailyExpiresAt: null,
      },
      panelSurfaces: [
        {
          id: 'equity',
          label: 'Day equity',
          panel: 'overlay',
          status: 'stale',
          operation: 'live book',
          amount: 'stale · book',
          sourceStageId: 'hub_ready',
          emitFromStages: [],
          emitFromFunctions: [],
          updatedAt: '2026-07-18T12:00:00.000Z',
          capitalBearing: true,
        },
        {
          id: 'positions',
          label: 'Open positions',
          panel: 'rail',
          status: 'ready',
          operation: 'rail inventory',
          amount: '1 open',
          sourceStageId: 'narrative',
          emitFromStages: [],
          emitFromFunctions: [],
          updatedAt: '2026-07-18T12:00:00.000Z',
          capitalBearing: true,
        },
      ],
    };
    const live: MarketHubLiveResponse = {
      fetchedAt: '2026-07-18T12:01:00.000Z',
      equity: {
        status: 'fresh',
        equityCents: '200',
        asOfIso: '2026-07-18T12:01:00.000Z',
        version: 2,
        series: [],
        sourceChips: [],
      },
      positions: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          symbol: 'AAPL',
          qty: '2',
          avgCostCents: 10000,
          markCents: 11000,
          unrealizedPnlCents: '2000',
          viz: {
            symbol: 'AAPL',
            spark: {
              points: [{ t: '2026-07-18T12:01:00.000Z', valueCents: '11000' }],
              feedClass: 'synthetic_sim',
            },
            direction: 'up',
            strengthBand: 'medium',
            strengthTicks: 2,
            relevanceBand: 'medium',
            heldVsCost: 'up',
            markCents: 11000,
            avgCostCents: 10000,
            unrealizedPnlCents: '2000',
          },
        },
      ],
    };
    const next = mergeMarketHubLive(hub, live);
    expect(next.modelHydration?.asOfIso).toBe('2026-07-18T12:00:00.000Z');
    expect(next.modelHydration?.livePatchedAt).toBe('2026-07-18T12:01:00.000Z');
    expect(next.modelHydration?.panelSurfaces.find((s) => s.id === 'equity')?.status).toBe(
      'fresh',
    );
    expect(next.modelHydration?.panelSurfaces.find((s) => s.id === 'equity')?.amount).toBe(
      '$2.00 · fresh',
    );
  });
});
