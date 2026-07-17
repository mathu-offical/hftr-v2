import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  COMPANY_TEMPLATES,
  CompanyTemplateId,
  computeEngineBoundsFromPositions,
  CreateCompanyInput,
  DEFAULT_PHILOSOPHY_PROFILE,
  listResolvedEngineTemplates,
  MODULE_CONFIG_SCHEMAS,
  moduleRequiresMath,
  requiredModuleSetupFields,
  withDefaultEngineSetup,
  type ModuleSetupInput,
} from '@hftr/contracts';
import { companies, engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock, loadSessionConstraints } from '@hftr/engine';
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
const MAX_MODULES_PER_COMPANY = 60;

function setupForTemplateModule(
  moduleIndex: number,
  input: z.infer<typeof CreateCompanyInput>,
): ModuleSetupInput | undefined {
  const perModule = input.templateModuleSetups?.find((entry) => entry.moduleIndex === moduleIndex);
  return perModule?.setup ?? input.templateSetup;
}

function collectMasterTopics(
  templateModuleCount: number,
  input: z.infer<typeof CreateCompanyInput>,
): string[] {
  const topics = new Set<string>();
  for (let index = 0; index < templateModuleCount; index += 1) {
    const setup = setupForTemplateModule(index, input);
    for (const topic of setup?.topicSectors ?? []) {
      topics.add(topic);
    }
  }
  if (topics.size === 0) {
    for (const topic of input.templateSetup?.topicSectors ?? []) {
      topics.add(topic);
    }
  }
  return [...topics];
}

function collectEngineExit(
  templateModuleCount: number,
  input: z.infer<typeof CreateCompanyInput>,
): Pick<ModuleSetupInput, 'targetExitAt' | 'timezone'> {
  for (let index = 0; index < templateModuleCount; index += 1) {
    const setup = setupForTemplateModule(index, input);
    if (setup?.targetExitAt) {
      return { targetExitAt: setup.targetExitAt, timezone: setup.timezone };
    }
  }
  if (input.templateSetup?.targetExitAt) {
    return {
      targetExitAt: input.templateSetup.targetExitAt,
      timezone: input.templateSetup.timezone,
    };
  }
  return {};
}

function anyCapitalSetup(
  templateModuleCount: number,
  input: z.infer<typeof CreateCompanyInput>,
): boolean {
  for (let index = 0; index < templateModuleCount; index += 1) {
    if (setupForTemplateModule(index, input)?.capitalAllocation) return true;
  }
  return Boolean(input.templateSetup?.capitalAllocation);
}

export async function GET() {
  return withAuth(async ({ db, clerkUserId }) => {
    const rows = await scoping.listCompanies(db, clerkUserId);
    return { companies: rows };
  });
}

