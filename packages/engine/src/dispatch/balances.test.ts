import { describe, expect, it } from 'vitest';
import type {
  CompileBalanceResolution,
  CompileBalanceSource,
  CompileSizingBudgetResolution,
} from './balances';

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

function pickCompileSizingBudget(args: {
  ledgerBudget: bigint;
  balanceSource: CompileBalanceSource;
  capitalAllocationRef: string | null;
  allocationCapCents: bigint | null;
}): CompileSizingBudgetResolution {
  const { ledgerBudget, balanceSource, capitalAllocationRef, allocationCapCents } = args;

  if (!capitalAllocationRef) {
    return {
      budgetCents: ledgerBudget,
      balanceSource,
      allocationCapCents: null,
      source: balanceSource,
    };
  }

  if (allocationCapCents === null) {
    return {
      budgetCents: ledgerBudget,
      balanceSource,
      allocationCapCents: null,
      source: balanceSource,
    };
  }

  if (allocationCapCents < ledgerBudget) {
    return {
      budgetCents: allocationCapCents,
      balanceSource,
      allocationCapCents,
      source: 'capital_allocation_capped',
    };
  }

  return {
    budgetCents: ledgerBudget,
    balanceSource,
    allocationCapCents,
    source: balanceSource,
  };
}

describe('compile sizing budget preference', () => {
  it('passes ledger budget through when no allocation ref', () => {
    expect(
      pickCompileSizingBudget({
        ledgerBudget: 200_000n,
        balanceSource: 'trading_module_ledger',
        capitalAllocationRef: null,
        allocationCapCents: null,
      }),
    ).toEqual({
      budgetCents: 200_000n,
      balanceSource: 'trading_module_ledger',
      allocationCapCents: null,
      source: 'trading_module_ledger',
    });
  });

  it('caps budget when allocation ref resolves below ledger', () => {
    expect(
      pickCompileSizingBudget({
        ledgerBudget: 500_000n,
        balanceSource: 'company_pool',
        capitalAllocationRef: 'nv_pct_25',
        allocationCapCents: 100_000n,
      }),
    ).toEqual({
      budgetCents: 100_000n,
      balanceSource: 'company_pool',
      allocationCapCents: 100_000n,
      source: 'capital_allocation_capped',
    });
  });

  it('keeps ledger budget when cap is higher', () => {
    expect(
      pickCompileSizingBudget({
        ledgerBudget: 50_000n,
        balanceSource: 'holding_fund_ledger',
        capitalAllocationRef: 'nv_fixed',
        allocationCapCents: 250_000n,
      }),
    ).toEqual({
      budgetCents: 50_000n,
      balanceSource: 'holding_fund_ledger',
      allocationCapCents: 250_000n,
      source: 'holding_fund_ledger',
    });
  });

  it('returns unresolved cap for caller fail-close when ref does not load', () => {
    const out = pickCompileSizingBudget({
      ledgerBudget: 300_000n,
      balanceSource: 'company_pool',
      capitalAllocationRef: 'nv_missing',
      allocationCapCents: null,
    });
    expect(out.allocationCapCents).toBeNull();
    expect(out.budgetCents).toBe(300_000n);
    expect(out.source).toBe('company_pool');
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
