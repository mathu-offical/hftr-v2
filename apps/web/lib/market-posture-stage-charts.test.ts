import { describe, expect, it } from 'vitest';
import type { MarketHubResponse } from '@hftr/contracts';
import {
  buildCapitalEntityCharts,
  buildCapitalStageCharts,
  buildDayEntityCharts,
  buildDayStageCharts,
  buildLibraryEntityCharts,
  buildLibraryStageCharts,
  buildLiveEntityCharts,
  buildLiveStageCharts,
  buildOutlookEntityCharts,
  buildOutlookStageCharts,
  buildProcessEntityCharts,
  buildProcessStageCharts,
  formatAllocationSlices,
} from './market-posture-stage-charts';

function baseHub(over: Partial<MarketHubResponse> = {}): MarketHubResponse {
  return {
    sectorFocuses: [],
    universeExcludes: [],
    equity: {
      status: 'ready',
      equityCents: '100000',
      asOfIso: '2026-07-19T12:00:00.000Z',
      version: 1,
      series: [{ t: '2026-07-19T11:00:00.000Z', equityCents: '100000' }],
      sourceChips: [],
    },
    movers: {
      status: 'ready',
      title: 'Movers',
      sealId: 'seal-1',
      corroborationBand: 'medium',
      items: [
        {
          symbolOrSector: 'AAPL',
          headline: 'Up',
          directionBand: 'up',
          strengthBand: 'strong',
        },
        {
          symbolOrSector: 'MSFT',
          headline: 'Down',
          directionBand: 'down',
          strengthBand: 'weak',
        },
      ],
      itemViz: [],
      verifiedAt: '2026-07-19T12:00:00.000Z',
      expiresAt: null,
      reportConceptId: null,
      sourceChips: [],
    },
    reports: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        kind: 'daily',
        title: 'Daily',
        createdAt: '2026-07-19T12:00:00.000Z',
        expiresAt: null,
      },
    ],
    watchlists: [
      {
        id: '22222222-2222-2222-2222-222222222222',
        symbol: 'NVDA',
        bias: 'long',
        status: 'suggested_verified',
        sourceClass: 'derived',
        note: null,
        moduleName: 'm',
        engines: [],
        viz: null,
        sourceChips: [],
      },
    ],
    trendCandidates: [
      {
        id: '33333333-3333-3333-3333-333333333333',
        symbol: 'TSLA',
        direction: 'up',
        strengthBand: 'moderate',
        status: 'candidate',
        engines: [],
        viz: null,
      },
    ],
    positions: [
      {
        id: '44444444-4444-4444-4444-444444444444',
        moduleId: '55555555-5555-5555-5555-555555555555',
        moduleName: 'desk',
        symbol: 'AAPL',
        qty: '10',
        avgCostCents: 15000,
        markCents: 16000,
        unrealizedPnlCents: '10000',
        engines: [],
        updatedAt: '2026-07-19T12:00:00.000Z',
        viz: null as never,
        sourceChips: [],
      },
    ],
    pipeline: [],
    capitalSources: [
      {
        id: '66666666-6666-6666-6666-666666666666',
        name: 'Company pool',
        entityType: 'company',
        moduleType: null,
        kind: 'company_pool',
        tier: 'company_root',
        sourceLabel: 'pool',
        status: 'configured',
        allocationRef: null,
        allocationCents: '500000',
        allocationShareBps: 10_000,
        allocationStatus: 'resolved',
        ledgerBalanceCents: '500000',
        engineId: null,
        engineLabel: null,
      },
      {
        id: '77777777-7777-7777-7777-777777777777',
        name: 'Day desk',
        entityType: 'module',
        moduleType: 'trading',
        kind: 'trading_desk',
        tier: 'execution_split',
        sourceLabel: 'desk',
        status: 'configured',
        allocationRef: null,
        allocationCents: '200000',
        allocationShareBps: 4000,
        allocationStatus: 'resolved',
        ledgerBalanceCents: '200000',
        engineId: '99999999-9999-9999-9999-999999999999',
        engineLabel: 'Day engine',
      },
    ],
    news: {
      status: 'ready',
      title: 'News',
      sealId: 'n1',
      corroborationBand: 'low',
      items: [
        {
          symbolOrSector: 'Tech',
          headline: 'Sector',
          directionBand: 'up',
          strengthBand: 'medium',
        },
      ],
      verifiedAt: null,
      expiresAt: null,
      reportConceptId: null,
      sourceChips: [],
    },
    sources: {
      lanes: [
        {
          kind: 'alpaca_bars',
          domain: 'equity_bars',
          label: 'Bars',
          authMode: 'broker_paper',
          status: 'ready',
          contributed: true,
        },
        {
          kind: 'newsapi',
          domain: 'news',
          label: 'News',
          authMode: 'research_key',
          status: 'missing_key',
          contributed: false,
        },
      ],
      contributedKinds: ['alpaca_bars'],
      markFeedClass: 'broker_paper',
      scannedAt: '2026-07-19T12:00:00.000Z',
    },
    charts: {
      allocation: [
        { id: 'AAPL', label: 'AAPL', shareBps: 10_000, valueLabel: '160000' },
      ],
      watchlistTiers: [],
      trendStrength: [],
      moverDirections: [
        { id: 'up', label: 'up', shareBps: 5000, valueLabel: '1' },
        { id: 'down', label: 'down', shareBps: 5000, valueLabel: '1' },
      ],
      sourceReady: [
        { id: 'ready', label: 'ready', shareBps: 5000, valueLabel: '1' },
        { id: 'missing_key', label: 'need key', shareBps: 5000, valueLabel: '1' },
      ],
    },
    modelHydration: {
      liveSources: [],
      librarySources: [
        {
          id: '88888888-8888-8888-8888-888888888888',
          name: 'System movers',
          topicScope: 'movers',
          shelf: 'system',
          conceptCount: 40,
          admittedCount: 12,
          operation: 'corpus',
          amount: '12/40',
        },
      ],
      processingFlows: [
        {
          id: 'flow-1',
          kind: 'alpaca_bars',
          adapterLabel: 'Bars adapter',
          analysisRoles: ['compound'],
          operation: 'hydrate',
          amount: '1',
          route: 'bars',
          processStepIds: [],
          targetStages: ['gather'],
          pipelines: ['movers'],
          status: 'ready',
          contributed: true,
        },
      ],
      processSteps: [
        {
          id: 'step-1',
          route: 'compound',
          label: 'Rank',
          operation: 'run',
          amount: '1',
          analysisRole: 'compound',
          processFunction: 'rank',
          sortOrder: 0,
          kind: 'shared',
          pipelines: ['movers'],
          feedStages: ['rank'],
          status: 'ready',
        },
      ],
      stageOps: [
        { stageId: 'thresholds', operation: 'apply', amount: 'banded' },
        { stageId: 'defaults', operation: 'load', amount: 'typical' },
      ],
      capitalSources: [],
      panelSurfaces: [],
      totals: {
        liveReady: 1,
        liveTotal: 2,
        libraryCount: 1,
        admittedConcepts: 12,
        contributedKinds: 1,
        usedLiveMarks: 1,
        syntheticMarks: 0,
      },
      asOfIso: '2026-07-19T12:00:00.000Z',
      sealStamps: [],
    },
    awarenessAnalysis: {
      asOfIso: '2026-07-19T12:00:00.000Z',
      evidence: [],
      links: [
        {
          id: 'lnk-1',
          fromKind: 'news',
          fromId: 'n1',
          fromLabel: 'Headline',
          toKind: 'symbol',
          toId: 'AAPL',
          strengthBand: 'high',
          asOfIso: '2026-07-19T12:00:00.000Z',
        },
      ],
      trends: [],
      recommendations: [],
      coverageSummary: '1 link',
    },
    ...over,
  } as MarketHubResponse;
}

