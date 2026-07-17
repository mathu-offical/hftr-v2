import { MODULE_SERVICE_REQUIREMENTS } from '@hftr/contracts';
import { describe, expect, it } from 'vitest';
import {
  resolveModuleServiceCoverage,
  type ModuleServiceInput,
  type ModuleServiceSource,
} from './resolve-module-services';

const TRADING_MODULE_ID = '00000000-0000-4000-8000-000000000001';
const RESEARCH_MODULE_ID = '00000000-0000-4000-8000-000000000002';

function moduleInput(
  moduleId: string,
  moduleType: ModuleServiceInput['moduleType'],
): ModuleServiceInput {
  return { moduleId, moduleType };
}

function brokerSource(
  id: string,
  capabilities: ModuleServiceSource['capabilities'],
  available = true,
): ModuleServiceSource {
  return { id, kind: 'broker_connection', available, capabilities };
}

function apiKeySource(
  id: string,
  capabilities: ModuleServiceSource['capabilities'],
  available = true,
): ModuleServiceSource {
  return { id, kind: 'user_api_key', available, capabilities };
}

describe('resolveModuleServiceCoverage', () => {
  it('binds every matching available source capability for trading', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(TRADING_MODULE_ID, 'trading')],
      [brokerSource('broker-a', ['market_quotes', 'trade_execution', 'account_balances'])],
    );

    expect(result).toHaveLength(1);
    const coverage = result[0]!;
    expect(coverage.moduleId).toBe(TRADING_MODULE_ID);
    expect(coverage.moduleType).toBe('trading');
    expect(coverage.required).toEqual(MODULE_SERVICE_REQUIREMENTS.trading.required);
    expect(coverage.optional).toEqual(MODULE_SERVICE_REQUIREMENTS.trading.optional);
    expect(coverage.boundCapabilities).toEqual([
      'account_balances',
      'market_quotes',
      'trade_execution',
    ]);
    expect(coverage.missingRequired).toEqual([]);
    expect(coverage.missingOptional).toEqual(['open_positions']);
    expect(coverage.bindings).toEqual([
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'account_balances',
      },
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'market_quotes',
      },
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'trade_execution',
      },
    ]);
  });

  it('reports required gaps when no source satisfies a required capability', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(TRADING_MODULE_ID, 'trading')],
      [brokerSource('broker-a', ['market_quotes'])],
    );

    const coverage = result[0]!;
    expect(coverage.boundCapabilities).toEqual(['market_quotes']);
    expect(coverage.missingRequired).toEqual(['trade_execution']);
    expect(coverage.missingOptional).toEqual(['account_balances', 'open_positions']);
    expect(coverage.bindings).toEqual([
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'market_quotes',
      },
    ]);
  });

  it('reports optional gaps without treating them as blocking', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(TRADING_MODULE_ID, 'trading')],
      [brokerSource('broker-a', ['market_quotes', 'trade_execution'])],
    );

    const coverage = result[0]!;
    expect(coverage.missingRequired).toEqual([]);
    expect(coverage.missingOptional).toEqual(['account_balances', 'open_positions']);
  });

  it('excludes revoked or unavailable sources from bindings and coverage', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(TRADING_MODULE_ID, 'trading')],
      [
        brokerSource('broker-live', ['market_quotes', 'trade_execution'], false),
        brokerSource('broker-backup', ['market_quotes']),
      ],
    );

    const coverage = result[0]!;
    expect(coverage.boundCapabilities).toEqual(['market_quotes']);
    expect(coverage.missingRequired).toEqual(['trade_execution']);
    expect(coverage.bindings).toEqual([
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-backup',
        sourceKind: 'broker_connection',
        capability: 'market_quotes',
      },
    ]);
  });

  it('binds all relevant sources when multiple sources cover the same capability', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(TRADING_MODULE_ID, 'trading')],
      [
        brokerSource('broker-a', ['market_quotes', 'trade_execution']),
        apiKeySource('key-b', ['market_quotes']),
      ],
    );

    const coverage = result[0]!;
    expect(coverage.boundCapabilities).toEqual(['market_quotes', 'trade_execution']);
    expect(coverage.bindings).toEqual([
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'market_quotes',
      },
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'trade_execution',
      },
      {
        moduleId: TRADING_MODULE_ID,
        sourceId: 'key-b',
        sourceKind: 'user_api_key',
        capability: 'market_quotes',
      },
    ]);
  });

  it('deduplicates duplicate source entries and capability lists deterministically', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(RESEARCH_MODULE_ID, 'research')],
      [
        brokerSource('dup', ['research_provider', 'research_provider', 'historical_bars']),
        brokerSource('dup', ['research_provider']),
      ],
    );

    const coverage = result[0]!;
    expect(coverage.boundCapabilities).toEqual(['historical_bars', 'research_provider']);
    expect(coverage.missingRequired).toEqual([]);
    expect(coverage.missingOptional).toEqual([]);
    expect(coverage.bindings).toEqual([
      {
        moduleId: RESEARCH_MODULE_ID,
        sourceId: 'dup',
        sourceKind: 'broker_connection',
        capability: 'historical_bars',
      },
      {
        moduleId: RESEARCH_MODULE_ID,
        sourceId: 'dup',
        sourceKind: 'broker_connection',
        capability: 'research_provider',
      },
    ]);
  });

  it('is order independent for modules and sources', () => {
    const modules = [
      moduleInput(TRADING_MODULE_ID, 'trading'),
      moduleInput(RESEARCH_MODULE_ID, 'research'),
    ];
    const sources = [
      apiKeySource('key-z', ['research_provider']),
      brokerSource('broker-a', ['market_quotes', 'trade_execution']),
      brokerSource('broker-b', ['historical_bars']),
    ];

    const forward = resolveModuleServiceCoverage(modules, sources);
    const reverse = resolveModuleServiceCoverage([...modules].reverse(), [...sources].reverse());

    expect(reverse).toEqual(forward);
  });

  it('ignores source capabilities that are not required or optional for the module', () => {
    const result = resolveModuleServiceCoverage(
      [moduleInput(RESEARCH_MODULE_ID, 'research')],
      [brokerSource('broker-a', ['research_provider', 'trade_execution', 'crypto_quotes'])],
    );

    const coverage = result[0]!;
    expect(coverage.bindings).toEqual([
      {
        moduleId: RESEARCH_MODULE_ID,
        sourceId: 'broker-a',
        sourceKind: 'broker_connection',
        capability: 'research_provider',
      },
    ]);
    expect(coverage.boundCapabilities).toEqual(['research_provider']);
    expect(coverage.missingOptional).toEqual(['historical_bars']);
  });

  it('returns empty coverage list for no modules', () => {
    expect(resolveModuleServiceCoverage([], [brokerSource('broker-a', ['market_quotes'])])).toEqual(
      [],
    );
  });
});
