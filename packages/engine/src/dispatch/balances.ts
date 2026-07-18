import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  companies,
  ledgerEntries,
  modules,
  positions,
  realizedPnlEvents,
} from '@hftr/db/schema';
import { resolveCapitalAllocationUsdCents } from '../fund-transfers/resolve-amount';

/**
 * Realized loss magnitude for daily-loss limits (gap analysis #3).
 * Sums `-min(0, realized_pnl)` across company positions — lifetime book.
 * Prefer `getDailyRealizedLossCents` for session-scoped limits (D-090).
 */
export async function getCompanyRealizedLossCents(db: Db, companyId: string): Promise<bigint> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${positions.realizedPnlCents} < 0 then -${positions.realizedPnlCents} else 0 end), 0)::text`,
    })
    .from(positions)
    .where(eq(positions.companyId, companyId));
  return BigInt(rows[0]?.total ?? '0');
}

/**
 * Session-window realized-loss magnitude from append-only fill events (D-090).
 * Cash ledger is not used (buys are debits, not losses). Empty window → 0n.
 */
export async function getDailyRealizedLossCents(
  db: Db,
  companyId: string,
  sinceMs: number,
): Promise<bigint> {
  const since = new Date(sinceMs);
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${realizedPnlEvents.realizedCents} < 0 then -${realizedPnlEvents.realizedCents} else 0 end), 0)::text`,
    })
    .from(realizedPnlEvents)
    .where(
      and(eq(realizedPnlEvents.companyId, companyId), gte(realizedPnlEvents.createdAt, since)),
    );
  return BigInt(rows[0]?.total ?? '0');
}

export type EquityLimitSource = 'equity_projection' | 'virtual_balance';

/**
 * Prefer fresh company equity projection for daily-loss / size limits; fall back
 * to virtual cash balance when projection is stale or unavailable (D-090).
 */
export async function resolveEquityCentsForLimits(
  db: Db,
  companyId: string,
  fallbackVirtualBalanceCents: bigint,
): Promise<{ equityCents: bigint; source: EquityLimitSource }> {
  const rows = await db
    .select({
      equityCents: companies.equityCents,
      equityStatus: companies.equityStatus,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const row = rows[0];
  if (row?.equityStatus === 'fresh' && row.equityCents != null) {
    return { equityCents: row.equityCents, source: 'equity_projection' };
  }
  return { equityCents: fallbackVirtualBalanceCents, source: 'virtual_balance' };
}

export type CompileBalanceSource =
  | 'trading_module_ledger'
  | 'holding_fund_ledger'
  | 'company_pool';

export type CompileBalanceResolution = {
  balanceCents: bigint;
  source: CompileBalanceSource;
};

/**
 * Prefer module-scoped capital for compile sizing (gap analysis #7).
 * Order: trading module ledger → sole holding_fund ledger → company seed+ledger pool.
 */
export async function resolveCompileBalanceCents(
  db: Db,
  companyId: string,
  tradingModuleId: string | null | undefined,
): Promise<CompileBalanceResolution> {
  if (tradingModuleId) {
    const tradingBal = await getModuleBalanceCents(db, companyId, tradingModuleId);
    if (tradingBal > 0n) {
      return { balanceCents: tradingBal, source: 'trading_module_ledger' };
    }
  }

  const holdingFunds = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'holding_fund')));

  if (holdingFunds.length === 1) {
    const hfBal = await getModuleBalanceCents(db, companyId, holdingFunds[0]!.id);
    if (hfBal > 0n) {
      return { balanceCents: hfBal, source: 'holding_fund_ledger' };
    }
  }

  const companyBal = await getCompanyBalanceCents(db, companyId);
  return { balanceCents: companyBal, source: 'company_pool' };
}

export async function getModuleBalanceCents(
  db: Db,
  companyId: string,
  moduleId: string,
): Promise<bigint> {
  const sums = await db
    .select({ total: sql<string>`coalesce(sum(amount_cents), 0)::text` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.companyId, companyId), eq(ledgerEntries.moduleId, moduleId)));
  return BigInt(sums[0]?.total ?? '0');
}

export async function getCompanyBalanceCents(db: Db, companyId: string): Promise<bigint> {
  const companyRows = await db
    .select({ seed: companies.seedCreditsCents })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const seed = companyRows[0]?.seed ?? 0n;
  const sums = await db
    .select({ total: sql<string>`coalesce(sum(amount_cents), 0)::text` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.companyId, companyId));
  return seed + BigInt(sums[0]?.total ?? '0');
}

export type CompileSizingBudgetSource = CompileBalanceSource | 'capital_allocation_capped';

export type CompileSizingBudgetResolution = {
  budgetCents: bigint;
  balanceSource: CompileBalanceSource;
  allocationCapCents: bigint | null;
  source: CompileSizingBudgetSource;
};

/**
 * Compile sizing budget: module/holding/company ledger balance, optionally capped
 * by `capitalAllocationRef` (D-061). Caller fail-closes when ref is set but
 * `allocationCapCents` is null.
 */
export async function resolveCompileSizingBudget(
  db: Db,
  companyId: string,
  tradingModuleId: string,
  capitalAllocationRef: string | null | undefined,
): Promise<CompileSizingBudgetResolution> {
  const ledger = await resolveCompileBalanceCents(db, companyId, tradingModuleId);
  const { balanceCents: ledgerBudget, source: balanceSource } = ledger;

  if (!capitalAllocationRef) {
    return {
      budgetCents: ledgerBudget,
      balanceSource,
      allocationCapCents: null,
      source: balanceSource,
    };
  }

  const companyPoolCents = await getCompanyBalanceCents(db, companyId);
  const allocationCap = await resolveCapitalAllocationUsdCents(db, capitalAllocationRef, {
    baseBalanceCents: companyPoolCents,
  });

  if (allocationCap === null) {
    return {
      budgetCents: ledgerBudget,
      balanceSource,
      allocationCapCents: null,
      source: balanceSource,
    };
  }

  if (allocationCap < ledgerBudget) {
    return {
      budgetCents: allocationCap,
      balanceSource,
      allocationCapCents: allocationCap,
      source: 'capital_allocation_capped',
    };
  }

  return {
    budgetCents: ledgerBudget,
    balanceSource,
    allocationCapCents: allocationCap,
    source: balanceSource,
  };
}
