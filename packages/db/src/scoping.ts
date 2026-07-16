import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client';
import { companies, moduleLinks, modules } from './schema/companies';

/**
 * Ownership-scoped accessors. Every API handler MUST go through these —
 * they take a clerkUserId and verify ownership before touching child rows,
 * which is the app-level row-ownership baseline (AGENTS.md safety §).
 */

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found or not owned by caller`);
    this.name = 'NotFoundError';
  }
}

export async function listCompanies(db: Db, clerkUserId: string) {
  return db
    .select()
    .from(companies)
    .where(and(eq(companies.clerkUserId, clerkUserId), isNull(companies.archivedAt)));
}

/** Returns the company or throws NotFoundError. Base check for all child access. */
export async function getOwnedCompany(db: Db, clerkUserId: string, companyId: string) {
  const rows = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.clerkUserId, clerkUserId)))
    .limit(1);
  const company = rows[0];
  if (!company) throw new NotFoundError('company');
  return company;
}

export async function listModules(db: Db, clerkUserId: string, companyId: string) {
  await getOwnedCompany(db, clerkUserId, companyId);
  return db.select().from(modules).where(eq(modules.companyId, companyId));
}

export async function getOwnedModule(
  db: Db,
  clerkUserId: string,
  companyId: string,
  moduleId: string,
) {
  await getOwnedCompany(db, clerkUserId, companyId);
  const rows = await db
    .select()
    .from(modules)
    .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('module');
  return row;
}

export async function listLinks(db: Db, clerkUserId: string, companyId: string) {
  await getOwnedCompany(db, clerkUserId, companyId);
  return db.select().from(moduleLinks).where(eq(moduleLinks.companyId, companyId));
}
