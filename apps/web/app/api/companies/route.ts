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
  type ModuleSetupInput,
  type ModuleType,
} from '@hftr/contracts';
import { companies, engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock, loadSessionConstraints } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';
import { recordModuleSetup } from '@/lib/module-setup';

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
      const canvasBounds = computeEngineBoundsFromPositions(
        template.modules.map((m) => m.position),
      );
      const engineTemplateId =
        input.template === 'day_trading_starter'
          ? 'engine_day_trading'
          : input.template === 'trend_research_lab'
            ? 'engine_trend_research'
            : input.template;
      const [engineRow] = await db
        .insert(engineInstances)
        .values({
          companyId: company.id,
          templateId: engineTemplateId,
          label: template.label,
          masterTopicSectors,
          canvasBounds,
        })
        .returning({ id: engineInstances.id });
      if (!engineRow) throw new ApiError(500, 'engine_instance_create_failed');

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
    }

    const extraModules = input.extraModules ?? [];
    const extraEngines = input.extraEngines ?? [];
    const projectedCount =
      1 +
      template.modules.length +
      extraModules.length +
      extraEngines.reduce((sum, engine) => {
        const resolved = listResolvedEngineTemplates(new Set(loadSessionConstraints().keys())).find(
          (item) => item.id === engine.templateId,
        );
        return sum + (resolved?.modules.length ?? 0);
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

      const [engineRow] = await db
        .insert(engineInstances)
        .values({
          companyId: company.id,
          templateId: engine.id,
          label: engine.label,
          masterTopicSectors,
          canvasBounds,
        })
        .returning({ id: engineInstances.id });
      if (!engineRow) throw new ApiError(500, 'engine_instance_create_failed');

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
      for (const position of absolutePositions) {
        maxTemplateX = Math.max(maxTemplateX, position.x);
        maxTemplateY = Math.max(maxTemplateY, position.y);
      }

      for (let index = 0; index < created.length; index += 1) {
        const createdModule = created[index];
        const templateModule = engine.modules[index];
        const config = parsedConfigs[index];
        if (!createdModule || !templateModule || !config) {
          throw new ApiError(500, 'engine_module_unresolved');
        }
        const setupPatch = await recordModuleSetup(
          db,
          clock,
          company.id,
          createdModule.id,
          templateModule.type as ModuleType,
          config as Record<string, unknown>,
          seed.setup,
        );
        if (Object.keys(setupPatch).length > 0) {
          await db.update(modules).set(setupPatch).where(eq(modules.id, createdModule.id));
        }
      }

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
    }

    await refreshGeneratedModuleNames(db, company.id, createdModuleIds);

    return { company };
  });
}
