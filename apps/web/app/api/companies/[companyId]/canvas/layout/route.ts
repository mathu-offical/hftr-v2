import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { BatchCanvasLayoutInput } from '@hftr/contracts';
import { engineInstances, modules } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Atomic batch persist for canvas / engine Reflow (D-033).
 * Validates ownership; rejects unknown module/engine ids for the company.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const input = await parseBody(req, BatchCanvasLayoutInput);

    const ownedModules = await scoping.listModules(db, clerkUserId, companyId);
    const ownedEngines = await scoping.listEngineInstances(db, clerkUserId, companyId);
    const moduleIds = new Set(ownedModules.map((m) => m.id));
    const engineIds = new Set(ownedEngines.map((e) => e.id));

    for (const row of input.modules) {
      if (!moduleIds.has(row.id)) throw new ApiError(404, 'module_not_found');
    }
    for (const row of input.engines) {
      if (!engineIds.has(row.id)) throw new ApiError(404, 'engine_instance_not_found');
    }

    const now = new Date();
    for (const row of input.modules) {
      await db
        .update(modules)
        .set({
          canvasPosition: {
            x: Math.round(row.canvasPosition.x),
            y: Math.round(row.canvasPosition.y),
          },
          updatedAt: now,
        })
        .where(and(eq(modules.id, row.id), eq(modules.companyId, companyId)));
    }

    for (const row of input.engines) {
      await db
        .update(engineInstances)
        .set({
          canvasBounds: {
            x: Math.round(row.canvasBounds.x),
            y: Math.round(row.canvasBounds.y),
            width: Math.round(row.canvasBounds.width),
            height: Math.round(row.canvasBounds.height),
          },
          updatedAt: now,
        })
        .where(and(eq(engineInstances.id, row.id), eq(engineInstances.companyId, companyId)));
    }

    const refreshedModules =
      input.modules.length > 0
        ? await db
            .select()
            .from(modules)
            .where(
              and(
                eq(modules.companyId, companyId),
                inArray(
                  modules.id,
                  input.modules.map((m) => m.id),
                ),
              ),
            )
        : [];
    const refreshedEngines =
      input.engines.length > 0
        ? await db
            .select()
            .from(engineInstances)
            .where(
              and(
                eq(engineInstances.companyId, companyId),
                inArray(
                  engineInstances.id,
                  input.engines.map((e) => e.id),
                ),
              ),
            )
        : [];

    return {
      modules: refreshedModules,
      engines: refreshedEngines.map((row) => ({
        id: row.id,
        canvasBounds: row.canvasBounds,
      })),
    };
  });
}
