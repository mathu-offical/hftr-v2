import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  computeEngineBoundsFromPositions,
  InsertEngineInput,
  listResolvedEngineTemplates,
  MODULE_CONFIG_SCHEMAS,
  type ModuleType,
} from '@hftr/contracts';
import { loadSessionConstraints } from '@hftr/engine';
import { engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';
import { recordModuleSetup } from '@/lib/module-setup';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const MAX_MODULES_PER_COMPANY = 60;

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const rows = await scoping.listEngineInstances(db, clerkUserId, companyId);
    const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
    const engines = rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      templateId: row.templateId,
      label: row.label,
      masterTopicSectors: row.masterTopicSectors,
      canvasBounds: row.canvasBounds as {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null,
      memberModuleIds: moduleRows.filter((m) => m.engineInstanceId === row.id).map((m) => m.id),
    }));
    return { engines };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, InsertEngineInput);

    const sessionIds = new Set(loadSessionConstraints().keys());
    const templates = listResolvedEngineTemplates(sessionIds);
    const engine = templates.find((item) => item.id === input.templateId);
    if (!engine) throw new ApiError(422, 'engine_template_not_found');
    if (!engine.available) {
      throw new ApiError(422, engine.unavailableReason ?? 'engine_template_unavailable');
    }

    const existing = await scoping.listModules(db, clerkUserId, companyId);
    if (existing.length + engine.modules.length > MAX_MODULES_PER_COMPANY) {
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
      const mapKey = `${engineInput.target.moduleIndex}:${engineInput.target.configKey}`;
      grouped.set(mapKey, [...(grouped.get(mapKey) ?? []), value]);
    }
    for (const [mapKey, values] of grouped) {
      const [idx, configKey] = mapKey.split(':') as [string, string];
      configs[Number(idx)]![configKey] = values.join(' — ');
    }

    const offset = input.canvasOffset ?? { x: 0, y: 0 };
    const absolutePositions = engine.modules.map((m) => ({
      x: m.position.x + offset.x,
      y: m.position.y + offset.y,
    }));
    const canvasBounds = computeEngineBoundsFromPositions(absolutePositions);
    const masterTopicSectors = input.setup?.topicSectors ?? [];

    const [engineRow] = await db
      .insert(engineInstances)
      .values({
        companyId,
        templateId: engine.id,
        label: engine.label,
        masterTopicSectors,
        canvasBounds,
      })
      .returning();
    if (!engineRow) throw new ApiError(500, 'engine_instance_create_failed');

    const parsedConfigs = configs.map((config, index) =>
      MODULE_CONFIG_SCHEMAS[engine.modules[index]!.type].parse(config),
    );

    const created = await db
      .insert(modules)
      .values(
        engine.modules.map((m, index) => ({
          companyId,
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
      .returning();

    const clock = createSystemClock();
    const updatedModules: (typeof created)[number][] = [];
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
        companyId,
        createdModule.id,
        templateModule.type as ModuleType,
        config as Record<string, unknown>,
        input.setup,
      );
      if (Object.keys(setupPatch).length === 0) {
        updatedModules.push(createdModule);
        continue;
      }
      const [updated] = await db
        .update(modules)
        .set(setupPatch)
        .where(eq(modules.id, createdModule.id))
        .returning();
      updatedModules.push(updated ?? createdModule);
    }

    const createdLinks = [];
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
      await refreshGeneratedModuleNames(db, companyId, [
        ...(mathModule ? [mathModule.id] : []),
        ...created.map((row) => row.id),
      ]);
    }

    const refreshedModules = await scoping.listModules(db, clerkUserId, companyId);
    const memberIds = new Set(created.map((m) => m.id));
    return {
      engine: {
        id: engineRow.id,
        companyId: engineRow.companyId,
        templateId: engineRow.templateId,
        label: engineRow.label,
        masterTopicSectors: engineRow.masterTopicSectors,
        canvasBounds: engineRow.canvasBounds,
        memberModuleIds: [...memberIds],
      },
      modules: refreshedModules.filter(
        (m) => memberIds.has(m.id) || updatedModules.some((u) => u.id === m.id),
      ),
      links: createdLinks,
    };
  });
}
