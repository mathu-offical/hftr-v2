import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { companies, ledgerEntries } from '@hftr/db/schema';

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
