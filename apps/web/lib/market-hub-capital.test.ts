import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hftr/engine', () => ({
  resolveCapitalAllocationUsdCents: vi.fn(async (_db: unknown, ref: string | null) => {
    if (!ref) return null;
    if (ref === 'bad') return null;
    return 250_000n;
  }),
}));

import { projectMarketHubCapitalSources } from './market-hub-capital';

const companyId = '11111111-1111-4111-8111-111111111111';
const engineId = '22222222-2222-4222-8222-222222222222';
const researchEngineId = '66666666-6666-4666-8666-666666666666';

describe('projectMarketHubCapitalSources (D-144)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits company pool + root holding funds + trading splits; omits routers and engines', async () => {
    const rows = await projectMarketHubCapitalSources({
      db: {} as never,
      companyId,
      companyPoolCents: 1_000_000n,
      engineLabelById: new Map([
        [engineId, 'Day engine'],
        [researchEngineId, 'Market regime lab'],
      ]),
      moduleLedgerBalance: new Map(),
      moduleRows: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Root Fund',
          type: 'holding_fund',
          engineInstanceId: engineId,
          config: { source: 'company_seed' },
          capitalAllocationRef: 'fund-ref',
          status: 'active',
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Router hop',
          type: 'fund_router',
          engineInstanceId: engineId,
          config: {},
          capitalAllocationRef: 'router-ref',
          status: 'active',
        },
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Desk',
          type: 'trading',
          engineInstanceId: engineId,
          config: {},
          capitalAllocationRef: 'desk-ref',
          status: 'active',
        },
      ],
    });

    expect(rows.some((r) => r.kind === 'fund_router')).toBe(false);
    expect(rows.some((r) => r.kind === 'engine_envelope')).toBe(false);
    expect(rows.find((r) => r.kind === 'company_pool')?.tier).toBe('company_root');
    expect(rows.find((r) => r.kind === 'holding_fund')?.tier).toBe('company_root');
    expect(rows.find((r) => r.kind === 'trading_desk')?.tier).toBe('execution_split');
    expect(rows.filter((r) => r.tier === 'company_root').length).toBe(2);
    expect(rows.filter((r) => r.tier === 'execution_split').length).toBe(1);
    expect(rows.every((r) => r.kind !== 'engine_envelope')).toBe(true);
  });
});
