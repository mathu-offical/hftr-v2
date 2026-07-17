import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { companies, liveGateEvidence } from '@hftr/db/schema';
import {
  buildLiveGateEvidence,
  createSystemClock,
  gatherLiveGateChecklistInput,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Persist a fresh live-gate evidence bundle from current checklist inputs. */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const nowMs = clock.nowMs();
    const input = await gatherLiveGateChecklistInput(db, { companyId, nowMs });
    const evidence = buildLiveGateEvidence(input);

    const [row] = await db
      .insert(liveGateEvidence)
      .values({
        companyId,
        evidence,
        catalogVersion: evidence.catalogVersion,
        overallPass: evidence.overallPass,
      })
      .returning();
    if (!row) throw new Error('insert_failed');

    await db
      .update(companies)
      .set({ liveGateEvidenceId: row.id, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    return {
      evidenceId: row.id,
      evidence,
      overallPass: row.overallPass,
      createdAt: row.createdAt.toISOString(),
    };
  });
}
