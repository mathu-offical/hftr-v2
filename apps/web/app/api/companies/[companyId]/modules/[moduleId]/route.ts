import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  missingModuleSetupFields,
  MODULE_CONFIG_SCHEMAS,
  UpdateModuleInput,
  type LinkKind,
  type ModuleType,
} from '@hftr/contracts';
import { moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import {
  activationGraphBlockers,
  createSystemClock,
  ensureResearchCadenceSchedule,
} from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import {
  refreshGeneratedModuleNames,
  restoreGeneratedModuleName,
} from '@/lib/module-generated-name';
import { recordModuleSetup } from '@/lib/module-setup';
import { cleanupDedicatedMathForOwner } from '@/lib/math-provision';

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
    const targetStatus = input.status ?? existing.status;
    const missingSetup = missingModuleSetupFields(existing.type, proposedSetup);
    if (targetStatus === 'active' && missingSetup.length > 0) {
      throw new ApiError(422, `module_setup_incomplete:${missingSetup.join(',')}`);
    }

    if (targetStatus === 'active') {
      const [incidentLinks, companyModules] = await Promise.all([
        db
          .select({
            fromModuleId: moduleLinks.fromModuleId,
            toModuleId: moduleLinks.toModuleId,
            linkKind: moduleLinks.linkKind,
          })
          .from(moduleLinks)
          .where(
            and(
              eq(moduleLinks.companyId, companyId),
              or(eq(moduleLinks.fromModuleId, moduleId), eq(moduleLinks.toModuleId, moduleId)),
            ),
          ),
        db
          .select({ id: modules.id, type: modules.type })
          .from(modules)
          .where(eq(modules.companyId, companyId)),
      ]);
      const graphBlockers = activationGraphBlockers(
        { id: moduleId, type: existing.type as ModuleType },
        incidentLinks.map((row) => ({
          fromModuleId: row.fromModuleId,
          toModuleId: row.toModuleId,
          linkKind: row.linkKind as LinkKind,
        })),
        companyModules.map((row) => ({
          id: row.id,
          type: row.type as ModuleType,
        })),
      );
      if (graphBlockers.length > 0) {
        throw new ApiError(422, 'module_graph_incomplete', { reasons: [...graphBlockers] });
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.restoreGeneratedName === true) {
      const restored = await restoreGeneratedModuleName(db, companyId, moduleId);
      if (restored === null) throw new ApiError(404, 'module_not_found');
      patch.name = restored.name;
      patch.generatedNameBase = restored.generatedNameBase;
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
    if (input.engineInstanceId !== undefined) {
      if (existing.type === 'math') {
        throw new ApiError(422, 'math_module_cannot_join_engine');
      }
      if (input.engineInstanceId) {
        await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, input.engineInstanceId);
      }
      patch.engineInstanceId = input.engineInstanceId;
    }

    const config =
      input.config !== undefined
        ? MODULE_CONFIG_SCHEMAS[existing.type].parse(input.config)
        : (existing.config as Record<string, unknown>);
    if (input.config !== undefined) patch.config = config;

    if (input.restoreEngineTopic === true) {
      const engineId = (input.engineInstanceId ?? existing.engineInstanceId) as string | null;
      if (!engineId) throw new ApiError(422, 'module_not_in_engine');
      const engine = await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, engineId);
      const setupPatch = await recordModuleSetup(
        db,
        clock,
        companyId,
        moduleId,
        existing.type as ModuleType,
        config,
        { topicSectors: engine.masterTopicSectors },
      );
      Object.assign(patch, setupPatch);
      patch.topicSectorsOverridden = false;
    } else {
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
      if (input.setup?.topicSectors !== undefined) {
        patch.topicSectorsOverridden = true;
      }
    }

    const updated = await db
      .update(modules)
      .set(patch)
      .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)))
      .returning();
    let moduleRow = updated[0]!;

    // Focus/meta changes should refresh compact generated titles when not customized.
    if (
      moduleRow.nameCustomized === false &&
      input.restoreGeneratedName !== true &&
      input.name === undefined
    ) {
      const renamed = await refreshGeneratedModuleNames(db, companyId, [moduleId]);
      const next = renamed.find((row) => row.moduleId === moduleId);
      if (next) {
        moduleRow = {
          ...moduleRow,
          name: next.name,
          generatedNameBase: next.generatedNameBase,
          nameCustomized: next.nameCustomized,
        };
      }
    }

    if (moduleRow.type === 'research' && moduleRow.status === 'active') {
      const cfg = (moduleRow.config ?? {}) as {
        cadenceMinutes?: number;
        topicScope?: string;
        focus?: string;
      };
      const cadenceMinutes =
        typeof cfg.cadenceMinutes === 'number' && cfg.cadenceMinutes > 0 ? cfg.cadenceMinutes : 180;
      await ensureResearchCadenceSchedule(db, clock, {
        companyId,
        moduleId,
        cadenceMinutes,
        topicScope: cfg.topicScope ?? cfg.focus ?? '',
      });
    }

    return { module: moduleRow };
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, moduleId } = Params.parse(await ctx.params);
    const existing = await scoping.getOwnedModule(db, clerkUserId, companyId, moduleId);
    // D-028: Math tools are deletable (repeatable / multi-attach).

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

    if (existing.type !== 'math') {
      await cleanupDedicatedMathForOwner(db, companyId, moduleId);
    }

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
