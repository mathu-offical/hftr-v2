import { z } from 'zod';
import { MarketHubSynthesisRunResponse } from '@hftr/contracts';
import { scoping, NotFoundError } from '@hftr/db';
import { loadSynthesisRun } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({
  companyId: z.string().uuid(),
  runId: z.string().uuid(),
});
type Ctx = { params: Promise<{ companyId: string; runId: string }> };

/** Single synthesis run + stages for live Model polling (D-120). */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId, runId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const run = await loadSynthesisRun(db, { companyId, runId });
    if (!run) {
      throw new NotFoundError('synthesis_run');
    }
    return MarketHubSynthesisRunResponse.parse(run);
  });
}
