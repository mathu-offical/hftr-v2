import { z } from 'zod';
import { moduleRequiresMath } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { parseBody, withAuth } from '@/lib/api';
import { provisionDedicatedMathTools } from '@/lib/math-provision';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
const Input = z.object({ engineId: z.string().uuid().optional() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Explicit operator repair/provision boundary for legacy graphs. Reflow calls
 * this endpoint; migration itself never guesses Math ownership.
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
        moduleRequiresMath(module.type) &&
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

    return { tools };
  });
}
