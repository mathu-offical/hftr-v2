import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateModuleInput, MODULE_CONFIG_SCHEMAS, moduleRequiresMath } from '@hftr/contracts';
import { libraries, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { recordModuleSetup } from '@/lib/module-setup';
import { provisionDedicatedMathTools } from '@/lib/math-provision';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const MAX_MODULES_PER_COMPANY = 60;

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

    const existing = await scoping.listModules(db, clerkUserId, companyId);
    const requiredSlots = moduleRequiresMath(input.type) ? 2 : 1;
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

    const inserted = await db
      .insert(modules)
      .values({
        companyId,
        type: input.type,
        name: input.name,
        generatedNameBase: input.generatedNameBase ?? input.name,
        nameCustomized: false,
        config,
        canvasPosition: input.canvasPosition ?? { x: 0, y: 0 },
        status: input.type === 'math' ? 'active' : 'draft',
        engineInstanceId: input.type === 'math' ? null : (input.engineInstanceId ?? null),
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
    }

    const dedicatedMath = await provisionDedicatedMathTools(db, companyId, [
      {
        id: resultModule.id,
        type: resultModule.type,
        name: resultModule.name,
        position: resultModule.canvasPosition as { x: number; y: number },
      },
    ]);

    return { module: resultModule, dedicatedMath };
  });
}
