import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MarketHubAnalyzeResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  createMarketHubSynthesisRun,
  createSystemClock,
  dailySummaryPhaseFromSession,
  drainQueues,
  enqueue,
  getSession,
  sessionPhase,
  venueDate,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Master Analyze (D-111 / D-120): create synthesis run, enqueue force-reseal jobs +
 * narrative, short drain so UI can poll live Model stages via runId.
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const now = new Date(clock.nowMs());

    const date = venueDate(clock.nowMs(), 'America/New_York');
    const session =
      (await getSession(db, 'XNYS', date)) ??
      ({
        venue: 'XNYS',
        sessionDate: date,
        timezone: 'America/New_York',
        openMsUtc: null,
        closeMsUtc: null,
        dayKind: 'open' as const,
      });
    const phase = dailySummaryPhaseFromSession(sessionPhase(session, clock.nowMs()));

    const runId = await createMarketHubSynthesisRun(db, { companyId, now });

    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_movers',
      payload: { companyId, forceReseal: true, synthesisRunId: runId },
      idempotencyKey: `market-hub-analyze-movers-${companyId}-${runId}`,
      priority: 'NORMAL',
      companyId,
    });
    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_sector_news',
      payload: { companyId, forceReseal: true, synthesisRunId: runId },
      idempotencyKey: `market-hub-analyze-sector-${companyId}-${runId}`,
      priority: 'NORMAL',
      companyId,
    });
    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_daily_summaries',
      payload: { companyId, phase, forceReseal: true, synthesisRunId: runId },
      idempotencyKey: `market-hub-analyze-daily-${companyId}-${phase}-${runId}`,
      priority: 'NORMAL',
      companyId,
    });
    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.posture_narrative',
      payload: { companyId, synthesisRunId: runId, phase },
      idempotencyKey: `market-hub-analyze-narrative-${companyId}-${runId}`,
      priority: 'LOW',
      companyId,
      // Narrative waits on seal stages inside the handler; short delay only
      // reduces empty-queue claim races during inline drain.
      runAfterMs: clock.nowMs() + 5_000,
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
      runId,
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
