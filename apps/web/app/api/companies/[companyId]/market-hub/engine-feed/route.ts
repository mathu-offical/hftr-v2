import { z } from 'zod';
import { MarketPostureEngineFeed } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { createSystemClock, loadPostureFeedForEngine } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * D-243: Slim posture feed for execution engines (not MarketHubResponse UI monolith).
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const feed = await loadPostureFeedForEngine(db, companyId, clock.nowMs());
    return MarketPostureEngineFeed.parse(feed);
  });
}
