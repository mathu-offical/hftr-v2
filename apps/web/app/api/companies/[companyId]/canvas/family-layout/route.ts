import { z } from 'zod';
import { ensureAllInterEngineDataStreamLinks, reflowCompanyFamilyLayout } from '@hftr/engine';
import { scoping } from '@hftr/db';
import { withAuth } from '@/lib/api';
import { repositionAllEngineTimeHubs } from '@/lib/time-provision';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * D-200: run D-159/D-168 family layout repair off the company-page paint path.
 * Idempotent; `mutated` is true when any heal wrote rows so the client can soft-refresh.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);

    let prunedLinks = 0;
    let modulesUpdated = 0;
    let enginesUpdated = 0;
    let hubsEnsured = 0;
    let timeHubsUpdated = 0;

    try {
      prunedLinks = await ensureAllInterEngineDataStreamLinks(db, companyId);
    } catch (err) {
      console.error('ensureAllInterEngineDataStreamLinks failed', err);
    }

    try {
      const reflowed = await reflowCompanyFamilyLayout(db, companyId);
      modulesUpdated = reflowed.modulesUpdated;
      enginesUpdated = reflowed.enginesUpdated;
      hubsEnsured = reflowed.hubsEnsured;
    } catch (err) {
      console.error('reflowCompanyFamilyLayout failed', err);
    }

    try {
      timeHubsUpdated = await repositionAllEngineTimeHubs(db, companyId);
    } catch (err) {
      console.error('repositionAllEngineTimeHubs failed', err);
    }

    const mutated =
      prunedLinks > 0 ||
      modulesUpdated > 0 ||
      enginesUpdated > 0 ||
      hubsEnsured > 0 ||
      timeHubsUpdated > 0;

    return {
      ok: true as const,
      mutated,
      prunedLinks,
      modulesUpdated,
      enginesUpdated,
      hubsEnsured,
      timeHubsUpdated,
    };
  });
}
