import { and, eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { engineInstances, libraries, moduleLinks, modules } from '@hftr/db/schema';
import {
  ENGINE_GROUP_PADDING,
  buildCanvasEngineFamilies,
  engineCreateSection,
  getEngineTemplateById,
  isEngineDataHubConfig,
  layoutCanvas,
  placeDataHubOrigin,
  type LayoutResult,
  type LinkKind,
  type ModuleType,
} from '@hftr/contracts';
import { ensureEngineDataHub } from './data-hub';

export type ReflowCompanyFamilyLayoutResult = {
  layout: LayoutResult;
  hubsEnsured: number;
  modulesUpdated: number;
  enginesUpdated: number;
};

/**
 * D-159: Ensure every execution engine has a Data Hub, then run `layoutCanvas`
 * (research left → hub gap → execution right; families stack vertically) and
 * persist positions. Call after company create, engine insert, and page-load heal.
 */
export async function reflowCompanyFamilyLayout(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<ReflowCompanyFamilyLayoutResult> {
  const engineRows = await db
    .select({
      id: engineInstances.id,
      templateId: engineInstances.templateId,
    })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));

  let hubsEnsured = 0;
  for (const row of engineRows) {
    const template = getEngineTemplateById(row.templateId);
    if (!template || engineCreateSection(template) !== 'execution') continue;
    const result = await ensureEngineDataHub(db, companyId, row.id, now);
    if (result.created || result.hubModuleId) hubsEnsured += result.created ? 1 : 0;
  }

  const [moduleRows, linkRows, hubLibs] = await Promise.all([
    db
      .select({
        id: modules.id,
        type: modules.type,
        engineInstanceId: modules.engineInstanceId,
        toolOwnerModuleId: modules.toolOwnerModuleId,
        canvasPosition: modules.canvasPosition,
        config: modules.config,
      })
      .from(modules)
      .where(eq(modules.companyId, companyId)),
    db
      .select({
        fromModuleId: moduleLinks.fromModuleId,
        toModuleId: moduleLinks.toModuleId,
        linkKind: moduleLinks.linkKind,
      })
      .from(moduleLinks)
      .where(eq(moduleLinks.companyId, companyId)),
    db
      .select({
        moduleId: libraries.moduleId,
        ownerEngineInstanceId: libraries.ownerEngineInstanceId,
      })
      .from(libraries)
      .where(
        and(eq(libraries.companyId, companyId), eq(libraries.isEngineDataHub, true)),
      ),
  ]);

  const hubByEngine = new Map<string, string>();
  for (const lib of hubLibs) {
    if (lib.moduleId && lib.ownerEngineInstanceId) {
      hubByEngine.set(lib.ownerEngineInstanceId, lib.moduleId);
    }
  }
  for (const mod of moduleRows) {
    if (mod.type !== 'library') continue;
    const cfg = (mod.config ?? {}) as Record<string, unknown>;
    if (!isEngineDataHubConfig(cfg)) continue;
    const owner = cfg.ownerEngineInstanceId;
    if (typeof owner === 'string' && !hubByEngine.has(owner)) {
      hubByEngine.set(owner, mod.id);
    }
  }

  const layoutEngines = engineRows.map((row) => ({
    id: row.id,
    templateId: row.templateId,
    memberModuleIds: moduleRows
      .filter((m) => m.engineInstanceId === row.id)
      .map((m) => m.id),
    dataHubModuleId: hubByEngine.get(row.id) ?? null,
  }));

  const layoutModules = moduleRows.map((m) => ({
    id: m.id,
    type: m.type as ModuleType,
    engineInstanceId: m.engineInstanceId,
    toolOwnerModuleId: m.toolOwnerModuleId,
    position: (m.canvasPosition as { x: number; y: number } | null) ?? { x: 0, y: 0 },
  }));

  const layoutLinks = linkRows.map((l) => ({
    fromModuleId: l.fromModuleId,
    toModuleId: l.toModuleId,
    linkKind: l.linkKind as LinkKind,
  }));

  const layout = layoutCanvas(
    layoutEngines,
    layoutModules,
    layoutLinks,
    ENGINE_GROUP_PADDING,
  );

  for (const row of layout.modules) {
    await db
      .update(modules)
      .set({
        canvasPosition: {
          x: Math.round(row.canvasPosition.x),
          y: Math.round(row.canvasPosition.y),
        },
        updatedAt: now,
      })
      .where(and(eq(modules.id, row.id), eq(modules.companyId, companyId)));
  }

  for (const row of layout.engines) {
    await db
      .update(engineInstances)
      .set({
        canvasBounds: {
          x: Math.round(row.canvasBounds.x),
          y: Math.round(row.canvasBounds.y),
          width: Math.round(row.canvasBounds.width),
          height: Math.round(row.canvasBounds.height),
        },
        updatedAt: now,
      })
      .where(and(eq(engineInstances.id, row.id), eq(engineInstances.companyId, companyId)));
  }

  return {
    layout,
    hubsEnsured,
    modulesUpdated: layout.modules.length,
    enginesUpdated: layout.engines.length,
  };
}

/**
 * Dock existing Data Hub modules into the research→exec gap without reshuffling
 * member modules. Used when engines already have intentional relative positions
 * but hubs still sit off the family corridor. D-176: spawn uses placeDataHubOrigin.
 */
export async function dockCompanyDataHubs(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<number> {
  const engineRows = await db
    .select({
      id: engineInstances.id,
      templateId: engineInstances.templateId,
      canvasBounds: engineInstances.canvasBounds,
    })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));

  const hubLibs = await db
    .select({
      moduleId: libraries.moduleId,
      ownerEngineInstanceId: libraries.ownerEngineInstanceId,
    })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.isEngineDataHub, true)));

  const layoutEngines = engineRows.map((row) => ({
    id: row.id,
    templateId: row.templateId,
    memberModuleIds: [] as string[],
    dataHubModuleId:
      hubLibs.find((h) => h.ownerEngineInstanceId === row.id)?.moduleId ?? null,
  }));
  const { families } = buildCanvasEngineFamilies(layoutEngines);

  let moved = 0;
  for (const family of families) {
    const hubId = family.execution.dataHubModuleId;
    if (!hubId) continue;
    const execRow = engineRows.find((e) => e.id === family.execution.id);
    const execBounds = execRow?.canvasBounds as
      | { x: number; y: number; width: number; height: number }
      | null
      | undefined;
    if (!execBounds) continue;

    const researchBounds = family.researchDeps
      .map((dep) => {
        const row = engineRows.find((e) => e.id === dep.id);
        return row?.canvasBounds as
          | { x: number; y: number; width: number; height: number }
          | null
          | undefined;
      })
      .filter((b): b is { x: number; y: number; width: number; height: number } => b != null);

    const origin = placeDataHubOrigin(researchBounds, execBounds);
    await db
      .update(modules)
      .set({
        canvasPosition: { x: Math.round(origin.x), y: Math.round(origin.y) },
        updatedAt: now,
      })
      .where(and(eq(modules.id, hubId), eq(modules.companyId, companyId)));
    moved += 1;
  }

  return moved;
}
