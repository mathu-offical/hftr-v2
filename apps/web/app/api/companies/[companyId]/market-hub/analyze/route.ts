import { after } from 'next/server';
import { z } from 'zod';
import { MarketHubAnalyzeResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  createSystemClock,
  drainQueues,
  enqueueMarketHubAnalyze,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';
import { createOwnerScopedModelGateway } from '@/lib/model-gateway';

export const dynamic = 'force-dynamic';
/** Kick + after() continuation for POSTURE_RESEARCH (D-111 / D-120). */
export const maxDuration = 90;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/** Brief kick so Model poll sees first stages; reseals continue via after(). */
const ANALYZE_KICK_BUDGET_MS = 2_500;
const ANALYZE_CONTINUE_BUDGET_MS = 45_000;

/**
 * Master Analyze (D-111 / D-120 / D-181 / D-183): current-moment phase + force-reseal
 * jobs + narrative. Enqueue returns quickly; a short kick drain starts stages for the
 * live Model poll (`runId`). Remaining queue work continues asynchronously via
 * `after()` so the Analyze POST does not block the company UI for a full reseal.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const modelGateway = createOwnerScopedModelGateway(db);
    const workerBase = clerkUserId.slice(0, 12);

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
        workerId: `inline-kick:${workerBase}`,
        budgetMs: ANALYZE_KICK_BUDGET_MS,
        batchSize: 2,
        queueClasses: ['POSTURE_RESEARCH'],
        kickMaintenanceSweep: false,
        modelGateway,
      });
    } catch (err) {
      drainError = err instanceof Error ? err.message : String(err);
    }

    // Continue reseals off the critical path — UI polls synthesis by runId.
    after(() => {
      void drainQueues(db, clock, {
        workerId: `inline-continue:${workerBase}`,
        budgetMs: ANALYZE_CONTINUE_BUDGET_MS,
        batchSize: 4,
        queueClasses: ['POSTURE_RESEARCH'],
        kickMaintenanceSweep: false,
        modelGateway,
      }).catch(() => {
        // Soft-fail: cron / later Sync can finish remaining jobs.
      });
    });

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