describe('market-posture-stage-charts', () => {
  it('formats allocation cents as dollars', () => {
    expect(formatAllocationSlices([{ id: 'a', label: 'a', shareBps: 100, valueLabel: '15000' }])[0]
      ?.valueLabel).toBe('$150.00');
  });

  it('builds capital charts from root funds + engines + book', () => {
    const charts = buildCapitalStageCharts(baseHub());
    expect(charts.rootFunds.some((s) => s.label === 'Company pool')).toBe(true);
    expect(charts.engineSplit.some((s) => s.label === 'Day engine')).toBe(true);
    expect(charts.bookAllocation[0]?.valueLabel).toBe('$1600.00');
  });

  it('builds library charts from shelves + admission + pnl', () => {
    const charts = buildLibraryStageCharts(baseHub());
    expect(charts.shelfMix[0]?.id).toBe('system');
    expect(charts.admission.find((s) => s.id === 'admitted')?.valueLabel).toBe('12');
    expect(charts.pnlMix.some((s) => s.id === 'gain')).toBe(true);
  });

  it('builds live charts from active lanes + adapters only', () => {
    const charts = buildLiveStageCharts(baseHub());
    expect(charts.domainMix.map((s) => s.id).sort()).toEqual(['equity_bars']);
    expect(charts.contributeMix.find((s) => s.id === 'contributed')?.valueLabel).toBe('1');
    expect(charts.adapterStatus[0]?.id).toBe('ready');
  });

  it('builds process charts from steps + links + cost', () => {
    const charts = buildProcessStageCharts(baseHub());
    expect(charts.processFunctions[0]?.id).toBe('rank');
    expect(charts.linkFrom[0]?.id).toBe('news');
    expect(charts.costBasis[0]?.label).toBe('AAPL');
  });

  it('builds outlook + day charts from watches, sealed boards, and actions', () => {
    const outlook = buildOutlookStageCharts(baseHub());
    expect(outlook.moverDirections).toHaveLength(2);
    expect(outlook.reportKinds[0]?.id).toBe('daily');
    expect(outlook.watchStatus.some((s) => s.id === 'suggested_verified')).toBe(true);
    const day = buildDayStageCharts(baseHub());
    expect(day.actions.some((s) => s.id === 'suggested_verified')).toBe(true);
    expect(day.trends.some((s) => s.id === 'moderate')).toBe(true);
  });

  it('builds entity chart rows for each stage inventory', () => {
    const hub = baseHub();
    expect(buildCapitalEntityCharts(hub).positions[0]?.label).toBe('AAPL');
    expect(buildLibraryEntityCharts(hub).libraries[0]?.valueLabel).toBe('12/40');
    expect(buildLiveEntityCharts(hub).sources).toHaveLength(1);
    expect(buildLiveEntityCharts(hub).adapters).toHaveLength(1);
    expect(buildProcessEntityCharts(hub).steps[0]?.label).toBe('Rank');
    expect(buildOutlookEntityCharts(hub).movers).toHaveLength(2);
    expect(buildOutlookEntityCharts(hub).watched.length).toBeGreaterThan(0);
    expect(buildDayEntityCharts(hub).trends[0]?.label).toBe('TSLA');
    expect(buildDayEntityCharts(hub).topics.length).toBeGreaterThan(0);
  });
});
