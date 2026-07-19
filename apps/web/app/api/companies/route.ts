import { and, eq } from 'drizzle-orm';
import {
  CANVAS_LAYOUT,
  CreateCompanyInput,
  DEFAULT_PHILOSOPHY_PROFILE,
  deriveGeneratedModuleName,
  ENGINE_GROUP_PADDING,
  layoutEngineTemplateAtOrigin,
  listResolvedEngineTemplates,
  MAX_MODULES_PER_COMPANY,
  MODULE_CONFIG_SCHEMAS,
  moduleFunctionLabel,
  placeNextEngineOrigin,
  projectedModuleSlotsForCreate,
  withDefaultEngineSetup,
  templateInputTargets,
  expandEngineSeedsWithResearchDeps,
  engineCreateSection,
  researchDependenciesForExecutionEngine,
  type LayoutRect,
} from '@hftr/contracts';
import { companies, engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { bootstrapCompanyKnowledge, createSystemClock, loadSessionConstraints, resolveCompanyServiceBindings, ensureEngineMotherboardUtilities, ensureEngineDataHub, reflowCompanyFamilyLayout } from '@hftr/engine';
import { provisionEngineTimeHub } from '@/lib/time-provision';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import {
  cascadeEngineSetup,
  engineSetupSnapshotFromInput,
  recordEngineSetupRefs,
} from '@/lib/engine-setup-cascade';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';
import { recordModuleSetup } from '@/lib/module-setup';
import { provisionDedicatedMathTools } from '@/lib/math-provision';
import { fundRouterToTradingMathLinks } from '@/lib/fund-route-links';

export const dynamic = 'force-dynamic';

const MAX_COMPANIES_PER_USER = 20;

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const rows = await scoping.listCompanies(db, clerkUserId);
    return { companies: rows };
  });
}

/**
 * Company create (D-043): Math hub + required engines (≥1) + optional standalone modules.
 * Company graph templates are client quick-adds only — API seeds solely from `engines`.
 */
