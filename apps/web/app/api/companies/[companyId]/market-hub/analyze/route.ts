import { z } from 'zod';
import { MarketHubAnalyzeResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  createSystemClock,
  drainQueues,
  enqueueMarketHubAnalyze,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Master Analyze (D-111 / D-120 / D-181 / D-183): current-moment phase + force-reseal
 * jobs + narrative; short drain so UI can poll live Model stages via runId.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();

    const enqueued = await enqueueMarketHubAnalyze(db, clock, {
      companyId,
      reason: 'manual',
      forceReseal: true,
    });

    let drained:
      | { claimed: number; completed: number; failed: number; deadlineHit: boolean }
      | undefined;
    let drainError: string | undefined;
    try {
      drained = await drainQueues(db, clock, {
        workerId: `inline:${clerkUserId.slice(0, 12)}`,
        budgetMs: 20_000,
        batchSize: 6,
        queueClasses: ['POSTURE_RESEARCH'],
        kickMaintenanceSweep: false,
      });
    } catch (err) {
      drainError = err instanceof Error ? err.message : String(err);
    }

    return MarketHubAnalyzeResponse.parse({
      enqueued: true,
      runId: enqueued.runId,
      analyzePhase: enqueued.analyzePhase,
      analyzePhaseLabel: enqueued.analyzePhaseLabel,
      asOfIso: enqueued.asOfIso,
      jobs: [
        { kind: 'library.system_movers', forceReseal: true },
        { kind: 'library.system_sector_news', forceReseal: true },
        { kind: 'library.system_daily_summaries', forceReseal: true },
        { kind: 'library.posture_narrative' },
      ],
      llmStage: 'suggestion_threshold_profile',
      drained,
      drainError,
    });
  });
}
