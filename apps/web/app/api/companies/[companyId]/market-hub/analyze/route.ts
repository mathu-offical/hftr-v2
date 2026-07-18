import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MarketHubAnalyzeResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
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
 * Master Analyze (D-111): full current posture analysis.
 * Enqueues movers (force reseal + tactical LLM thresholds), sector bulletin,
 * and calendar-phase daily summary; drains POSTURE_RESEARCH.
 * Distinct from hub Sync (GET-only live projection).
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();

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

    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_movers',
      payload: { companyId, forceReseal: true },
      idempotencyKey: `market-hub-analyze-movers-${companyId}-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
    });
    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_sector_news',
      payload: { companyId, forceReseal: true },
      idempotencyKey: `market-hub-analyze-sector-${companyId}-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
    });
    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_daily_summaries',
      payload: { companyId, phase, forceReseal: true },
      idempotencyKey: `market-hub-analyze-daily-${companyId}-${phase}-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
    });

    let drained:
      | { claimed: number; completed: number; failed: number; deadlineHit: boolean }
      | undefined;
    let drainError: string | undefined;
    try {
      drained = await drainQueues(db, clock, {
        workerId: `inline:${clerkUserId.slice(0, 12)}`,
        budgetMs: 60_000,
        batchSize: 6,
        queueClasses: ['POSTURE_RESEARCH'],
        kickMaintenanceSweep: false,
      });
    } catch (err) {
      drainError = err instanceof Error ? err.message : String(err);
    }

    return MarketHubAnalyzeResponse.parse({
      enqueued: true,
      jobs: [
        { kind: 'library.system_movers', forceReseal: true },
        { kind: 'library.system_sector_news' },
        { kind: 'library.system_daily_summaries' },
      ],
      llmStage: 'suggestion_threshold_profile',
      drained,
      drainError,
    });
  });
}
