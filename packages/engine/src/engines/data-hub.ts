import { and, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  engineInstances,
  engineUtilityLinks,
  libraries,
  moduleLinks,
  modules,
} from '@hftr/db/schema';
import {
  ENGINE_DATA_HUB_TOPIC_SCOPE,
  engineCreateSection,
  getEngineTemplateById,
  hubShelfStreamId,
  isEngineDataHubConfig,
  mergeEngineDataHubCompoundConfig,
  placeDataHubOrigin,
  researchDependenciesForExecutionEngine,
  type EngineDataHubCompoundConfig,
} from '@hftr/contracts';
import { bindSimAnalyzersToHub } from './sim-hub-bind';

export type EnsureEngineDataHubResult = {
  created: boolean;
  hubModuleId: string | null;
  hubLibraryId: string | null;
  nestedModuleIds: string[];
  linkCount: number;
};

function hubNameForLabel(label: string, engineId: string): string {
  const suffix = engineId.slice(0, 8);
  return `${label} Data Hub · ${suffix}`.slice(0, 120);
}

/**
 * D-140: Ensure an execution engine has a first-class Engine Data Hub.
 * Idempotent. No-ops for research engines.
 */
export async function ensureEngineDataHub(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<EnsureEngineDataHubResult> {
  const [engine] = await db
    .select({
      id: engineInstances.id,
      templateId: engineInstances.templateId,
      label: engineInstances.label,
      canvasBounds: engineInstances.canvasBounds,
    })
    .from(engineInstances)
    .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)))
    .limit(1);
  if (!engine) {
    return { created: false, hubModuleId: null, hubLibraryId: null, nestedModuleIds: [], linkCount: 0 };
  }

  const template = getEngineTemplateById(engine.templateId);
  if (!template || engineCreateSection(template) !== 'execution') {
    return { created: false, hubModuleId: null, hubLibraryId: null, nestedModuleIds: [], linkCount: 0 };
  }

  const existingHub = await findHubForEngine(db, companyId, engineId);
  let hubModuleId = existingHub?.moduleId ?? null;
  let hubLibraryId = existingHub?.id ?? null;
  let created = false;

  if (!hubLibraryId) {
    const bounds = engine.canvasBounds as {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    const execBounds = bounds ?? {
      x: 400,
      y: 200,
      width: 600,
      height: 400,
    };

    // Prefer the research→exec gap when dependency packs already have bounds (D-159).
    const depIds = researchDependenciesForExecutionEngine(engine.templateId);
    const researchBounds: Array<{ x: number; y: number; width: number; height: number }> = [];
    if (depIds.length > 0) {
      const peers = await db
        .select({
          templateId: engineInstances.templateId,
          canvasBounds: engineInstances.canvasBounds,
        })
        .from(engineInstances)
        .where(eq(engineInstances.companyId, companyId));
      for (const peer of peers) {
        if (!depIds.includes(peer.templateId) || !peer.canvasBounds) continue;
        researchBounds.push(
          peer.canvasBounds as { x: number; y: number; width: number; height: number },
        );
      }
    }

    const position =
      researchBounds.length > 0
        ? placeDataHubOrigin(researchBounds, execBounds)
        : placeDataHubOrigin([], execBounds);

    const compound = mergeEngineDataHubCompoundConfig(null);
    const hubConfig = {
      topicScope: ENGINE_DATA_HUB_TOPIC_SCOPE,
      masterLibrary: false,
      libraryClass: 'engine_data_hub' as const,
      engineDataHub: true,
      ownerEngineInstanceId: engineId,
      nestedModuleIds: [] as string[],
      shelves: compound.shelves,
      shelfOutputs: compound.shelfOutputs,
      topicFeed: compound.topicFeed,
    };

    const [hubModule] = await db
      .insert(modules)
      .values({
        companyId,
        type: 'library',
        name: hubNameForLabel(engine.label, engineId),
        generatedNameBase: 'DataHub',
        nameCustomized: false,
        config: hubConfig,
        status: 'active',
        canvasPosition: position,
        engineInstanceId: null,
        topicSectorsOverridden: false,
      })
      .returning({ id: modules.id });

    if (!hubModule) {
      return { created: false, hubModuleId: null, hubLibraryId: null, nestedModuleIds: [], linkCount: 0 };
    }
    hubModuleId = hubModule.id;

    const [hubLib] = await db
      .insert(libraries)
      .values({
        companyId,
        moduleId: hubModuleId,
        name: hubNameForLabel(engine.label, engineId),
        topicScope: ENGINE_DATA_HUB_TOPIC_SCOPE,
        masterLibrary: false,
        isEngineDataHub: true,
        ownerEngineInstanceId: engineId,
        parentHubLibraryId: null,
        status: 'active',
      })
      .onConflictDoNothing({ target: [libraries.companyId, libraries.name] })
      .returning({ id: libraries.id });

    if (hubLib) {
      hubLibraryId = hubLib.id;
      created = true;
    } else {
      const [existing] = await db
        .select({ id: libraries.id })
        .from(libraries)
        .where(
          and(
            eq(libraries.companyId, companyId),
            eq(libraries.name, hubNameForLabel(engine.label, engineId)),
          ),
        )
        .limit(1);
      hubLibraryId = existing?.id ?? null;
      if (hubLibraryId) {
        await db
          .update(libraries)
          .set({
            moduleId: hubModuleId,
            isEngineDataHub: true,
            ownerEngineInstanceId: engineId,
            topicScope: ENGINE_DATA_HUB_TOPIC_SCOPE,
            updatedAt: now,
          })
          .where(eq(libraries.id, hubLibraryId));
      }
    }
  }

  if (!hubModuleId || !hubLibraryId) {
    return { created, hubModuleId, hubLibraryId, nestedModuleIds: [], linkCount: 0 };
  }

  const nestedModuleIds = await syncDataHubNests(db, companyId, engineId, hubLibraryId, hubModuleId, now);
  const linkCount = await wireDataHubLinks(db, companyId, engineId, hubModuleId, nestedModuleIds, now);
  await mirrorResearchTargetsToHub(db, companyId, engineId, hubLibraryId, now);
  await bindSimAnalyzersToHub(db, companyId, engineId, hubModuleId, now);
  await wireShelfOutputs(db, companyId, engineId, hubModuleId, now);

  return { created, hubModuleId, hubLibraryId, nestedModuleIds, linkCount };
}

