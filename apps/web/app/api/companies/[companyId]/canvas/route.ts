import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import { actionTraces, jobs, trendCandidates } from '@hftr/db/schema';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

export interface ModuleStatusProjection {
  moduleId: string;
  pendingJobs: number;
  activeJobs: number;
  deadJobs: number;
  lastTradeOutcome: string | null;
  lastTrendSymbol: string | null;
  statusText: string;
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

    const [jobCounts, lastTraces, lastTrends] = await Promise.all([
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

    const projections: ModuleStatusProjection[] = moduleRows.map((m) => {
      const counts = { pending: 0, active: 0, dead: 0 };
      for (const jc of jobCounts) {
        if (jc.moduleId === m.id) counts[jc.status as keyof typeof counts] = jc.count;
      }
      const lastTrade = lastTraces.find((t) => t.moduleId === m.id);
      const lastTrend = lastTrends.find((t) => t.moduleId === m.id);

      let statusText: string;
      if (m.status !== 'active') statusText = m.status;
      else if (counts.dead > 0) statusText = `error: dead jobs (${counts.dead})`;
      else if (counts.active > 0) statusText = `working · ${counts.active} active`;
      else if (counts.pending > 0) statusText = `queued · ${counts.pending} pending`;
      else if (m.type === 'trading' && lastTrade) statusText = `last: ${lastTrade.outcome}`;
      else if (m.type === 'trend' && lastTrend)
        statusText = `${lastTrend.symbol} ${lastTrend.direction} (${lastTrend.strengthBand})`;
      else statusText = 'idle';

      return {
        moduleId: m.id,
        pendingJobs: counts.pending,
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
