import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { moduleProvisionsDedicatedMath } from '@hftr/contracts';
import { moduleLinks } from '@hftr/db/schema';
import { scoping } from '@hftr/db';
import { parseBody, withAuth } from '@/lib/api';
import { provisionDedicatedMathTools } from '@/lib/math-provision';
import { planFundPathMathLinkRewires } from '@/lib/fund-route-links';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
const Input = z.object({ engineId: z.string().uuid().optional() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Explicit operator repair/provision boundary for legacy graphs. Reflow calls
 * this endpoint; migration itself never guesses Math ownership.
 * Also rewires capital fund_route hops onto fund_path Math (D-221).
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const input = await parseBody(req, Input);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    if (input.engineId) {
      await scoping.getOwnedEngineInstance(db, clerkUserId, companyId, input.engineId);
    }

    const companyModules = await scoping.listModules(db, clerkUserId, companyId);
    const ownedIds = new Set(
      companyModules
        .filter((module) => module.type === 'math' && module.toolOwnerModuleId)
        .map((module) => module.toolOwnerModuleId!),
    );
    const owners = companyModules.filter(
      (module) =>
        moduleProvisionsDedicatedMath(module.type) &&
        !ownedIds.has(module.id) &&
        (!input.engineId || module.engineInstanceId === input.engineId),
    );
    const tools = await provisionDedicatedMathTools(
      db,
      companyId,
      owners.map((owner) => ({
        id: owner.id,
        type: owner.type,
        name: owner.name,
        position: owner.canvasPosition as { x: number; y: number },
      })),
    );

    const refreshed = await scoping.listModules(db, clerkUserId, companyId);
    const links = await scoping.listLinks(db, clerkUserId, companyId);
    const rewires = planFundPathMathLinkRewires({
      modules: refreshed.map((module) => ({
        id: module.id,
        type: module.type,
        toolOwnerModuleId: module.toolOwnerModuleId ?? null,
      })),
      links: links.map((link) => ({
        id: link.id,
        fromModuleId: link.fromModuleId,
        toModuleId: link.toModuleId,
        linkKind: link.linkKind,
      })),
    });
    for (const rewire of rewires) {
      await db
        .update(moduleLinks)
        .set({
          fromModuleId: rewire.fromModuleId,
          toModuleId: rewire.toModuleId,
          updatedAt: new Date(),
        })
        .where(eq(moduleLinks.id, rewire.linkId));
    }

    return { tools, rewiredFundRoutes: rewires.length };
  });
}