async function findHubForEngine(
  db: Db,
  companyId: string,
  engineId: string,
): Promise<{ id: string; moduleId: string | null } | null> {
  const [byOwner] = await db
    .select({ id: libraries.id, moduleId: libraries.moduleId })
    .from(libraries)
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.ownerEngineInstanceId, engineId),
        eq(libraries.isEngineDataHub, true),
      ),
    )
    .limit(1);
  if (byOwner) return byOwner;

  const libMods = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'library')));

  for (const mod of libMods) {
    const cfg = (mod.config ?? {}) as Record<string, unknown>;
    if (!isEngineDataHubConfig(cfg)) continue;
    if (cfg.ownerEngineInstanceId !== engineId) continue;
    const [lib] = await db
      .select({ id: libraries.id, moduleId: libraries.moduleId })
      .from(libraries)
      .where(and(eq(libraries.companyId, companyId), eq(libraries.moduleId, mod.id)))
      .limit(1);
    if (lib) return lib;
  }

  return null;
}

/** Register member + linked-research library modules as nests under the hub. */
export async function syncDataHubNests(
  db: Db,
  companyId: string,
  engineId: string,
  hubLibraryId: string,
  hubModuleId: string,
  now = new Date(),
): Promise<string[]> {
  const familyEngineIds = await resolveFamilyEngineIds(db, companyId, engineId);
  const nestModules = await db
    .select({ id: modules.id })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.type, 'library'),
        inArray(modules.engineInstanceId, familyEngineIds),
      ),
    );

  const nestedModuleIds = nestModules.map((m) => m.id).filter((id) => id !== hubModuleId);

  const [hubMod] = await db
    .select({ config: modules.config })
    .from(modules)
    .where(eq(modules.id, hubModuleId))
    .limit(1);
  const priorCfg = (hubMod?.config ?? {}) as Record<string, unknown>;
  const priorPartial: Parameters<typeof mergeEngineDataHubCompoundConfig>[0] = {};
  if (Array.isArray(priorCfg.shelves)) {
    priorPartial.shelves = priorCfg.shelves as EngineDataHubCompoundConfig['shelves'];
  }
  if (Array.isArray(priorCfg.shelfOutputs)) {
    priorPartial.shelfOutputs = priorCfg.shelfOutputs as EngineDataHubCompoundConfig['shelfOutputs'];
  }
  if (priorCfg.topicFeed && typeof priorCfg.topicFeed === 'object') {
    priorPartial.topicFeed = priorCfg.topicFeed as EngineDataHubCompoundConfig['topicFeed'];
  }
  const compound = mergeEngineDataHubCompoundConfig(priorPartial);

  if (nestedModuleIds.length > 0) {
    await db
      .update(libraries)
      .set({ parentHubLibraryId: hubLibraryId, updatedAt: now })
      .where(
        and(
          eq(libraries.companyId, companyId),
          inArray(libraries.moduleId, nestedModuleIds),
        ),
      );
  }

  await db
    .update(modules)
    .set({
      config: {
        topicScope: ENGINE_DATA_HUB_TOPIC_SCOPE,
        masterLibrary: false,
        libraryClass: 'engine_data_hub',
        engineDataHub: true,
        ownerEngineInstanceId: engineId,
        nestedModuleIds,
        shelves: compound.shelves,
        shelfOutputs: compound.shelfOutputs,
        topicFeed: compound.topicFeed,
      },
      updatedAt: now,
    })
    .where(eq(modules.id, hubModuleId));

  return nestedModuleIds;
}

