import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CANVAS_LAYOUT,
  deriveGeneratedModuleName,
  ENGINE_GROUP_PADDING,
  InsertEngineInput,
  layoutEngineTemplateAtOrigin,
  listResolvedEngineTemplates,
  MAX_MODULES_PER_COMPANY,
  MODULE_CONFIG_SCHEMAS,
  moduleFunctionLabel,
  moduleRequiresMath,
  placeNextEngineOrigin,
  resolveEngineSetupFromCompany,
  templateInputTargets,
  engineCreateSection,
  researchDependenciesForExecutionEngine,
  type LayoutRect,
  type ModuleType,
} from '@hftr/contracts';
import {
  loadSessionConstraints,
  createSystemClock,
  resolveCompanyServiceBindings,
  ensureEngineMotherboardUtilities,
  listEngineUtilityLinks,
  ensureEngineDataHub,
  bootstrapCompanyKnowledge,
  reflowCompanyFamilyLayout,
} from '@hftr/engine';
import { provisionEngineTimeHub } from '@/lib/time-provision';
import { engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import {
  cascadeEngineSetup,
  engineSetupSnapshotFromInput,
  recordEngineSetupRefs,
} from '@/lib/engine-setup-cascade';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';
import { provisionDedicatedMathTools } from '@/lib/math-provision';
import { fundRouterToTradingMathLinks } from '@/lib/fund-route-links';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

function serializeEngine(row: typeof engineInstances.$inferSelect, memberModuleIds: string[]) {
  return {
    id: row.id,
    companyId: row.companyId,
    templateId: row.templateId,
    label: row.label,
    masterTopicSectors: row.masterTopicSectors,
    capitalAllocationRef: row.capitalAllocationRef,
    targetExitRef: row.targetExitRef,
    setupSnapshot: row.setupSnapshot as {
      topicSectors: string[];
      allocationMode: 'amount' | 'percentage';
      allocationValue: string;
      targetExitLocal: string;
    },
    templateInputs: (row.templateInputs ?? {}) as Record<string, string>,
    canvasBounds: row.canvasBounds as {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null,
    memberModuleIds,
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const rows = await scoping.listEngineInstances(db, clerkUserId, companyId);
    const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
    const engines = rows.map((row) =>
      serializeEngine(
        row,
        moduleRows.filter((m) => m.engineInstanceId === row.id).map((m) => m.id),
      ),
    );
    return { engines };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, InsertEngineInput);

    const sessionIds = new Set(loadSessionConstraints().keys());
    const templates = listResolvedEngineTemplates(sessionIds);
    const engine = templates.find((item) => item.id === input.templateId);
    if (!engine) throw new ApiError(422, 'engine_template_not_found');
    if (!engine.available) {
      throw new ApiError(422, engine.unavailableReason ?? 'engine_template_unavailable');
    }

    const existing = await scoping.listModules(db, clerkUserId, companyId);
    const dedicatedMathCount = engine.modules.filter((module) =>
      moduleRequiresMath(module.type),
    ).length;
    if (existing.length + engine.modules.length + dedicatedMathCount > MAX_MODULES_PER_COMPANY) {
      throw new ApiError(422, 'module_limit_reached');
    }

    const mathModule = existing.find((m) => m.type === 'math');
    if (engine.links.some((l) => l.fromIndex === 'math' || l.toIndex === 'math') && !mathModule) {
      throw new ApiError(422, 'math_module_required');
    }

    const configs = engine.modules.map((m) => ({ ...m.config }));
    const grouped = new Map<string, string[]>();
    for (const engineInput of engine.inputs) {
      const value = input.inputs[engineInput.key]?.trim();
      if (!value) continue;
      for (const target of templateInputTargets(engineInput)) {
        const mapKey = `${target.moduleIndex}:${target.configKey}`;
        grouped.set(mapKey, [...(grouped.get(mapKey) ?? []), value]);
      }
    }
    for (const [mapKey, values] of grouped) {
      const [idx, configKey] = mapKey.split(':') as [string, string];
      configs[Number(idx)]![configKey] = values.join(' — ');
    }

    const existingEngines = await scoping.listEngineInstances(db, clerkUserId, companyId);
    const occupied: LayoutRect[] = existingEngines
      .map((row) => row.canvasBounds)
      .filter((bounds): bounds is LayoutRect => bounds != null);
    // Preview at origin 0 to measure the type-lane envelope, then place without overlap.
    const preview = layoutEngineTemplateAtOrigin(
      engine.modules,
      engine.links,
      { x: 0, y: 0 },
      ENGINE_GROUP_PADDING,
    );
    const section = engineCreateSection(engine);
    let familyAnchor: LayoutRect | undefined;
    if (section === 'execution') {
      const depIds = researchDependenciesForExecutionEngine(engine.id);
      const depBounds = existingEngines
        .filter((row) => depIds.includes(row.templateId) && row.canvasBounds != null)
        .map((row) => row.canvasBounds as LayoutRect);
      if (depBounds.length > 0) {
        const minX = Math.min(...depBounds.map((b) => b.x));
        const minY = Math.min(...depBounds.map((b) => b.y));
        const maxRight = Math.max(...depBounds.map((b) => b.x + b.width));
        const maxBottom = Math.max(...depBounds.map((b) => b.y + b.height));
        familyAnchor = {
          x: minX,
          y: minY,
          width: maxRight - minX,
          height: maxBottom - minY,
        };
      }
    } else if (section === 'research') {
      // Anchor left of the first execution peer that declares this pack as a dependency.
      const execPeer = existingEngines.find((row) => {
        if (!row.canvasBounds) return false;
        return researchDependenciesForExecutionEngine(row.templateId).includes(engine.id);
      });
      if (execPeer?.canvasBounds) {
        familyAnchor = execPeer.canvasBounds as LayoutRect;
      }
    }
    const origin = placeNextEngineOrigin(
      occupied,
      { width: preview.canvasBounds.width, height: preview.canvasBounds.height },
      {
        ...(input.canvasOffset
          ? {
              preferred: {
                x: input.canvasOffset.x,
                y: input.canvasOffset.y,
              },
            }
          : {}),
        originX: CANVAS_LAYOUT.originX,
        originY: CANVAS_LAYOUT.originY,
        section,
        ...(familyAnchor ? { familyAnchor } : {}),
      },
    );
    const laid = layoutEngineTemplateAtOrigin(
      engine.modules,
      engine.links,
      origin,
      ENGINE_GROUP_PADDING,
    );
    const canvasBounds = laid.canvasBounds;
    const absolutePositions = laid.modulePositions;
    const cascadeFromCompany = input.cascadeFromCompany !== false;
    const setup = resolveEngineSetupFromCompany(
      input.setup,
      {
        sectorFocuses: company.sectorFocuses ?? [],
        seedCreditsCents: company.seedCreditsCents,
      },
      cascadeFromCompany,
    );
    const masterTopicSectors = setup.topicSectors ?? [];
    const setupSnapshot = engineSetupSnapshotFromInput(
      setup,
      null,
      input.simulationBinding ? { simulationBinding: input.simulationBinding } : undefined,
    );
    const templateInputs = input.inputs ?? {};

    const clock = createSystemClock();
    const [engineRow] = await db
      .insert(engineInstances)
      .values({
        companyId,
        templateId: engine.id,
        label: engine.label,
        masterTopicSectors,
        setupSnapshot,
        templateInputs,
        canvasBounds,
      })
      .returning();
    if (!engineRow) throw new ApiError(500, 'engine_instance_create_failed');

    const engineRefs = await recordEngineSetupRefs(db, clock, companyId, engineRow.id, setup);
    let persistedEngine = engineRow;
    if (Object.keys(engineRefs).length > 0) {
      const [updatedEngine] = await db
        .update(engineInstances)
        .set({ ...engineRefs, updatedAt: new Date() })
        .where(eq(engineInstances.id, engineRow.id))
        .returning();
      if (updatedEngine) persistedEngine = updatedEngine;
    }

    const parsedConfigs = configs.map((config, index) =>
      MODULE_CONFIG_SCHEMAS[engine.modules[index]!.type].parse(config),
    );

    const created = await db
      .insert(modules)
      .values(
        engine.modules.map((m, index) => {
          const config = parsedConfigs[index];
          const fn = moduleFunctionLabel(m.type, config);
          const name = deriveGeneratedModuleName({
            type: m.type,
            baseName: fn,
            config,
            topicSectors: setup?.topicSectors ?? [],
          });
          return {
            companyId,
            type: m.type,
            name,
            generatedNameBase: fn,
            nameCustomized: false,
            config,
            status: 'draft' as const,
            canvasPosition: absolutePositions[index],
            engineInstanceId: engineRow.id,
            topicSectorsOverridden: false,
          };
        }),
      )
      .returning();

    if (setup) {
      await cascadeEngineSetup(db, companyId, engineRow.id, setup);
    }

    const dedicatedMath = await provisionDedicatedMathTools(
      db,
      companyId,
      created.map((row, index) => ({
        id: row.id,
        type: row.type,
        name: moduleFunctionLabel(row.type, parsedConfigs[index]),
        position: absolutePositions[index]!,
        config: parsedConfigs[index],
      })),
    );
    const dedicatedMathByOwner = new Map(
      dedicatedMath.map((tool) => [tool.ownerModuleId, tool.id]),
    );

    const createdLinks = [];
    createdLinks.push(...dedicatedMath.flatMap((tool) => tool.links));
    if (engine.links.length > 0) {
      const linkValues = engine.links.map((l) => {
        const fromModuleId = l.fromIndex === 'math' ? mathModule!.id : created[l.fromIndex]?.id;
        const toModuleId = l.toIndex === 'math' ? mathModule!.id : created[l.toIndex]?.id;
        if (!fromModuleId || !toModuleId) {
          throw new ApiError(500, 'engine_link_unresolved');
        }
        return {
          companyId,
          fromModuleId,
          toModuleId,
          linkKind: l.linkKind,
        };
      });
      const insertedLinks = await db.insert(moduleLinks).values(linkValues).returning();
      createdLinks.push(...insertedLinks);
    }

    const routerToMath = fundRouterToTradingMathLinks(
      companyId,
      created.map((row) => ({ id: row.id, type: row.type })),
      dedicatedMathByOwner,
    );
    if (routerToMath.length > 0) {
      const insertedRouterLinks = await db
        .insert(moduleLinks)
        .values(routerToMath)
        .onConflictDoNothing()
        .returning();
      createdLinks.push(...insertedRouterLinks);
    }

    await refreshGeneratedModuleNames(db, companyId, [
      ...(mathModule ? [mathModule.id] : []),
      ...created.map((row) => row.id),
      ...dedicatedMath.map((tool) => tool.id),
    ]);

    const timeHub = await provisionEngineTimeHub(
      db,
      companyId,
      engineRow.id,
      created.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        position: (row.canvasPosition as { x: number; y: number }) ?? { x: 0, y: 0 },
      })),
    );
    if (timeHub) {
      createdLinks.push(
        ...timeHub.links.map((link) => ({
          id: link.id,
          companyId,
          fromModuleId: link.fromModuleId,
          toModuleId: link.toModuleId,
          linkKind: link.linkKind as 'data_feed',
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }

    await ensureEngineMotherboardUtilities(db, companyId, engineRow.id);
    try {
      await bootstrapCompanyKnowledge({ db, companyId });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on engine create', err);
    }
    const dataHub = await ensureEngineDataHub(db, companyId, engineRow.id);

    // D-153: when a research pack lands, re-nest/wire Data Hubs on execution engines that declare it.
    if (engineCreateSection(engine) === 'research') {
      const peers = await scoping.listEngineInstances(db, clerkUserId, companyId);
      for (const peer of peers) {
        if (peer.id === engineRow.id) continue;
        const deps = researchDependenciesForExecutionEngine(peer.templateId);
        if (!deps.includes(engine.id)) continue;
        try {
          await ensureEngineDataHub(db, companyId, peer.id);
        } catch (err) {
          console.error('ensureEngineDataHub failed on research-dep sync', peer.id, err);
        }
      }
    }

    // D-159: reflow all families so research | hub | exec stay aligned after insert.
    let familyLayout: Awaited<ReturnType<typeof reflowCompanyFamilyLayout>>['layout'] | null =
      null;
    try {
      const reflowed = await reflowCompanyFamilyLayout(db, companyId);
      familyLayout = reflowed.layout;
      const [updatedEngine] = await db
        .select()
        .from(engineInstances)
        .where(eq(engineInstances.id, engineRow.id))
        .limit(1);
      if (updatedEngine) persistedEngine = updatedEngine;
    } catch (err) {
      console.error('reflowCompanyFamilyLayout failed on engine insert', err);
    }

    try {
      await resolveCompanyServiceBindings(db, clerkUserId, companyId);
    } catch (err) {
      console.error('resolveCompanyServiceBindings failed on engine create', err);
    }

    // Company-wide utility links so the canvas can draw every engine↔engine edge
    // (including data_in rows on peer engines that reference this engine as from).
    const utilityLinks = await listEngineUtilityLinks(db, companyId);
    const refreshedModules = await scoping.listModules(db, clerkUserId, companyId);
    const memberIds = new Set(created.map((m) => m.id));
    if (timeHub) memberIds.add(timeHub.id);
    return {
      engine: serializeEngine(persistedEngine, [...memberIds]),
      modules: refreshedModules.filter(
        (m) =>
          memberIds.has(m.id) ||
          dedicatedMath.some((tool) => tool.id === m.id) ||
          (timeHub != null && m.id === timeHub.id) ||
          (dataHub.hubModuleId != null && m.id === dataHub.hubModuleId),
      ),
      links: createdLinks,
      dataHub: {
        hubModuleId: dataHub.hubModuleId,
        hubLibraryId: dataHub.hubLibraryId,
        nestedModuleIds: dataHub.nestedModuleIds,
      },
      familyLayout,
      utilityLinks: utilityLinks.map((row) => ({
        id: row.id,
        toEngineId: row.toEngineId,
        bus: row.bus,
        fromEngineId: row.fromEngineId,
        fromModuleId: row.fromModuleId,
        streamId: row.streamId,
        streamDescriptor: row.streamDescriptor,
      })),
    };
  });
}
