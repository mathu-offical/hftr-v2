import { z } from 'zod';
import { scoping } from '@hftr/db';
import { applyBookDeltaValvesForModule, createSystemClock } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid() });
const Body = z.object({
  moduleId: z.string().uuid(),
  minSamples: z.number().int().min(1).max(50).optional(),
});

type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Run BookDelta → participation valve training for a module (D-205).
 * Inline (no queue) so verify/smoke can assert applied snapshots immediately.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const body = await parseBody(req, Body);
    await scoping.getOwnedModule(db, clerkUserId, companyId, body.moduleId);

    const clock = createSystemClock();
    const result = await applyBookDeltaValvesForModule(db, clock, {
      companyId,
      moduleId: body.moduleId,
      ...(body.minSamples !== undefined ? { minSamples: body.minSamples } : {}),
    });

    if (!result.ok && result.reason === 'company_not_found') {
      throw new ApiError(404, 'company_not_found');
    }

    return result;
  });
}
