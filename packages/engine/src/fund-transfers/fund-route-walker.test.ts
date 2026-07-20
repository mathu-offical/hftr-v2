import { describe, expect, it } from 'vitest';
import { proposeFundRouteTransfers } from './fund-route-walker';

const IDS = {
  holdingFund: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  hubMath: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  fundRouter: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  trading: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  deskMath: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
} as const;

function dayTradingTopology(
  linksOverride?: Array<{
    fromModuleId: string;
    toModuleId: string;
    linkKind: string;
  }>,
) {
  const modules = [
    { id: IDS.holdingFund, type: 'holding_fund' as const },
    { id: IDS.hubMath, type: 'math' as const },
    { id: IDS.fundRouter, type: 'fund_router' as const },
    { id: IDS.trading, type: 'trading' as const },
    { id: IDS.deskMath, type: 'math' as const },
  ];

  const links = linksOverride ?? [
    { fromModuleId: IDS.holdingFund, toModuleId: IDS.hubMath, linkKind: 'fund_route' },
    { fromModuleId: IDS.hubMath, toModuleId: IDS.fundRouter, linkKind: 'fund_route' },
    { fromModuleId: IDS.fundRouter, toModuleId: IDS.deskMath, linkKind: 'fund_route' },
    { fromModuleId: IDS.trading, toModuleId: IDS.deskMath, linkKind: 'data_feed' },
  ];

  return { modules, links };
}

describe('proposeFundRouteTransfers', () => {
  it('proposes hops along day-trading fund_route topology', () => {
    const { modules, links } = dayTradingTopology();
    const outcome = proposeFundRouteTransfers({
      modules,
      links,
      amountCents: 25_000n,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.paths).toHaveLength(1);
    const path = outcome.result.paths[0]!;
    expect(path.terminalModuleId).toBe(IDS.deskMath);
    expect(path.hops).toEqual([
      {
        fromModuleId: IDS.holdingFund,
        toModuleId: IDS.hubMath,
        amountCents: 25_000n,
      },
      {
        fromModuleId: IDS.hubMath,
        toModuleId: IDS.fundRouter,
        amountCents: 25_000n,
      },
      {
        fromModuleId: IDS.fundRouter,
        toModuleId: IDS.deskMath,
        amountCents: 25_000n,
      },
    ]);

    expect(outcome.result.proposals).toEqual(
      path.hops.map((hop) => ({
        fromKind: 'module' as const,
        fromModuleId: hop.fromModuleId,
        toKind: 'module' as const,
        toModuleId: hop.toModuleId,
        amountCents: hop.amountCents,
      })),
    );
  });

  it('returns no_paths when a required fund_route hop is missing', () => {
    const { modules, links } = dayTradingTopology([
      { fromModuleId: IDS.holdingFund, toModuleId: IDS.hubMath, linkKind: 'fund_route' },
      { fromModuleId: IDS.fundRouter, toModuleId: IDS.deskMath, linkKind: 'fund_route' },
    ]);

    const outcome = proposeFundRouteTransfers({
      modules,
      links,
      amountCents: 10_000n,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('no_paths');
  });

  it('prefers direct holding→fund_router hop when legal (D-229)', () => {
    const { modules, links } = dayTradingTopology([
      { fromModuleId: IDS.holdingFund, toModuleId: IDS.fundRouter, linkKind: 'fund_route' },
      { fromModuleId: IDS.holdingFund, toModuleId: IDS.hubMath, linkKind: 'fund_route' },
      { fromModuleId: IDS.hubMath, toModuleId: IDS.fundRouter, linkKind: 'fund_route' },
      { fromModuleId: IDS.fundRouter, toModuleId: IDS.deskMath, linkKind: 'fund_route' },
    ]);

    const outcome = proposeFundRouteTransfers({
      modules,
      links,
      amountCents: 5_000n,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const hopPairs = outcome.result.paths[0]!.hops.map(
      (hop) => `${hop.fromModuleId}->${hop.toModuleId}`,
    );
    // Direct capital bus is preferred over legacy Math middleman path.
    expect(hopPairs).toEqual([
      `${IDS.holdingFund}->${IDS.fundRouter}`,
      `${IDS.fundRouter}->${IDS.deskMath}`,
    ]);
  });

  it('rejects non-positive amounts', () => {
    const { modules, links } = dayTradingTopology();
    const outcome = proposeFundRouteTransfers({
      modules,
      links,
      amountCents: 0n,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('invalid_amount');
  });
});