export async function POST(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(req, CreateCompanyInput);

    const existing = await scoping.listCompanies(db, clerkUserId);
    if (existing.length >= MAX_COMPANIES_PER_USER) {
      throw new ApiError(422, 'company_limit_reached');
    }

    const sessionIds = new Set(loadSessionConstraints().keys());
    const engineCatalog = listResolvedEngineTemplates(sessionIds);
    const availableIds = new Set(
      engineCatalog.filter((item) => item.available).map((item) => item.id),
    );
    // D-153: expand execution seeds with use-case research packs (idempotent if UI already sent them).
    const engineSeeds = expandEngineSeedsWithResearchDeps(input.engines, {
      availableTemplateIds: availableIds,
    });
    if (engineSeeds.length > 10) {
      throw new ApiError(422, 'engine_limit_reached');
    }
    for (const seed of engineSeeds) {
      const engine = engineCatalog.find((item) => item.id === seed.templateId);
      if (!engine) throw new ApiError(422, 'engine_template_not_found');
      if (!engine.available) {
        throw new ApiError(422, engine.unavailableReason ?? 'engine_template_unavailable');
      }
    }

    const extraModules = input.extraModules ?? [];
    const projectedCount = projectedModuleSlotsForCreate({
      engineModuleTypes: engineSeeds.map((seed) => {
        const resolved = engineCatalog.find((item) => item.id === seed.templateId);
        return (resolved?.modules ?? []).map((module) => module.type);
      }),
      extraModuleTypes: extraModules.map((module) => module.type),
    });
    if (projectedCount > MAX_MODULES_PER_COMPANY) {
      throw new ApiError(422, 'module_limit_reached');
    }

    const seedCents = BigInt(input.seedCreditsCents);
    const inserted = await db
      .insert(companies)
      .values({
        clerkUserId,
        name: input.name,
        philosophyPrompt: input.philosophyPrompt,
        sectorFocuses: input.sectorFocuses,
        universeExcludes: input.universeExcludes ?? [],
        philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE,
        mode: input.mode,
        seedCreditsCents: seedCents,
        // Cash-only opening projection until mark-aware recompute runs.
        equityCents: seedCents,
        equityStatus: 'fresh',
        equityAsOf: new Date(),
        equityVersion: 0,
      })
      .returning();
    const company = inserted[0]!;
    const clock = createSystemClock();
    const createdModuleIds: string[] = [];
    const createdEngineIds: string[] = [];

    // Every company gets its Math hub (D-008) and Master Clock (D-088).
    const [mathModule] = await db
      .insert(modules)
      .values({
        companyId: company.id,
        type: 'math',
        name: 'Math · —',
        generatedNameBase: 'Math',
        nameCustomized: false,
        config: { mathType: 'company_hub' },
        status: 'active',
        canvasPosition: { x: 320, y: 40 },
      })
      .returning({ id: modules.id });
    if (!mathModule) {
      throw new ApiError(500, 'math_module_create_failed');
    }
    createdModuleIds.push(mathModule.id);

    const [clockModule] = await db
      .insert(modules)
      .values({
        companyId: company.id,
        type: 'clock',
        name: 'Clock · —',
        generatedNameBase: 'Clock',
        nameCustomized: false,
        config: { timezone: 'America/New_York', displayMode: 'session' },
        status: 'active',
        canvasPosition: { x: 80, y: 720 },
      })
      .returning({ id: modules.id });
    if (!clockModule) {
      throw new ApiError(500, 'clock_module_create_failed');
    }
    createdModuleIds.push(clockModule.id);

    let maxTemplateX = 0;
    let maxTemplateY = 0;
    const occupiedEngineBounds: LayoutRect[] = [];

    for (let engineIndex = 0; engineIndex < engineSeeds.length; engineIndex += 1) {
      const seed = engineSeeds[engineIndex]!;
      const engine = engineCatalog.find((item) => item.id === seed.templateId)!;

      const configs = engine.modules.map((m) => ({ ...m.config }));
      const grouped = new Map<string, string[]>();
      for (const engineInput of engine.inputs) {
        const value = seed.inputs[engineInput.key]?.trim();
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

      const preview = layoutEngineTemplateAtOrigin(
        engine.modules,
        engine.links,
        { x: 0, y: 0 },
        ENGINE_GROUP_PADDING,
      );
      const size = {
        width: preview.canvasBounds.width,
        height: preview.canvasBounds.height,
      };
      const section = engineCreateSection(engine);
      let familyAnchor: LayoutRect | undefined;
      if (section === 'execution') {
        const depIds = researchDependenciesForExecutionEngine(engine.id);
        // Match occupied bounds to already-placed research seeds in this create pass.
        const depTemplateIds = new Set(depIds);
        const placedResearch: LayoutRect[] = [];
        for (let i = 0; i < engineIndex; i += 1) {
          const priorSeed = engineSeeds[i]!;
          if (!depTemplateIds.has(priorSeed.templateId)) continue;
          const priorBounds = occupiedEngineBounds[i];
          if (priorBounds) placedResearch.push(priorBounds);
        }
        if (placedResearch.length > 0) {
          const minX = Math.min(...placedResearch.map((b) => b.x));
          const minY = Math.min(...placedResearch.map((b) => b.y));
          const maxRight = Math.max(...placedResearch.map((b) => b.x + b.width));
          const maxBottom = Math.max(...placedResearch.map((b) => b.y + b.height));
          familyAnchor = {
            x: minX,
            y: minY,
            width: maxRight - minX,
            height: maxBottom - minY,
          };
        }
      }
      const origin = seed.canvasOffset
        ? placeNextEngineOrigin(occupiedEngineBounds, size, {
            preferred: {
              x: seed.canvasOffset.x,
              y: seed.canvasOffset.y,
            },
            section,
            ...(familyAnchor ? { familyAnchor } : {}),
          })
        : placeNextEngineOrigin(occupiedEngineBounds, size, {
            originX: CANVAS_LAYOUT.originX,
            originY: CANVAS_LAYOUT.originY,
            section,
            ...(familyAnchor ? { familyAnchor } : {}),
          });
      const laid = layoutEngineTemplateAtOrigin(
        engine.modules,
        engine.links,
        origin,
        ENGINE_GROUP_PADDING,
      );
      const canvasBounds = laid.canvasBounds;
      occupiedEngineBounds.push(canvasBounds);
      const absolutePositions = laid.modulePositions;
      const masterTopicSectors =
        seed.setup?.topicSectors && seed.setup.topicSectors.length > 0
          ? seed.setup.topicSectors
          : input.sectorFocuses;
      const engineSetup = withDefaultEngineSetup(
        {
          ...seed.setup,
          ...(masterTopicSectors.length > 0 ? { topicSectors: masterTopicSectors } : {}),
        },
        Number(input.seedCreditsCents),
      );
      const setupSnapshot = engineSetupSnapshotFromInput(engineSetup);

      const [engineRow] = await db
        .insert(engineInstances)
        .values({
          companyId: company.id,
          templateId: engine.id,
          label: engine.label,
          masterTopicSectors,
          setupSnapshot,
          templateInputs: seed.inputs ?? {},
          canvasBounds,
        })
        .returning({ id: engineInstances.id });
      if (!engineRow) throw new ApiError(500, 'engine_instance_create_failed');
      createdEngineIds.push(engineRow.id);

      const engineRefs = await recordEngineSetupRefs(
        db,
        clock,
        company.id,
        engineRow.id,
        engineSetup,
      );
      if (Object.keys(engineRefs).length > 0) {
        await db
          .update(engineInstances)
          .set({ ...engineRefs, updatedAt: new Date() })
          .where(eq(engineInstances.id, engineRow.id));
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
              topicSectors: masterTopicSectors,
            });
            return {
              companyId: company.id,
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
        .returning({ id: modules.id });
      for (const row of created) {
        createdModuleIds.push(row.id);
      }
      const dedicatedMath = await provisionDedicatedMathTools(
        db,
        company.id,
        created.map((row, index) => ({
          id: row.id,
          type: engine.modules[index]!.type,
          name: moduleFunctionLabel(engine.modules[index]!.type, parsedConfigs[index]),
          position: absolutePositions[index]!,
          config: parsedConfigs[index],
        })),
      );
      for (const tool of dedicatedMath) createdModuleIds.push(tool.id);
      const dedicatedMathByOwner = new Map(
        dedicatedMath.map((tool) => [tool.ownerModuleId, tool.id]),
      );
      for (const position of absolutePositions) {
        maxTemplateX = Math.max(maxTemplateX, position.x);
        maxTemplateY = Math.max(maxTemplateY, position.y);
      }

      await cascadeEngineSetup(db, company.id, engineRow.id, engineSetup);

      if (engine.links.length > 0) {
        await db.insert(moduleLinks).values(
          engine.links.map((l) => {
            const fromModuleId = l.fromIndex === 'math' ? mathModule.id : created[l.fromIndex]?.id;
            const toModuleId = l.toIndex === 'math' ? mathModule.id : created[l.toIndex]?.id;
            if (!fromModuleId || !toModuleId) {
              throw new ApiError(500, 'engine_link_unresolved');
            }
            return {
              companyId: company.id,
              fromModuleId,
              toModuleId,
              linkKind: l.linkKind,
            };
          }),
        );
      }
      const routerToMath = fundRouterToTradingMathLinks(
        company.id,
        created.map((row, index) => ({
          id: row.id,
          type: engine.modules[index]!.type,
        })),
        dedicatedMathByOwner,
      );
      if (routerToMath.length > 0) {
        await db.insert(moduleLinks).values(routerToMath).onConflictDoNothing();
      }
    }

    for (let index = 0; index < extraModules.length; index += 1) {
      const extra = extraModules[index]!;
      if (extra.type === 'math') {
        throw new ApiError(422, 'extra_math_not_allowed');
      }
      const config = MODULE_CONFIG_SCHEMAS[extra.type].parse(extra.config ?? {});
      const position = extra.canvasPosition ?? {
        x: 20 + (index % 3) * 300,
        y: maxTemplateY + 320 + Math.floor(index / 3) * 260,
      };
      const fn = moduleFunctionLabel(extra.type, config);
      const name = deriveGeneratedModuleName({
        type: extra.type,
        baseName: fn,
        config,
        topicSectors: extra.setup?.topicSectors ?? [],
      });
      const [createdModule] = await db
        .insert(modules)
        .values({
          companyId: company.id,
          type: extra.type,
          name,
          generatedNameBase: fn,
          nameCustomized: false,
          config,
          status: 'draft',
          canvasPosition: position,
          engineInstanceId: null,
          topicSectorsOverridden: false,
        })
        .returning({ id: modules.id });
      if (!createdModule) throw new ApiError(500, 'extra_module_create_failed');
      createdModuleIds.push(createdModule.id);
      const extraMath = await provisionDedicatedMathTools(db, company.id, [
        {
          id: createdModule.id,
          type: extra.type,
          name: fn,
          position,
          config,
        },
      ]);
      for (const tool of extraMath) createdModuleIds.push(tool.id);
      maxTemplateX = Math.max(maxTemplateX, position.x);
      maxTemplateY = Math.max(maxTemplateY, position.y);

      const setupPatch = await recordModuleSetup(
        db,
        clock,
        company.id,
        createdModule.id,
        extra.type,
        config as Record<string, unknown>,
        extra.setup,
      );
      if (Object.keys(setupPatch).length > 0) {
        await db.update(modules).set(setupPatch).where(eq(modules.id, createdModule.id));
      }
    }

    await refreshGeneratedModuleNames(db, company.id, createdModuleIds);

    for (const engineId of createdEngineIds) {
      const engineMembers = await db
        .select({
          id: modules.id,
          type: modules.type,
          name: modules.name,
          canvasPosition: modules.canvasPosition,
        })
        .from(modules)
        .where(and(eq(modules.companyId, company.id), eq(modules.engineInstanceId, engineId)));
      await provisionEngineTimeHub(
        db,
        company.id,
        engineId,
        engineMembers.map((m) => ({
          id: m.id,
          type: m.type,
          name: m.name,
          position: (m.canvasPosition as { x: number; y: number }) ?? { x: 0, y: 0 },
        })),
      );
      await ensureEngineMotherboardUtilities(db, company.id, engineId);
    }

    // Compile-time catalog mechanisms → libraries + galaxy concepts + hybrid topic (D-045).
    try {
      await bootstrapCompanyKnowledge({ db, companyId: company.id });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on company create', err);
    }

    // D-140: provision Engine Data Hubs after library rows exist so nests resolve.
    const executionEngineIds = await db
      .select({ id: engineInstances.id, templateId: engineInstances.templateId })
      .from(engineInstances)
      .where(eq(engineInstances.companyId, company.id));
    for (const row of executionEngineIds) {
      try {
        await ensureEngineDataHub(db, company.id, row.id);
      } catch (err) {
        console.error('ensureEngineDataHub failed on company create', err);
      }
    }

    // D-159: stack research | hub | exec families and persist before first paint.
    try {
      await reflowCompanyFamilyLayout(db, company.id);
    } catch (err) {
      console.error('reflowCompanyFamilyLayout failed on company create', err);
    }

    // Persist module↔service coverage from any already-verified brokers (D-090).
    try {
      await resolveCompanyServiceBindings(db, clerkUserId, company.id);
    } catch (err) {
      console.error('resolveCompanyServiceBindings failed on company create', err);
    }

    return { company };
  });
}
