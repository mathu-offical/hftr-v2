import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CreateModuleInput,
  deriveGeneratedModuleName,
  MAX_MODULES_PER_COMPANY,
  MODULE_CONFIG_SCHEMAS,
  moduleFunctionLabel,
  moduleProvisionsDedicatedMath,
} from '@hftr/contracts';
import { libraries, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { bootstrapCompanyKnowledge, createSystemClock, resolveCompanyServiceBindings } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { recordModuleSetup } from '@/lib/module-setup';
import { provisionDedicatedMathTools } from '@/lib/math-provision';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const rows = await scoping.listModules(db, clerkUserId, companyId);
    return { modules: rows };
  });
}

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, CreateModuleInput);

    // D-028: Math is repeatable and multi-attachable (n8n-style tools).
    // D-088: Master Clock is a company singleton.

    const existing = await scoping.listModules(db, clerkUserId, companyId);
    if (input.type === 'clock' && existing.some((row) => row.type === 'clock')) {
      throw new ApiError(422, 'clock_singleton');
    }
    const requiredSlots = moduleProvisionsDedicatedMath(input.type) ? 2 : 1;
    if (existing.length + requiredSlots > MAX_MODULES_PER_COMPANY) {
      throw new ApiError(422, 'module_limit_reached');
    }

    // Per-type config validation (schema registry from contracts).
    const config = MODULE_CONFIG_SCHEMAS[input.type].parse(input.config ?? {});
    const clock = createSystemClock();
    if (input.setup?.targetExitAt && Date.parse(input.setup.targetExitAt) <= clock.nowMs()) {
      throw new ApiError(422, 'target_exit_must_be_future');
    }

    if (input.engineInstanceId) {
      await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, input.engineInstanceId);
    }

    const fn = moduleFunctionLabel(input.type, config);
    const generatedNameBase = input.generatedNameBase?.trim() || fn;
    const name = deriveGeneratedModuleName({
      type: input.type,
      baseName: generatedNameBase,
      config,
      topicSectors: input.setup?.topicSectors ?? [],
    });

    const inserted = await db
      .insert(modules)
      .values({
        companyId,
        type: input.type,
        name,
        generatedNameBase,
        nameCustomized: false,
        config,
        canvasPosition: input.canvasPosition ?? { x: 0, y: 0 },
        status:
          input.type === 'math' || input.type === 'clock' || input.type === 'time'
            ? 'active'
            : 'draft',
        engineInstanceId:
          input.type === 'math' || input.type === 'clock' || input.type === 'time'
            ? null
            : (input.engineInstanceId ?? null),
        topicSectorsOverridden: false,
      })
      .returning();
    const module = inserted[0];
    if (!module) throw new ApiError(500, 'module_insert_failed');
    const setupPatch = await recordModuleSetup(
      db,
      clock,
      companyId,
      module.id,
      input.type,
      config as Record<string, unknown>,
      input.setup,
    );
    let resultModule = module;
    if (Object.keys(setupPatch).length > 0) {
      const updated = await db
        .update(modules)
        .set(setupPatch)
        .where(eq(modules.id, module.id))
        .returning();
      resultModule = updated[0] ?? module;
    }

    const renamed = await refreshGeneratedModuleNames(db, companyId, [resultModule.id]);
    const renamedRow = renamed.find((row) => row.moduleId === resultModule.id);
    if (renamedRow) {
      resultModule = {
        ...resultModule,
        name: renamedRow.name,
        generatedNameBase: renamedRow.generatedNameBase,
        nameCustomized: renamedRow.nameCustomized,
      };
    }

    if (input.type === 'library') {
      const topicScope =
        typeof (config as { topicScope?: string }).topicScope === 'string'
          ? (config as { topicScope: string }).topicScope
          : '';
      await db
        .insert(libraries)
        .values({
          companyId,
          moduleId: resultModule.id,
          name: resultModule.name,
          topicScope,
          masterLibrary: false,
        })
        .onConflictDoNothing({ target: [libraries.companyId, libraries.name] });
      await bootstrapCompanyKnowledge({ db, companyId });
    }

    const dedicatedMath = await provisionDedicatedMathTools(db, companyId, [
      {
        id: resultModule.id,
        type: resultModule.type,
        name: generatedNameBase,
        position: resultModule.canvasPosition as { x: number; y: number },
        config,
      },
    ]);

    try {
      await resolveCompanyServiceBindings(db, clerkUserId, companyId);
    } catch (err) {
      console.error('resolveCompanyServiceBindings failed on module create', err);
    }

    return { module: resultModule, dedicatedMath };
  });
}