async function resolveFamilyEngineIds(
  db: Db,
  companyId: string,
  executionEngineId: string,
): Promise<string[]> {
  const [engine] = await db
    .select({ templateId: engineInstances.templateId })
    .from(engineInstances)
    .where(and(eq(engineInstances.id, executionEngineId), eq(engineInstances.companyId, companyId)))
    .limit(1);
  if (!engine) return [executionEngineId];

  const depTemplateIds = new Set(researchDependenciesForExecutionEngine(engine.templateId));
  const allEngines = await db
    .select({ id: engineInstances.id, templateId: engineInstances.templateId })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));

  const ids = new Set<string>([executionEngineId]);
  for (const row of allEngines) {
    if (depTemplateIds.has(row.templateId)) ids.add(row.id);
  }

  // Also include engines that feed data_out → this engine's data_in (linked family).
  const utilLinks = await db
    .select({ fromEngineId: engineUtilityLinks.fromEngineId })
    .from(engineUtilityLinks)
    .where(
      and(
        eq(engineUtilityLinks.companyId, companyId),
        eq(engineUtilityLinks.toEngineId, executionEngineId),
        eq(engineUtilityLinks.bus, 'data_in'),
      ),
    );
  for (const link of utilLinks) {
    if (link.fromEngineId) ids.add(link.fromEngineId);
  }

  return [...ids];
}

/**
 * D-159: Bind Data Hub to owning execution engine via motherboard `data_in`.
 * Nest membership stays `parent_hub_library_id` only (no nest→hub module_links).
 * Query/returns use hub library targets + config — no hub↔trading module_links.
 */
export async function wireDataHubLinks(
  db: Db,
  companyId: string,
  engineId: string,
  hubModuleId: string,
  nestedModuleIds: string[],
  now = new Date(),
): Promise<number> {
  void nestedModuleIds;

  // Clear legacy hub module_links (D-140 module-edge era).
  await db
    .delete(moduleLinks)
    .where(
      and(
        eq(moduleLinks.companyId, companyId),
        or(eq(moduleLinks.fromModuleId, hubModuleId), eq(moduleLinks.toModuleId, hubModuleId)),
      ),
    );

  const existing = await db
    .select({ id: engineUtilityLinks.id })
    .from(engineUtilityLinks)
    .where(
      and(
        eq(engineUtilityLinks.companyId, companyId),
        eq(engineUtilityLinks.toEngineId, engineId),
        eq(engineUtilityLinks.bus, 'data_in'),
        eq(engineUtilityLinks.fromModuleId, hubModuleId),
      ),
    )
    .limit(1);

  if (existing.length > 0) return 0;

  const [row] = await db
    .insert(engineUtilityLinks)
    .values({
      companyId,
      toEngineId: engineId,
      bus: 'data_in',
      fromEngineId: null,
      fromModuleId: hubModuleId,
      streamId: null,
      streamDescriptor: 'Data Hub',
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: engineUtilityLinks.id });

  return row ? 1 : 0;
}

/**
 * D-216: sync enabled hub shelfOutputs to motherboard data_out utility links
 * (streamId = shelf:{origin}:{stream}). Disabled shelves remove matching links.
 */
