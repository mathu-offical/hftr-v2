import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { LiveGateEvidence } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { companies, liveGateEvidence } from '@hftr/db/schema';
import { isLiveArmingAllowed, createSystemClock } from '@hftr/engine';
import { ApiError, parseBody, withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

const ARM_CONFIRMATION_PHRASE = 'ARM LIVE TRADING';

const ArmInput = z.object({
  confirmation: z.string(),
});

export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const { confirmation } = await parseBody(req, ArmInput);
    if (confirmation !== ARM_CONFIRMATION_PHRASE) {
      throw new ApiError(422, 'arm_confirmation_required');
    }

    const clock = createSystemClock();
    const nowMs = clock.nowMs();

    const companyRows = await db
      .select({ liveGateEvidenceId: companies.liveGateEvidenceId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const evidenceId = companyRows[0]?.liveGateEvidenceId;
    if (!evidenceId) throw new ApiError(422, 'live_gate_evidence_missing');

    const evRows = await db
      .select()
      .from(liveGateEvidence)
      .where(eq(liveGateEvidence.id, evidenceId))
      .limit(1);
    const evRow = evRows[0];
    if (!evRow || !evRow.overallPass) throw new ApiError(422, 'live_gate_not_passing');

    const parsed = LiveGateEvidence.safeParse(evRow.evidence);
    if (!parsed.success || !isLiveArmingAllowed(parsed.data, nowMs)) {
      throw new ApiError(422, 'live_gate_evidence_stale');
    }

    const [updated] = await db
      .update(companies)
      .set({ liveArmedAt: new Date(nowMs), updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    return {
      liveArmedAt: updated?.liveArmedAt?.toISOString() ?? null,
      liveGateEvidenceId: evidenceId,
    };
  });
}
