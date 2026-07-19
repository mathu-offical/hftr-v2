import { describe, expect, it } from 'vitest';
import type { MarketHubCapitalSource, MarketHubResponse } from '@hftr/contracts';
import {
  buildRootUserCapitalView,
  filterModelCapitalToRootFunds,
  isEngineAllocation,
  isRootUserFund,
} from './market-posture-root-capital';

function cap(
  partial: Partial<MarketHubCapitalSource> &
    Pick<MarketHubCapitalSource, 'id' | 'name' | 'kind' | 'tier'>,
): MarketHubCapitalSource {
  return {
    entityType: 'module',
    moduleType: null,
    sourceLabel: 'test',
    status: 'configured',
    allocationRef: null,
    allocationCents: null,
    allocationShareBps: null,
    allocationStatus: 'unconfigured',
    ledgerBalanceCents: null,
    engineId: null,
    engineLabel: null,
    ...partial,
  };
}

describe('root user capital (D-186)', () => {
  it('classifies root funds vs engine allocations', () => {
    expect(isRootUserFund({ tier: 'company_root', kind: 'company_pool' })).toBe(true);
    expect(isRootUserFund({ tier: 'company_root', kind: 'holding_fund' })).toBe(true);
    expect(isRootUserFund({ tier: 'execution_split', kind: 'trading_desk' })).toBe(false);
    expect(isEngineAllocation({ tier: 'execution_split', kind: 'trading_desk' })).toBe(true);
    expect(isEngineAllocation({ tier: 'company_root', kind: 'holding_fund' })).toBe(false);
  });

  it('builds view with pool, holdings, engine groups — omits routers', () => {
    const hub = {
      capitalSources: [
        cap({
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Pool',
          kind: 'company_pool',
          tier: 'company_root',
          allocationCents: '1000000',
        }),
        cap({
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Hold',
          kind: 'holding_fund',
          tier: 'company_root',
          allocationCents: '400000',
        }),
        cap({
          id: '00000000-0000-4000-8000-000000000003',
          name: 'Desk A',
          kind: 'trading_desk',
          tier: 'execution_split',
          engineId: '00000000-0000-4000-8000-0000000000aa',
          engineLabel: 'Day engine',
          allocationCents: '250000',
        }),
        cap({
          id: '00000000-0000-4000-8000-000000000004',
          name: 'Router',
          kind: 'fund_router',
          tier: 'execution_split',
        }),
      ],
      positions: [],
      equity: {
        status: 'fresh',
        equityCents: '900000',
        asOfIso: '2026-07-19T12:00:00.000Z',
        version: 1,
        series: [],
        sourceChips: [],
      },
    } as unknown as MarketHubResponse;

    const view = buildRootUserCapitalView(hub);
    expect(view.companyPool?.name).toBe('Pool');
    expect(view.rootHoldingFunds).toHaveLength(1);
    expect(view.engineGroups).toHaveLength(1);
    expect(view.engineGroups[0]?.label).toBe('Day engine');
    expect(view.engineGroups[0]?.allocationCentsTotal).toBe('250000');
    expect(view.equityCents).toBe('900000');
  });

  it('filters model capital to company_root tier', () => {
    const filtered = filterModelCapitalToRootFunds([
      { tier: 'company_root' as const },
      { tier: 'execution_split' as const },
      { tier: 'company_root' as const },
    ]);
    expect(filtered).toHaveLength(2);
  });
});
