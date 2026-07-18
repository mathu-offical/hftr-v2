import { describe, expect, it } from 'vitest';
import { BrokerConnectionSummary } from './broker-connection';
import { ModuleType } from './modules';
import {
  CompanyEquityProjection,
  MODULE_SERVICE_REQUIREMENTS,
  ModuleServiceCoverage,
  normalizeAdapterServiceCapabilities,
  normalizeResearchKeyServiceCapabilities,
  requirementsForEngine,
  ServiceCapability,
  ServiceRequirement,
} from './services';
import { ENGINE_TEMPLATES, getEngineTemplateById } from './templates';

const dayTrading = getEngineTemplateById('engine_day_trading')!;

describe('ServiceCapability', () => {
  it('declares the finite capability enum', () => {
    expect(ServiceCapability.options).toEqual([
      'market_quotes',
      'historical_bars',
      'trade_execution',
      'account_balances',
      'open_positions',
      'event_contract_quotes',
      'crypto_quotes',
      'research_provider',
    ]);
  });
});

describe('MODULE_SERVICE_REQUIREMENTS', () => {
  it('requires market_quotes and trade_execution for trading', () => {
    expect(MODULE_SERVICE_REQUIREMENTS.trading.required).toContain('market_quotes');
    expect(MODULE_SERVICE_REQUIREMENTS.trading.required).toContain('trade_execution');
  });

  it('declares required and optional arrays for every module type', () => {
    for (const type of ModuleType.options) {
      const coverage = MODULE_SERVICE_REQUIREMENTS[type];
      expect(coverage).toBeDefined();
      expect(ServiceRequirement.parse(coverage)).toBeTruthy();
      expect(new Set(coverage.required).size).toBe(coverage.required.length);
      expect(new Set(coverage.optional).size).toBe(coverage.optional.length);
      for (const cap of coverage.required) {
        expect(coverage.optional).not.toContain(cap);
      }
    }
  });
});

describe('requirementsForEngine', () => {
  it('unions and deduplicates member module requirements', () => {
    const aggregated = requirementsForEngine(dayTrading);
    expect(aggregated.required).toContain('trade_execution');
    expect(aggregated.required).toContain('market_quotes');
    expect(new Set(aggregated.required).size).toBe(aggregated.required.length);
    expect(new Set(aggregated.optional).size).toBe(aggregated.optional.length);
    for (const cap of aggregated.required) {
      expect(aggregated.optional).not.toContain(cap);
    }
  });

  it('aggregates trend research engine without execution requirements', () => {
    const trendResearch = getEngineTemplateById('engine_trend_research')!;
    const aggregated = requirementsForEngine(trendResearch);
    expect(aggregated.required).not.toContain('trade_execution');
    expect(aggregated.required).toContain('research_provider');
  });
});

describe('CompanyEquityProjection', () => {
  it('parses a materialized equity projection', () => {
    expect(
      CompanyEquityProjection.parse({
        equityCents: '1024530',
        status: 'fresh',
        asOfIso: '2026-07-17T20:00:00.000Z',
        version: 2,
      }),
    ).toBeTruthy();
  });

  it('parses never-computed unavailable with null equity and asOf', () => {
    expect(
      CompanyEquityProjection.parse({
        equityCents: null,
        asOfIso: null,
        status: 'unavailable',
        version: 0,
      }),
    ).toEqual({
      equityCents: null,
      asOfIso: null,
      status: 'unavailable',
      version: 0,
    });
  });

  it('rejects fresh projection with null equity or asOf', () => {
    expect(() =>
      CompanyEquityProjection.parse({
        equityCents: null,
        asOfIso: null,
        status: 'fresh',
        version: 0,
      }),
    ).toThrow();
  });

  it('requires stale to retain last successful equity and asOf', () => {
    expect(
      CompanyEquityProjection.parse({
        equityCents: '1000000',
        status: 'stale',
        asOfIso: '2026-07-17T19:00:00.000Z',
        version: 3,
      }),
    ).toBeTruthy();
    expect(() =>
      CompanyEquityProjection.parse({
        equityCents: null,
        asOfIso: null,
        status: 'stale',
        version: 3,
      }),
    ).toThrow();
  });

  it('rejects non-integer cent strings', () => {
    expect(() =>
      CompanyEquityProjection.parse({
        equityCents: '10245.30',
        status: 'fresh',
        asOfIso: '2026-07-17T20:00:00.000Z',
        version: 1,
      }),
    ).toThrow();
  });
});