export async function POST(req: Request) {
  return withAuth(async ({ db, clerkUserId }) => {
    const input = await parseBody(
      req,
      CreateCompanyInput.and(z.object({ template: CompanyTemplateId.default('blank') })),
    );

    const existing = await scoping.listCompanies(db, clerkUserId);
    if (existing.length >= MAX_COMPANIES_PER_USER) {
      throw new ApiError(422, 'company_limit_reached');
    }

    const inserted = await db
      .insert(companies)
      .values({
        clerkUserId,
        name: input.name,
        philosophyPrompt: input.philosophyPrompt,
        philosophyProfile: DEFAULT_PHILOSOPHY_PROFILE,
        mode: input.mode,
        seedCreditsCents: BigInt(input.seedCreditsCents),
      })
      .returning();
    const company = inserted[0]!;
    const template = COMPANY_TEMPLATES[input.template];
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
        config: {},
        status: 'active',
        canvasPosition: template.mathPosition ?? { x: 320, y: 40 },
      })
      .returning({ id: modules.id });
    if (!mathModule) {
      throw new ApiError(500, 'math_module_create_failed');
    }
    createdModuleIds.push(mathModule.id);

    let maxTemplateX = 0;
    let maxTemplateY = 0;

    // Template modules + links (D-016) wrapped in an ENGINE group (D-028).
    if (template.modules.length > 0) {
      const parsedConfigs = template.modules.map((module) =>
        MODULE_CONFIG_SCHEMAS[module.type].parse(module.config),
      );
      const masterTopicSectors = collectMasterTopics(template.modules.length, input);
      const exitFields = collectEngineExit(template.modules.length, input);
      const canvasBounds = computeEngineBoundsFromPositions(
        template.modules.map((m) => m.position),
      );
      const engineTemplateId =
        input.template === 'day_trading_starter'
          ? 'engine_day_trading'
          : input.template === 'trend_research_lab'
            ? 'engine_trend_research'
            : input.template;
      const capitalConfigured = anyCapitalSetup(template.modules.length, input);
      const hasCapitalBearing = template.modules.some((module) =>
        requiredModuleSetupFields(module.type).includes('capital_allocation'),
      );
      const hasExitBearing = template.modules.some((module) =>
        requiredModuleSetupFields(module.type).includes('target_exit'),
      );
      // Always seed engine chrome with capital/exit defaults when the template
      // includes capital-bearing members — even on "Skip setup" (D-035).
      const engineSetup: ModuleSetupInput | undefined =
        hasCapitalBearing || hasExitBearing || masterTopicSectors.length > 0
          ? withDefaultEngineSetup(
              {
                topicSectors: masterTopicSectors,
                capitalAllocation: input.templateSetup?.capitalAllocation,
                ...exitFields,
              },
              Number(input.seedCreditsCents),
            )
          : undefined;
      const setupSnapshot = engineSetupSnapshotFromInput(engineSetup);
      const [engineRow] = await db
        .insert(engineInstances)
        .values({
          companyId: company.id,
          templateId: engineTemplateId,
          label: template.label,
          masterTopicSectors,
          setupSnapshot,
          templateInputs: {},
          canvasBounds,
        })
        .returning({ id: engineInstances.id });
      if (!engineRow) throw new ApiError(500, 'engine_instance_create_failed');

      if (engineSetup?.capitalAllocation || engineSetup?.targetExitAt) {
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
      }

      const created = await db
        .insert(modules)
        .values(
          template.modules.map((m, index) => ({
            companyId: company.id,
            type: m.type,
            name: m.name,
            generatedNameBase: m.name,
            nameCustomized: false,
            config: parsedConfigs[index],
            status: 'draft' as const,
            canvasPosition: m.position,
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
          type: template.modules[index]!.type,
          name: template.modules[index]!.name,
          position: template.modules[index]!.position,
        })),
      );
      for (const tool of dedicatedMath) createdModuleIds.push(tool.id);
      const dedicatedMathByOwner = new Map(
        dedicatedMath.map((tool) => [tool.ownerModuleId, tool.id]),
      );
      for (const module of template.modules) {
        maxTemplateX = Math.max(maxTemplateX, module.position.x);
        maxTemplateY = Math.max(maxTemplateY, module.position.y);
      }

      for (let index = 0; index < created.length; index += 1) {
        const createdModule = created[index];
        const templateModule = template.modules[index];
        const config = parsedConfigs[index];
        if (!createdModule || !templateModule || !config) {
          throw new ApiError(500, 'template_module_unresolved');
        }
        const setupPatch = await recordModuleSetup(
          db,
          clock,
          company.id,
          createdModule.id,
          templateModule.type,
          config as Record<string, unknown>,
          setupForTemplateModule(index, input),
        );
        if (Object.keys(setupPatch).length > 0) {
          await db.update(modules).set(setupPatch).where(eq(modules.id, createdModule.id));
        }
      }
      // When the operator skipped or left capital blank, cascade the envelope
      // as an equal split (and overall exit) onto included members.
      if (engineSetup && (!capitalConfigured || !exitFields.targetExitAt)) {
        await cascadeEngineSetup(db, company.id, engineRow.id, {
          capitalAllocation: capitalConfigured ? undefined : engineSetup.capitalAllocation,
          targetExitAt: exitFields.targetExitAt ? undefined : engineSetup.targetExitAt,
          timezone: exitFields.timezone ?? engineSetup.timezone,
        });
      }
      if (template.links.length > 0) {
        await db.insert(moduleLinks).values(
          template.links.map((l) => {
            const fromModuleId = l.fromIndex === 'math' ? mathModule.id : created[l.fromIndex]?.id;
            const toModuleId = l.toIndex === 'math' ? mathModule.id : created[l.toIndex]?.id;
            if (!fromModuleId || !toModuleId) {
              throw new ApiError(500, 'template_link_unresolved');
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
          type: template.modules[index]!.type,
        })),
        dedicatedMathByOwner,
      );
      if (routerToMath.length > 0) {
        await db.insert(moduleLinks).values(routerToMath).onConflictDoNothing();
      }
    }

    const extraModules = input.extraModules ?? [];
    const extraEngines = input.extraEngines ?? [];
    const projectedCount =
      1 +
      template.modules.length +
      template.modules.filter((module) => moduleRequiresMath(module.type)).length +
      extraModules.length +
      extraModules.filter((module) => moduleRequiresMath(module.type)).length +
      extraEngines.reduce((sum, engine) => {
        const resolved = listResolvedEngineTemplates(new Set(loadSessionConstraints().keys())).find(
          (item) => item.id === engine.templateId,
        );
        return (
          sum +
          (resolved?.modules.length ?? 0) +
          (resolved?.modules.filter((module) => moduleRequiresMath(module.type)).length ?? 0)
        );
      }, 0);
    if (projectedCount > MAX_MODULES_PER_COMPANY) {
      throw new ApiError(422, 'module_limit_reached');
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

    const sessionIds = new Set(loadSessionConstraints().keys());
    const engineCatalog = listResolvedEngineTemplates(sessionIds);
    for (let engineIndex = 0; engineIndex < extraEngines.length; engineIndex += 1) {
      const seed = extraEngines[engineIndex]!;
      const engine = engineCatalog.find((item) => item.id === seed.templateId);
      if (!engine) throw new ApiError(422, 'engine_template_not_found');
      if (!engine.available) {
        throw new ApiError(422, engine.unavailableReason ?? 'engine_template_unavailable');
      }

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
        x: maxTemplateX + 360 + engineIndex * 200,
        y: 40 + engineIndex * 40,
      };
      const absolutePositions = engine.modules.map((m) => ({
        x: m.position.x + offset.x,
        y: m.position.y + offset.y,
      }));
      const canvasBounds = computeEngineBoundsFromPositions(absolutePositions);
      const masterTopicSectors = seed.setup?.topicSectors ?? [];
      const engineSetup = withDefaultEngineSetup(seed.setup, Number(input.seedCreditsCents));
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

    await refreshGeneratedModuleNames(db, company.id, createdModuleIds);

    return { company };
  });
}
