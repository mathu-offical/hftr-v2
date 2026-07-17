import { z } from 'zod';
import { scoping } from '@hftr/db';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    // simulation_runs tables land with the simulator milestone; the route is
    // hardened now so the right panel can wire against a stable contract.
    return { runs: [] };
  });
}
