import { z } from 'zod';
import { MarketHubSynthesisRunResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { loadLatestSynthesisRun } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Latest synthesis run for Model canvas idle/active view (D-120). */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const run = await loadLatestSynthesisRun(db, { companyId });
    if (!run) {
      return { run: null as null };
    }
    return { run: MarketHubSynthesisRunResponse.parse(run) };
  });
}
