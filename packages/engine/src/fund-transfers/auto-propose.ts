import { and, eq } from 'drizzle-orm';
import { parseAutoFundPolicy } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, fundTransfers, moduleLinks, modules } from '@hftr/db/schema';
import { proposeFundRouteTransfers } from './fund-route-walker';
import { fundTransferRowsFromProposals } from './transfer';

/**
 * When auto_fund_policy.mode is propose_on_equity_refresh, walk fund_route
 * topology and insert `requested` transfers for the approval inbox (D-093).
 * Never auto-settles. No-op when policy off, equity missing, or no paths.
 */
export async function maybeAutoProposeFundRoutes(
  db: Db,
  companyId: string,
): Promise<{ proposed: number }> {
  const [company] = await db
    .select({
      autoFundPolicy: companies.autoFundPolicy,
      equityCents: companies.equityCents,
      equityStatus: companies.equityStatus,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return { proposed: 0 };

  const policy = parseAutoFundPolicy(company.autoFundPolicy);
  if (policy.mode !== 'propose_on_equity_refresh') return { proposed: 0 };
  if (company.equityStatus !== 'fresh' || company.equityCents == null || company.equityCents <= 0n) {
    return { proposed: 0 };
  }

  const amountCents = (company.equityCents * BigInt(policy.amountBps)) / 10000n;
  if (amountCents <= 0n) return { proposed: 0 };

  // Avoid stacking duplicate pending proposals for the same company.
  const pending = await db
    .select({ id: fundTransfers.id })
    .from(fundTransfers)
    .where(and(eq(fundTransfers.companyId, companyId), eq(fundTransfers.status, 'requested')))
    .limit(1);
  if (pending.length > 0) return { proposed: 0 };

  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, companyId));
  const links = await db
    .select({
      fromModuleId: moduleLinks.fromModuleId,
      toModuleId: moduleLinks.toModuleId,
      linkKind: moduleLinks.linkKind,
    })
    .from(moduleLinks)
    .where(eq(moduleLinks.companyId, companyId));

  const outcome = proposeFundRouteTransfers({
    modules: companyModules,
    links,
    amountCents,
  });
  if (!outcome.ok || outcome.result.proposals.length === 0) return { proposed: 0 };

  const rows = fundTransferRowsFromProposals(outcome.result.proposals, 'policy').map((row) => ({
    companyId,
    ...row,
  }));
  await db.insert(fundTransfers).values(rows);
  return { proposed: rows.length };
}
