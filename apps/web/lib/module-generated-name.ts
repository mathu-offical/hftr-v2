import { deriveGeneratedModuleName, moduleFunctionLabel, ModuleType } from '@hftr/contracts';
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

function neighborFunctionLabel(row: ModuleRow): string {
  const type = ModuleType.parse(row.type);
  return moduleFunctionLabel(type, row.config);
}

function computeGeneratedName(
  moduleId: string,
  moduleById: ReadonlyMap<string, ModuleRow>,
  links: readonly LinkRow[],
): { name: string; generatedNameBase: string } | null {
  const mod = moduleById.get(moduleId);
  if (!mod) return null;

  const type = ModuleType.parse(mod.type);
  const generatedNameBase = moduleFunctionLabel(type, mod.config);

  const inboundLabels: string[] = [];
  const outboundLabels: string[] = [];

  for (const link of links) {
    if (link.toModuleId === moduleId) {
      const from = moduleById.get(link.fromModuleId);
      if (from) inboundLabels.push(neighborFunctionLabel(from));
    }
    if (link.fromModuleId === moduleId) {
      const to = moduleById.get(link.toModuleId);
      if (to) outboundLabels.push(neighborFunctionLabel(to));
    }
  }

  let topicSectors = mod.topicSectors ?? [];
  // Dedicated Math tools: use owner Fn as focus when topics are unset.
  if (type === 'math' && topicSectors.length === 0 && mod.toolOwnerModuleId) {
    const owner = moduleById.get(mod.toolOwnerModuleId);
    if (owner) {
      topicSectors = [neighborFunctionLabel(owner)];
    }
  }

  const name = deriveGeneratedModuleName({
    type,
    baseName: generatedNameBase,
    config: mod.config,
    topicSectors,
    inboundLabels,
    outboundLabels,
  });

  return { name, generatedNameBase };
}

/**
 * Recompute generated display names for the given modules from the current
 * company graph. Updates only rows where nameCustomized=false.
 * Realigns generatedNameBase to the short function lexicon when refreshing.
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

    const derived = computeGeneratedName(moduleId, moduleById, allLinks);
    if (derived === null) continue;
    if (derived.name === mod.name && derived.generatedNameBase === mod.generatedNameBase) {
      continue;
    }

    await db
      .update(modules)
      .set({
        name: derived.name,
        generatedNameBase: derived.generatedNameBase,
        updatedAt: new Date(),
      })
      .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)));

    updates.push({
      moduleId,
      name: derived.name,
      generatedNameBase: derived.generatedNameBase,
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
): Promise<{ name: string; generatedNameBase: string } | null> {
  const allModules = await db.select().from(modules).where(eq(modules.companyId, companyId));
  const allLinks = await db.select().from(moduleLinks).where(eq(moduleLinks.companyId, companyId));

  const moduleById = new Map(allModules.map((row) => [row.id, row]));
  return computeGeneratedName(moduleId, moduleById, allLinks);
}
