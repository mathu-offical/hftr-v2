import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { companies, ledgerEntries, modules, positions } from '@hftr/db/schema';

/**
 * Realized loss magnitude for daily-loss limits (gap analysis #3).
 * Sums `-min(0, realized_pnl)` across company positions — lifetime book until
 * day-bucketed PnL ledger ships. Never invents numbers; empty book → 0n.
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
