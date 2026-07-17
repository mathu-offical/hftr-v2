import { and, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { DeleteEngineInstanceInput, UpdateEngineInstanceInput } from '@hftr/contracts';
import { engineInstances, moduleLinks, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';
import { cascadeEngineMasterTopic } from '@/lib/engine-topic-cascade';
import { refreshGeneratedModuleNames } from '@/lib/module-generated-name';
import { cleanupDedicatedMathForOwner } from '@/lib/math-provision';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  engineId: z.string().uuid(),
});
type Ctx = { params: Promise<{ companyId: string; engineId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, engineId } = Params.parse(await ctx.params);
    const row = await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, engineId);
    const members = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.companyId, companyId), eq(modules.engineInstanceId, engineId)));
    return {
      engine: {
        id: row.id,
        companyId: row.companyId,
        templateId: row.templateId,
        label: row.label,
        masterTopicSectors: row.masterTopicSectors,
        canvasBounds: row.canvasBounds,
        memberModuleIds: members.map((m) => m.id),
      },
    };
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, engineId } = Params.parse(await ctx.params);
    await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, engineId);
    const input = await parseBody(req, UpdateEngineInstanceInput);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.canvasBounds !== undefined) patch.canvasBounds = input.canvasBounds;
    if (input.masterTopicSectors !== undefined) {
      patch.masterTopicSectors = input.masterTopicSectors;
    }

    const [updated] = await db
      .update(engineInstances)
      .set(patch)
      .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)))
      .returning();
    if (!updated) throw new ApiError(404, 'engine_instance_not_found');

    let cascaded = 0;
    if (input.masterTopicSectors !== undefined) {
      cascaded = await cascadeEngineMasterTopic(db, companyId, engineId, input.masterTopicSectors);
    }

    const members = await db
      .select()
      .from(modules)
      .where(and(eq(modules.companyId, companyId), eq(modules.engineInstanceId, engineId)));

    return {
      engine: {
        id: updated.id,
        companyId: updated.companyId,
        templateId: updated.templateId,
        label: updated.label,
        masterTopicSectors: updated.masterTopicSectors,
        canvasBounds: updated.canvasBounds,
        memberModuleIds: members.map((m) => m.id),
      },
      modules: members,
      cascadedMemberCount: cascaded,
    };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, engineId } = Params.parse(await ctx.params);
    await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, engineId);

    let mode: 'cascade' | 'ungroup' = 'ungroup';
    try {
      const body = await parseBody(req, DeleteEngineInstanceInput);
      mode = body.mode;
    } catch {
      // DELETE without body defaults to ungroup (safer).
      mode = 'ungroup';
    }

    const members = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.companyId, companyId), eq(modules.engineInstanceId, engineId)));
    const memberIds = members.map((m) => m.id);

    if (mode === 'cascade' && memberIds.length > 0) {
      const incidentLinks = await db
        .select({
          fromModuleId: moduleLinks.fromModuleId,
          toModuleId: moduleLinks.toModuleId,
        })
        .from(moduleLinks)
        .where(
          and(
            eq(moduleLinks.companyId, companyId),
            or(
              inArray(moduleLinks.fromModuleId, memberIds),
              inArray(moduleLinks.toModuleId, memberIds),
            ),
          ),
        );
      const neighborIds = [
        ...new Set(
          incidentLinks.flatMap((link) =>
            [link.fromModuleId, link.toModuleId].filter((id) => !memberIds.includes(id)),
          ),
        ),
      ];

      for (const memberId of memberIds) {
        await cleanupDedicatedMathForOwner(db, companyId, memberId);
      }

      await db
        .delete(moduleLinks)
        .where(
          and(
            eq(moduleLinks.companyId, companyId),
            or(
              inArray(moduleLinks.fromModuleId, memberIds),
              inArray(moduleLinks.toModuleId, memberIds),
            ),
          ),
        );
      await db
        .delete(modules)
        .where(and(eq(modules.companyId, companyId), inArray(modules.id, memberIds)));
      await db
        .delete(engineInstances)
        .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)));

      const renamedModules = await refreshGeneratedModuleNames(db, companyId, neighborIds);
      return { deleted: true, mode, deletedModuleIds: memberIds, renamedModules };
    }

    // ungroup: clear membership, keep modules/links, delete engine chrome.
    if (memberIds.length > 0) {
      await db
        .update(modules)
        .set({ engineInstanceId: null, updatedAt: new Date() })
        .where(and(eq(modules.companyId, companyId), inArray(modules.id, memberIds)));
    }
    await db
      .delete(engineInstances)
      .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)));

    return { deleted: true, mode, deletedModuleIds: [] as string[], renamedModules: [] };
  });
}
