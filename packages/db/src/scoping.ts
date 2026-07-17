import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from './client';
import { companies, engineInstances, moduleLinks, modules } from './schema/companies';

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

/** Directory projection: companies plus engine labels for the companies list UI. */
export async function listCompaniesDirectory(db: Db, clerkUserId: string) {
  const rows = await listCompanies(db, clerkUserId);
  if (rows.length === 0) {
    return [] as Array<
      (typeof rows)[number] & { engines: Array<{ id: string; label: string; templateId: string }> }
    >;
  }
  const companyIds = rows.map((row) => row.id);
  const engineRows = await db
    .select({
      id: engineInstances.id,
      companyId: engineInstances.companyId,
      label: engineInstances.label,
      templateId: engineInstances.templateId,
    })
    .from(engineInstances)
    .where(inArray(engineInstances.companyId, companyIds));

  const byCompany = new Map<string, Array<{ id: string; label: string; templateId: string }>>();
  for (const engine of engineRows) {
    const list = byCompany.get(engine.companyId) ?? [];
    list.push({ id: engine.id, label: engine.label, templateId: engine.templateId });
    byCompany.set(engine.companyId, list);
  }

  return rows.map((row) => ({
    ...row,
    engines: byCompany.get(row.id) ?? [],
  }));
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

export async function listEngineInstances(db: Db, clerkUserId: string, companyId: string) {
  await getOwnedCompany(db, clerkUserId, companyId);
  return db.select().from(engineInstances).where(eq(engineInstances.companyId, companyId));
}

export async function getOwnedEngineInstance(
  db: Db,
  clerkUserId: string,
  companyId: string,
  engineInstanceId: string,
) {
  await getOwnedCompany(db, clerkUserId, companyId);
  const rows = await db
    .select()
    .from(engineInstances)
    .where(and(eq(engineInstances.id, engineInstanceId), eq(engineInstances.companyId, companyId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('engine_instance');
  return row;
}
