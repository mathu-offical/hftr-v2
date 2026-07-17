import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  missingModuleSetupFields,
  MODULE_CONFIG_SCHEMAS,
  UpdateModuleInput,
} from '@hftr/contracts';
import { moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { createSystemClock } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import {
  refreshGeneratedModuleNames,
  restoreGeneratedModuleName,
} from '@/lib/module-generated-name';
import { recordModuleSetup } from '@/lib/module-setup';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid(), moduleId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string; moduleId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const row = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    return { module: row };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    const input = await parseBody(req, UpdateModuleInput);
    const clock = createSystemClock();
    if (input.setup?.targetExitAt && Date.parse(input.setup.targetExitAt) <= clock.nowMs()) {
      throw new ApiError(422, 'target_exit_must_be_future');
    }

    const proposedSetup = {
      topicSectors: input.setup?.topicSectors ?? existing.topicSectors,
      capitalAllocationRef:
        input.setup?.capitalAllocation !== undefined
          ? 'pending_operator_value_ref'
          : existing.capitalAllocationRef,
      targetExitRef:
        input.setup?.targetExitAt !== undefined
          ? 'pending_operator_value_ref'
          : existing.targetExitRef,
    };
    const missingSetup = missingModuleSetupFields(existing.type, proposedSetup);
    if ((input.status ?? existing.status) === 'active' && missingSetup.length > 0) {
      throw new ApiError(422, `module_setup_incomplete:${missingSetup.join(',')}`);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.restoreGeneratedName === true) {
      const restoredName = await restoreGeneratedModuleName(db, companyId, moduleId);
      if (restoredName === null) throw new ApiError(404, 'module_not_found');
      patch.name = restoredName;
      patch.nameCustomized = false;
    } else if (input.name !== undefined) {
      if (existing.type === 'math') {
        throw new ApiError(422, 'math_module_name_not_customizable');
      }
      patch.name = input.name;
      patch.nameCustomized = true;
    }

    if (input.status !== undefined) patch.status = input.status;
    if (input.canvasPosition !== undefined) patch.canvasPosition = input.canvasPosition;
    const config =
      input.config !== undefined
        ? MODULE_CONFIG_SCHEMAS[existing.type].parse(input.config)
        : (existing.config as Record<string, unknown>);
    if (input.config !== undefined) patch.config = config;
    const setupPatch = await recordModuleSetup(
      db,
      clock,
      companyId,
      moduleId,
      existing.type,
      config,
      input.setup,
    );
    Object.assign(patch, setupPatch);

    const updated = await db
      .update(modules)
      .set(patch)
      .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)))
      .returning();
    return { module: updated[0] };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    if (existing.type === 'math') {
      throw new ApiError(422, 'math_module_not_deletable'); // D-008
    }

    const incidentLinks = await db
      .select({
        fromModuleId: moduleLinks.fromModuleId,
        toModuleId: moduleLinks.toModuleId,
      })
      .from(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          or(eq(moduleLinks.fromModuleId, moduleId), eq(moduleLinks.toModuleId, moduleId)),
        ),
      );
    const neighborIds = [
      ...new Set(
        incidentLinks.flatMap((link) =>
          [link.fromModuleId, link.toModuleId].filter((id) => id !== moduleId),
        ),
      ),
    ];

    // Remove edges first, then the node.
    await db
      .delete(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          or(eq(moduleLinks.fromModuleId, moduleId), eq(moduleLinks.toModuleId, moduleId)),
        ),
      );
    await db.delete(modules).where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)));

    const renamedModules = await refreshGeneratedModuleNames(db, companyId, neighborIds);
    return { deleted: true, renamedModules };
  });
}