describe('ModuleServiceCoverage', () => {
  it('parses module coverage with missing capability gaps', () => {
    expect(
      ModuleServiceCoverage.parse({
        moduleType: 'trading',
        required: ['market_quotes', 'trade_execution'],
        optional: ['account_balances'],
        boundCapabilities: ['market_quotes'],
        missingRequired: ['trade_execution'],
        missingOptional: ['account_balances'],
      }),
    ).toBeTruthy();
  });
});

describe('normalizeAdapterServiceCapabilities', () => {
  it('maps adapter assets to normalized service capabilities', () => {
    const caps = normalizeAdapterServiceCapabilities({
      venue: 'alpaca',
      assets: ['us_equity', 'crypto'],
      orderTypes: ['market', 'limit'],
      sessions: 'extended',
      supportsPaper: true,
      supportsFractional: true,
      fundingUx: 'deep_link',
    });
    expect(caps).toContain('market_quotes');
    expect(caps).toContain('trade_execution');
    expect(caps).toContain('account_balances');
    expect(caps).toContain('crypto_quotes');
    expect(caps).not.toContain('historical_bars');
    expect(caps).not.toContain('open_positions');
  });

  it('does not grant historical_bars or open_positions for Kalshi/minimal adapters', () => {
    const kalshi = normalizeAdapterServiceCapabilities({
      venue: 'kalshi',
      assets: ['event_contract'],
      orderTypes: ['limit'],
      sessions: 'around_the_clock',
      supportsPaper: true,
      supportsFractional: false,
      fundingUx: 'none',
    });
    expect(kalshi).toContain('market_quotes');
    expect(kalshi).toContain('account_balances');
    expect(kalshi).toContain('trade_execution');
    expect(kalshi).toContain('event_contract_quotes');
    expect(kalshi).not.toContain('historical_bars');
    expect(kalshi).not.toContain('open_positions');
    expect(kalshi).not.toContain('crypto_quotes');

    const quotesOnly = normalizeAdapterServiceCapabilities({
      venue: 'alpaca',
      assets: ['us_equity'],
      orderTypes: [],
      sessions: 'rth_only',
      supportsPaper: true,
      supportsFractional: false,
      fundingUx: 'none',
    });
    expect(quotesOnly).toEqual(['account_balances', 'market_quotes']);
    expect(quotesOnly).not.toContain('trade_execution');
    expect(quotesOnly).not.toContain('historical_bars');
    expect(quotesOnly).not.toContain('open_positions');
  });
});

describe('normalizeResearchKeyServiceCapabilities', () => {
  it('maps gather providers to research_provider and optional bars', () => {
    expect(normalizeResearchKeyServiceCapabilities('finnhub')).toEqual(['research_provider']);
    expect(normalizeResearchKeyServiceCapabilities('polygon')).toEqual([
      'historical_bars',
      'research_provider',
    ]);
    expect(normalizeResearchKeyServiceCapabilities(null)).toEqual([]);
  });
});

describe('BrokerConnectionSummary', () => {
  it('includes normalized serviceCapabilities while preserving legacy fields', () => {
    const parsed = BrokerConnectionSummary.parse({
      id: '00000000-0000-4000-8000-000000000001',
      venue: 'alpaca',
      mode: 'paper',
      status: 'connected',
      keyHint: '…abcd',
      capabilities: {
        venue: 'alpaca',
        assets: ['us_equity'],
        orderTypes: ['market'],
        sessions: 'extended',
        supportsPaper: true,
        supportsFractional: true,
        fundingUx: 'deep_link',
      },
      serviceCapabilities: ['market_quotes', 'trade_execution'],
      lastVerifiedAt: '2026-07-17T20:00:00.000Z',
      boundCompanyId: null,
      createdAt: '2026-07-17T19:00:00.000Z',
      updatedAt: '2026-07-17T20:00:00.000Z',
    });
    expect(parsed.capabilities?.venue).toBe('alpaca');
    expect(parsed.serviceCapabilities).toEqual(['market_quotes', 'trade_execution']);
  });

  it('defaults serviceCapabilities to an empty array when omitted', () => {
    const parsed = BrokerConnectionSummary.parse({
      id: '00000000-0000-4000-8000-000000000002',
      venue: 'kalshi',
      mode: 'paper',
      status: 'unverified',
      keyHint: '…wxyz',
      capabilities: null,
      lastVerifiedAt: null,
      boundCompanyId: null,
      createdAt: '2026-07-17T19:00:00.000Z',
      updatedAt: '2026-07-17T19:00:00.000Z',
    });
    expect(parsed.serviceCapabilities).toEqual([]);
  });
});

describe('getEngineTemplateById', () => {
  it('resolves engine templates by id', () => {
    expect(getEngineTemplateById('engine_day_trading')).toBe(ENGINE_TEMPLATES[0]);
    expect(getEngineTemplateById('missing')).toBeUndefined();
  });
});
