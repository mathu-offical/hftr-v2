import { describe, expect, it } from 'vitest';
import {
  fundRouterToTradingMathLinks,
  planFundPathMathLinkRewires,
  resolveFundPathMathId,
} from './fund-route-links';

describe('fund-route-links (D-221)', () => {
  it('resolves template math to fund_router-owned fund_path Math', () => {
    const mathByOwner = new Map([
      ['router-1', 'fund-math-1'],
      ['trading-1', 'desk-math-1'],
    ]);
    expect(
      resolveFundPathMathId(
        [
          { id: 'hold-1', type: 'holding_fund' },
          { id: 'router-1', type: 'fund_router' },
          { id: 'trading-1', type: 'trading' },
        ],
        mathByOwner,
      ),
    ).toBe('fund-math-1');
  });

  it('wires fund_router → trading dedicated Math', () => {
    const links = fundRouterToTradingMathLinks(
      'company-1',
      [
        { id: 'router-1', type: 'fund_router' },
        { id: 'trading-1', type: 'trading' },
      ],
      new Map([['trading-1', 'desk-math-1']]),
    );
    expect(links).toEqual([
      {
        companyId: 'company-1',
        fromModuleId: 'router-1',
        toModuleId: 'desk-math-1',
        linkKind: 'fund_route',
      },
    ]);
  });

  it('rewrites holding→hub Math→router onto fund_path Math', () => {
    const rewires = planFundPathMathLinkRewires({
      modules: [
        { id: 'hold', type: 'holding_fund', toolOwnerModuleId: null },
        { id: 'hub', type: 'math', toolOwnerModuleId: null },
        { id: 'router', type: 'fund_router', toolOwnerModuleId: null },
        { id: 'fundMath', type: 'math', toolOwnerModuleId: 'router' },
      ],
      links: [
        {
          id: 'l1',
          fromModuleId: 'hold',
          toModuleId: 'hub',
          linkKind: 'fund_route',
        },
        {
          id: 'l2',
          fromModuleId: 'hub',
          toModuleId: 'router',
          linkKind: 'fund_route',
        },
      ],
    });
    expect(rewires).toEqual([
      { linkId: 'l1', fromModuleId: 'hold', toModuleId: 'fundMath' },
      { linkId: 'l2', fromModuleId: 'fundMath', toModuleId: 'router' },
    ]);
  });
});
