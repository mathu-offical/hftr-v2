import { eq } from 'drizzle-orm';
import {
  computeEngineBoundsFromPositions,
  CreateCompanyInput,
  DEFAULT_PHILOSOPHY_PROFILE,
  listResolvedEngineTemplates,
  MAX_MODULES_PER_COMPANY,
  MODULE_CONFIG_SCHEMAS,
  projectedModuleSlotsForCreate,
  withDefaultEngineSetup,
} from '@hftr/contracts';
import { companies, engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import {
  bootstrapCompanyKnowledge,
  createSystemClock,
  loadSessionConstraints,
} from '@hftr/engine';
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
    for (const seed of input.engines) {
      const engine = engineCatalog.find((item) => item.id === seed.templateId);
      if (!engine) throw new ApiError(422, 'engine_template_not_found');
      if (!engine.available) {
        throw new ApiError(422, engine.unavailableReason ?? 'engine_template_unavailable');
      }
    }

    const extraModules = input.extraModules ?? [];
    const projectedCount = projectedModuleSlotsForCreate({
      engineModuleTypes: input.engines.map((seed) => {
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

    // Every company gets its non-deletable Math module (D-008).
    const [mathModule] = await db
      .insert(modules)
      .values({
        companyId: company.id,
        type: 'math',
        name: 'Deterministic Math Calculator',
        generatedNameBase: 'Deterministic Math Calculator',
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

    let maxTemplateX = 0;
    let maxTemplateY = 0;

    for (let engineIndex = 0; engineIndex < input.engines.length; engineIndex += 1) {
      const seed = input.engines[engineIndex]!;
      const engine = engineCatalog.find((item) => item.id === seed.templateId)!;

      const configs = engine.modules.map((m) => ({ ...m.config }));
      const grouped = new Map<string, string[]>();
      for (const engineInput of engine.inputs) {
        const value = seed.inputs[engineInput.key]?.trim();
        if (!value) continue;
        const mapKey = `${engineInput.target.moduleIndex}:${engineInput.target.configKey}`;
        grouped.set(mapKey, [...(grouped.get(mapKey) ?? []), value]);
      }
      for (const [mapKey, values] of grouped) {
        const [idx, configKey] = mapKey.split(':') as [string, string];
        configs[Number(idx)]![configKey] = values.join(' — ');
      }

      const offset = seed.canvasOffset ?? {
        x: 40 + engineIndex * 200,
        y: 40 + engineIndex * 40,
      };
      const absolutePositions = engine.modules.map((m) => ({
        x: m.position.x + offset.x,
        y: m.position.y + offset.y,
      }));
      const canvasBounds = computeEngineBoundsFromPositions(absolutePositions);
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
          engine.modules.map((m, index) => ({
            companyId: company.id,
            type: m.type,
            name: m.name,
            generatedNameBase: m.name,
            nameCustomized: false,
            config: parsedConfigs[index],
            status: 'draft' as const,
            canvasPosition: absolutePositions[index],
            engineInstanceId: engineRow.id,
            topicSectorsOverridden: false,
          })),
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
          name: engine.modules[index]!.name,
          position: absolutePositions[index]!,
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
      const [createdModule] = await db
        .insert(modules)
        .values({
          companyId: company.id,
          type: extra.type,
          name: extra.name,
          generatedNameBase: extra.name,
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
          name: extra.name,
          position,
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

    // Compile-time catalog mechanisms → libraries + galaxy concepts + hybrid topic (D-045).
    try {
      await bootstrapCompanyKnowledge({ db, companyId: company.id });
    } catch (err) {
      console.error('bootstrapCompanyKnowledge failed on company create', err);
    }

    return { company };
  });
}
