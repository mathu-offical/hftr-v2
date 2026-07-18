import { describe, expect, it } from 'vitest';
import type { CompileBalanceResolution } from './balances';

/**
 * Pure resolution preference tests (DB-backed helpers covered via compile path
 * integration). Documents capital topology order for gap analysis #7.
 */
function pickCompileBalance(args: {
  tradingModuleCents: bigint;
  holdingFundCents: bigint | null;
  companyPoolCents: bigint;
}): CompileBalanceResolution {
  if (args.tradingModuleCents > 0n) {
    return { balanceCents: args.tradingModuleCents, source: 'trading_module_ledger' };
  }
  if (args.holdingFundCents != null && args.holdingFundCents > 0n) {
    return { balanceCents: args.holdingFundCents, source: 'holding_fund_ledger' };
  }
  return { balanceCents: args.companyPoolCents, source: 'company_pool' };
}

describe('compile balance preference', () => {
  it('prefers trading module ledger when funded', () => {
    expect(
      pickCompileBalance({
        tradingModuleCents: 50_000n,
        holdingFundCents: 200_000n,
        companyPoolCents: 1_000_000n,
      }),
    ).toEqual({ balanceCents: 50_000n, source: 'trading_module_ledger' });
  });

  it('falls back to holding fund then company pool', () => {
    expect(
      pickCompileBalance({
        tradingModuleCents: 0n,
        holdingFundCents: 200_000n,
        companyPoolCents: 1_000_000n,
      }),
    ).toEqual({ balanceCents: 200_000n, source: 'holding_fund_ledger' });

    expect(
      pickCompileBalance({
        tradingModuleCents: 0n,
        holdingFundCents: 0n,
        companyPoolCents: 1_000_000n,
      }),
    ).toEqual({ balanceCents: 1_000_000n, source: 'company_pool' });
  });
});

describe('equity limit preference', () => {
  it('documents fresh projection over virtual balance', () => {
    type Source = 'equity_projection' | 'virtual_balance';
    function pick(
      status: 'fresh' | 'stale' | 'unavailable',
      equity: bigint | null,
      fallback: bigint,
    ): { equityCents: bigint; source: Source } {
      if (status === 'fresh' && equity != null) {
        return { equityCents: equity, source: 'equity_projection' };
      }
      return { equityCents: fallback, source: 'virtual_balance' };
    }
    expect(pick('fresh', 900_000n, 100_000n)).toEqual({
      equityCents: 900_000n,
      source: 'equity_projection',
    });
    expect(pick('stale', 900_000n, 100_000n)).toEqual({
      equityCents: 100_000n,
      source: 'virtual_balance',
    });
  });
});
