import { describe, expect, it } from 'vitest';
import { BrokerConnectionSummary } from './broker-connection';
import { ModuleType } from './modules';
import {
  CompanyEquityProjection,
  MODULE_SERVICE_REQUIREMENTS,
  ModuleServiceCoverage,
  normalizeAdapterServiceCapabilities,
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
    expect(caps).toContain('crypto_quotes');
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
