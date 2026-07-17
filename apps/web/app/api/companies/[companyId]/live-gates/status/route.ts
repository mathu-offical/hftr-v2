import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { LiveGateEvidence } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { companies, liveGateEvidence } from '@hftr/db/schema';
import {
  createSystemClock,
  evaluateLiveGateChecklist,
  gatherLiveGateChecklistInput,
  isLiveArmingAllowed,
  autoDisarmCompany,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const nowMs = clock.nowMs();
    const input = await gatherLiveGateChecklistInput(db, { companyId, nowMs });
    const checklist = evaluateLiveGateChecklist(input);
    const evidenceFresh = isLiveArmingAllowed(checklist, nowMs);

    let liveArmedAt = company.liveArmedAt?.toISOString() ?? null;
    if (company.liveArmedAt && !evidenceFresh) {
      const disarmed = await autoDisarmCompany(db, companyId, 'stale_evidence');
      if (disarmed) liveArmedAt = null;
    }

    const latestRows = await db
      .select()
      .from(liveGateEvidence)
      .where(eq(liveGateEvidence.companyId, companyId))
      .orderBy(desc(liveGateEvidence.createdAt))
      .limit(1);
    const latestRow = latestRows[0];

    return {
      checklist: checklist.checklist,
      overallPass: checklist.overallPass,
      evaluatedAt: checklist.evaluatedAt,
      liveArmedAt,
      evidenceFresh,
      autoDisarmedStaleEvidence: company.liveArmedAt !== null && liveArmedAt === null,
      latestEvidence: latestRow
        ? {
            id: latestRow.id,
            overallPass: latestRow.overallPass,
            catalogVersion: latestRow.catalogVersion,
            createdAt: latestRow.createdAt.toISOString(),
            evidence: LiveGateEvidence.safeParse(latestRow.evidence).success
              ? LiveGateEvidence.parse(latestRow.evidence)
              : null,
          }
        : null,
    };
  });
}
