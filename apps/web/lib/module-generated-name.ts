import { deriveGeneratedModuleName, ModuleType } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { moduleLinks, modules } from '@hftr/db/schema';
import { and, eq } from 'drizzle-orm';

export interface ModuleNameUpdate {
  moduleId: string;
  name: string;
  generatedNameBase: string;
  nameCustomized: boolean;
}

type ModuleRow = typeof modules.$inferSelect;
type LinkRow = typeof moduleLinks.$inferSelect;

function computeGeneratedName(
  moduleId: string,
  moduleById: ReadonlyMap<string, ModuleRow>,
  links: readonly LinkRow[],
): string | null {
  const mod = moduleById.get(moduleId);
  if (!mod) return null;

  const inboundNames: string[] = [];
  const outboundNames: string[] = [];

  for (const link of links) {
    if (link.toModuleId === moduleId) {
      const from = moduleById.get(link.fromModuleId);
      if (from) inboundNames.push(from.generatedNameBase);
    }
    if (link.fromModuleId === moduleId) {
      const to = moduleById.get(link.toModuleId);
      if (to) outboundNames.push(to.generatedNameBase);
    }
  }

  return deriveGeneratedModuleName({
    type: ModuleType.parse(mod.type),
    baseName: mod.generatedNameBase,
    inboundNames,
    outboundNames,
  });
}

/**
 * Recompute generated display names for the given modules from the current
 * company graph. Updates only rows where nameCustomized=false.
 */
export async function refreshGeneratedModuleNames(
  db: Db,
  companyId: string,
  moduleIds: readonly string[],
): Promise<ModuleNameUpdate[]> {
  const uniqueIds = [...new Set(moduleIds)];
  if (uniqueIds.length === 0) return [];

  const allModules = await db.select().from(modules).where(eq(modules.companyId, companyId));
  const allLinks = await db.select().from(moduleLinks).where(eq(moduleLinks.companyId, companyId));

  const moduleById = new Map(allModules.map((row) => [row.id, row]));
  const updates: ModuleNameUpdate[] = [];

  for (const moduleId of uniqueIds) {
    const mod = moduleById.get(moduleId);
    if (!mod || mod.nameCustomized) continue;

    const newName = computeGeneratedName(moduleId, moduleById, allLinks);
    if (newName === null || newName === mod.name) continue;

    await db
      .update(modules)
      .set({ name: newName, updatedAt: new Date() })
      .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)));

    updates.push({
      moduleId,
      name: newName,
      generatedNameBase: mod.generatedNameBase,
      nameCustomized: false,
    });
  }

  return updates;
}

/** Recompute one module's generated name from the current graph (restore path). */
export async function restoreGeneratedModuleName(
  db: Db,
  companyId: string,
  moduleId: string,
): Promise<string | null> {
  const allModules = await db.select().from(modules).where(eq(modules.companyId, companyId));
  const allLinks = await db.select().from(moduleLinks).where(eq(moduleLinks.companyId, companyId));

  const moduleById = new Map(allModules.map((row) => [row.id, row]));
  return computeGeneratedName(moduleId, moduleById, allLinks);
}