export async function wireShelfOutputs(
  db: Db,
  companyId: string,
  engineId: string,
  hubModuleId: string,
  now = new Date(),
): Promise<number> {
  const [hubMod] = await db
    .select({ config: modules.config })
    .from(modules)
    .where(eq(modules.id, hubModuleId))
    .limit(1);
  if (!hubMod || !isEngineDataHubConfig((hubMod.config ?? {}) as Record<string, unknown>)) {
    return 0;
  }

  const cfg = (hubMod.config ?? {}) as Record<string, unknown>;
  const priorPartial: Parameters<typeof mergeEngineDataHubCompoundConfig>[0] = {};
  if (Array.isArray(cfg.shelves)) {
    priorPartial.shelves = cfg.shelves as EngineDataHubCompoundConfig['shelves'];
  }
  if (Array.isArray(cfg.shelfOutputs)) {
    priorPartial.shelfOutputs = cfg.shelfOutputs as EngineDataHubCompoundConfig['shelfOutputs'];
  }
  if (cfg.topicFeed && typeof cfg.topicFeed === 'object') {
    priorPartial.topicFeed = cfg.topicFeed as EngineDataHubCompoundConfig['topicFeed'];
  }
  const compound = mergeEngineDataHubCompoundConfig(priorPartial);
  const enabled = compound.shelfOutputs.filter((out) => out.enabled);
  const enabledIds = new Set(
    enabled.map((out) => out.streamId?.trim() || hubShelfStreamId(out.origin, out.stream)),
  );

  const existingShelfLinks = await db
    .select({
      id: engineUtilityLinks.id,
      streamId: engineUtilityLinks.streamId,
    })
    .from(engineUtilityLinks)
    .where(
      and(
        eq(engineUtilityLinks.companyId, companyId),
        eq(engineUtilityLinks.toEngineId, engineId),
        eq(engineUtilityLinks.bus, 'data_out'),
        eq(engineUtilityLinks.fromModuleId, hubModuleId),
      ),
    );

  let touched = 0;
  for (const link of existingShelfLinks) {
    const sid = link.streamId ?? '';
    if (!sid.startsWith('shelf:')) continue;
    if (enabledIds.has(sid)) continue;
    await db.delete(engineUtilityLinks).where(eq(engineUtilityLinks.id, link.id));
    touched += 1;
  }

  for (const out of enabled) {
    const streamId = out.streamId?.trim() || hubShelfStreamId(out.origin, out.stream);
    const streamDescriptor =
      out.streamDescriptor?.trim() ||
      `${out.origin} · ${out.stream}`;
    const match = existingShelfLinks.find((l) => l.streamId === streamId);
    if (match) {
      await db
        .update(engineUtilityLinks)
        .set({ streamDescriptor, updatedAt: now })
        .where(eq(engineUtilityLinks.id, match.id));
      touched += 1;
      continue;
    }
    await db.insert(engineUtilityLinks).values({
      companyId,
      toEngineId: engineId,
      bus: 'data_out',
      fromEngineId: null,
      fromModuleId: hubModuleId,
      streamId,
      streamDescriptor,
      updatedAt: now,
    });
    touched += 1;
  }

  return touched;
}

/** Ensure research modules in the family list the hub in targetLibraryIds (hydration). */
async function mirrorResearchTargetsToHub(
  db: Db,
  companyId: string,
  engineId: string,
  hubLibraryId: string,
  now: Date,
): Promise<void> {
  const familyIds = await resolveFamilyEngineIds(db, companyId, engineId);
  /** D-191: inline exec research stays desk-local — only child research ENGINEs hydrate the hub. */
  const childEngineIds = familyIds.filter((id) => id !== engineId);
  if (childEngineIds.length === 0) return;

  const researchMods = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.type, 'research'),
        inArray(modules.engineInstanceId, childEngineIds),
      ),
    );

  for (const mod of researchMods) {
    const cfg = { ...((mod.config ?? {}) as Record<string, unknown>) };
    const existing = Array.isArray(cfg.targetLibraryIds)
      ? (cfg.targetLibraryIds as string[]).filter((id) => typeof id === 'string')
      : [];
    if (existing.includes(hubLibraryId)) continue;
    cfg.targetLibraryIds = [...existing, hubLibraryId];
    await db
      .update(modules)
      .set({ config: cfg, updatedAt: now })
      .where(eq(modules.id, mod.id));
  }

  const librarianMods = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.type, 'librarian'),
        inArray(modules.engineInstanceId, childEngineIds),
      ),
    );
  for (const mod of librarianMods) {
    const cfg = { ...((mod.config ?? {}) as Record<string, unknown>) };
    const existing = Array.isArray(cfg.targetLibraryIds)
      ? (cfg.targetLibraryIds as string[]).filter((id) => typeof id === 'string')
      : [];
    if (existing.includes(hubLibraryId)) continue;
    cfg.targetLibraryIds = [...existing, hubLibraryId];
    await db
      .update(modules)
      .set({ config: cfg, updatedAt: now })
      .where(eq(modules.id, mod.id));
  }
}

/** Delete hub module + clear nest parents when an execution engine is cascade-deleted. */
export async function cleanupEngineDataHub(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<void> {
  const hub = await findHubForEngine(db, companyId, engineId);
  if (!hub) return;

  await db
    .update(libraries)
    .set({ parentHubLibraryId: null, updatedAt: now })
    .where(and(eq(libraries.companyId, companyId), eq(libraries.parentHubLibraryId, hub.id)));

  if (hub.moduleId) {
    await db
      .delete(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          or(eq(moduleLinks.fromModuleId, hub.moduleId), eq(moduleLinks.toModuleId, hub.moduleId)),
        ),
      );
    await db
      .update(libraries)
      .set({ moduleId: null, updatedAt: now })
      .where(eq(libraries.moduleId, hub.moduleId));
    await db.delete(modules).where(eq(modules.id, hub.moduleId));
  }

  await db.delete(libraries).where(eq(libraries.id, hub.id));
}
