import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, jobs, trendCandidates } from '@hftr/db/schema';
import { BUDGET_QUEUED_ERROR } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export interface ModuleStatusProjection {
  moduleId: string;
  /** Pending jobs excluding budget-held admission deferrals. */
  pendingJobs: number;
  /** Pending jobs stamped with budget_queued (REQ-LLM-007). */
  budgetQueuedJobs: number;
  activeJobs: number;
  deadJobs: number;
  lastTradeOutcome: string | null;
  lastTrendSymbol: string | null;
  statusText: string;
}

function composeModuleStatusText(opts: {
  moduleStatus: string;
  moduleType: string;
  dead: number;
  active: number;
  budgetQueued: number;
  normalPending: number;
  lastTradeOutcome: string | null;
  lastTrendSymbol: string | null;
  lastTrendDirection: string | null;
  lastTrendStrengthBand: string | null;
}): string {
  if (opts.moduleStatus !== 'active') return opts.moduleStatus;
  if (opts.dead > 0) return `error: dead jobs (${opts.dead})`;
  if (opts.active > 0) return `working · ${opts.active} active`;
  if (opts.budgetQueued > 0) {
    if (opts.normalPending > 0) {
      return `budget held · ${opts.budgetQueued} · ${opts.normalPending} queued`;
    }
    return `budget held · ${opts.budgetQueued}`;
  }
  if (opts.normalPending > 0) return `queued · ${opts.normalPending} pending`;
  if (opts.moduleType === 'trading' && opts.lastTradeOutcome) {
    return `last: ${opts.lastTradeOutcome}`;
  }
  if (opts.moduleType === 'trend' && opts.lastTrendSymbol) {
    return `${opts.lastTrendSymbol} ${opts.lastTrendDirection} (${opts.lastTrendStrengthBand})`;
  }
  return 'idle';
}

/**
 * Per-module status projection for the canvas (T1.4). Text-first: statusText
 * is composed server-side so nodes render meaning without client logic.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
    const moduleIds = moduleRows.map((m) => m.id);
    if (moduleIds.length === 0) return { modules: [] };

    const [jobCounts, budgetQueuedCounts, lastTraces, lastTrends] = await Promise.all([
      db
        .select({
          moduleId: jobs.moduleId,
          status: jobs.status,
          count: sql<number>`count(*)::int`,
        })
        .from(jobs)
        .where(
          and(eq(jobs.companyId, companyId), inArray(jobs.status, ['pending', 'active', 'dead'])),
        )
        .groupBy(jobs.moduleId, jobs.status),
      db
        .select({
          moduleId: jobs.moduleId,
          count: sql<number>`count(*)::int`,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.companyId, companyId),
            eq(jobs.status, 'pending'),
            eq(jobs.lastError, BUDGET_QUEUED_ERROR),
          ),
        )
        .groupBy(jobs.moduleId),
      db
        .select({
          moduleId: actionTraces.moduleId,
          outcome: actionTraces.outcome,
          createdAt: actionTraces.createdAt,
        })
        .from(actionTraces)
        .where(eq(actionTraces.companyId, companyId))
        .orderBy(desc(actionTraces.createdAt))
        .limit(50),
      db
        .select({
          moduleId: trendCandidates.moduleId,
          symbol: trendCandidates.symbol,
          direction: trendCandidates.direction,
          strengthBand: trendCandidates.strengthBand,
        })
        .from(trendCandidates)
        .where(eq(trendCandidates.companyId, companyId))
        .orderBy(desc(trendCandidates.createdAt))
        .limit(50),
    ]);

    const budgetQueuedByModule = new Map(
      budgetQueuedCounts
        .filter((row) => row.moduleId != null)
        .map((row) => [row.moduleId!, row.count] as const),
    );

    const projections: ModuleStatusProjection[] = moduleRows.map((m) => {
      const counts = { pending: 0, active: 0, dead: 0 };
      for (const jc of jobCounts) {
        if (jc.moduleId === m.id) counts[jc.status as keyof typeof counts] = jc.count;
      }
      const budgetQueued = budgetQueuedByModule.get(m.id) ?? 0;
      const normalPending = Math.max(0, counts.pending - budgetQueued);
      const lastTrade = lastTraces.find((t) => t.moduleId === m.id);
      const lastTrend = lastTrends.find((t) => t.moduleId === m.id);

      const statusText = composeModuleStatusText({
        moduleStatus: m.status,
        moduleType: m.type,
        dead: counts.dead,
        active: counts.active,
        budgetQueued,
        normalPending,
        lastTradeOutcome: lastTrade?.outcome ?? null,
        lastTrendSymbol: lastTrend?.symbol ?? null,
        lastTrendDirection: lastTrend?.direction ?? null,
        lastTrendStrengthBand: lastTrend?.strengthBand ?? null,
      });

      return {
        moduleId: m.id,
        pendingJobs: normalPending,
        budgetQueuedJobs: budgetQueued,
        activeJobs: counts.active,
        deadJobs: counts.dead,
        lastTradeOutcome: lastTrade?.outcome ?? null,
        lastTrendSymbol: lastTrend?.symbol ?? null,
        statusText,
      };
    });

    return { modules: projections };
  });
}
