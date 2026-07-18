import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { scoping } from '@hftr/db';
import {
  actionTraces,
  jobs,
  libraries,
  libraryConcepts,
  researchTopics,
  trendCandidates,
} from '@hftr/db/schema';
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

/** D-077: type-relevant facts for on-card interactive context. */
export type ModuleTypeContextProjection =
  | {
      kind: 'library';
      libraryId: string | null;
      name: string | null;
      conceptCount: number;
      libraryClass: string | null;
    }
  | {
      kind: 'research';
      topics: { id: string; title: string }[];
      targetLibraries: { id: string; name: string }[];
      researchSubtype: string | null;
      cadenceMinutes: number | null;
    }
  | {
      kind: 'live_api';
      venue: string | null;
      instruments: string[];
      feedClass: string | null;
      pollSeconds: number | null;
    }
  | {
      kind: 'trend';
      trendPosture: string | null;
      maxActiveTrends: number;
      cadenceMinutes: number | null;
      trends: {
        id: string;
        symbol: string;
        direction: string;
        strengthBand: string;
        status: string;
        engineInstanceId: string | null;
        tradingModuleId: string | null;
      }[];
    }
  | { kind: 'none' };

export interface ModuleCanvasProjection extends ModuleStatusProjection {
  typeContext: ModuleTypeContextProjection;
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

function asRecord(config: unknown): Record<string, unknown> {
  return config && typeof config === 'object' && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

/**
 * Per-module status + type-context projection for the canvas (T1.4, D-077).
 * Text-first: statusText is composed server-side so nodes render meaning
 * without client logic.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const moduleRows = await scoping.listModules(db, clerkUserId, companyId);
    const moduleIds = moduleRows.map((m) => m.id);
    if (moduleIds.length === 0) return { modules: [] as ModuleCanvasProjection[] };

    const [
      jobCounts,
      budgetQueuedCounts,
      lastTraces,
      lastTrends,
      libraryRows,
      conceptCounts,
      topicRows,
      trendRows,
    ] = await Promise.all([
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
      db
        .select({
          id: libraries.id,
          moduleId: libraries.moduleId,
          name: libraries.name,
        })
        .from(libraries)
        .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active'))),
      db
        .select({
          libraryId: libraryConcepts.libraryId,
          count: sql<number>`count(*)::int`,
        })
        .from(libraryConcepts)
        .innerJoin(libraries, eq(libraryConcepts.libraryId, libraries.id))
        .where(eq(libraries.companyId, companyId))
        .groupBy(libraryConcepts.libraryId),
      db
        .select({
          id: researchTopics.id,
          moduleId: researchTopics.moduleId,
          title: researchTopics.title,
        })
        .from(researchTopics)
        .where(
          and(
            eq(researchTopics.companyId, companyId),
            eq(researchTopics.status, 'active'),
            inArray(researchTopics.moduleId, moduleIds),
          ),
        )
        .orderBy(desc(researchTopics.updatedAt))
        .limit(200),
      db
        .select({
          id: trendCandidates.id,
          moduleId: trendCandidates.moduleId,
          symbol: trendCandidates.symbol,
          direction: trendCandidates.direction,
          strengthBand: trendCandidates.strengthBand,
          status: trendCandidates.status,
          engineInstanceId: trendCandidates.engineInstanceId,
          tradingModuleId: trendCandidates.tradingModuleId,
          createdAt: trendCandidates.createdAt,
        })
        .from(trendCandidates)
        .where(
          and(
            eq(trendCandidates.companyId, companyId),
            inArray(trendCandidates.status, ['candidate', 'promoted']),
            inArray(trendCandidates.moduleId, moduleIds),
          ),
        )
        .orderBy(desc(trendCandidates.createdAt))
        .limit(200),
    ]);

    const budgetQueuedByModule = new Map(
      budgetQueuedCounts
        .filter((row) => row.moduleId != null)
        .map((row) => [row.moduleId!, row.count] as const),
    );

    const libraryByModule = new Map(
      libraryRows
        .filter((row) => row.moduleId != null)
        .map((row) => [row.moduleId!, row] as const),
    );
    const conceptCountByLibrary = new Map(
      conceptCounts.map((row) => [row.libraryId, row.count] as const),
    );
    const allLibrariesById = new Map(libraryRows.map((row) => [row.id, row]));

    const topicsByModule = new Map<string, { id: string; title: string }[]>();
    for (const topic of topicRows) {
      const list = topicsByModule.get(topic.moduleId) ?? [];
      if (list.length < 8) list.push({ id: topic.id, title: topic.title });
      topicsByModule.set(topic.moduleId, list);
    }

    const trendsByModule = new Map<
      string,
      {
        id: string;
        symbol: string;
        direction: string;
        strengthBand: string;
        status: string;
        engineInstanceId: string | null;
        tradingModuleId: string | null;
      }[]
    >();
    for (const trend of trendRows) {
      const list = trendsByModule.get(trend.moduleId) ?? [];
      list.push({
        id: trend.id,
        symbol: trend.symbol,
        direction: trend.direction,
        strengthBand: trend.strengthBand,
        status: trend.status,
        engineInstanceId: trend.engineInstanceId,
        tradingModuleId: trend.tradingModuleId,
      });
      trendsByModule.set(trend.moduleId, list);
    }

    const projections: ModuleCanvasProjection[] = moduleRows.map((m) => {
      const counts = { pending: 0, active: 0, dead: 0 };
      for (const jc of jobCounts) {
        if (jc.moduleId === m.id) counts[jc.status as keyof typeof counts] = jc.count;
      }
      const budgetQueued = budgetQueuedByModule.get(m.id) ?? 0;
      const normalPending = Math.max(0, counts.pending - budgetQueued);
      const lastTrade = lastTraces.find((t) => t.moduleId === m.id);
      const lastTrend = lastTrends.find((t) => t.moduleId === m.id);
      const config = asRecord(m.config);

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

      let typeContext: ModuleTypeContextProjection = { kind: 'none' };
      switch (m.type) {
        case 'library': {
          const lib = libraryByModule.get(m.id);
          typeContext = {
            kind: 'library',
            libraryId: lib?.id ?? null,
            name: lib?.name ?? null,
            conceptCount: lib ? (conceptCountByLibrary.get(lib.id) ?? 0) : 0,
            libraryClass:
              typeof config.libraryClass === 'string' ? config.libraryClass : null,
          };
          break;
        }
        case 'research': {
          const targetIds = Array.isArray(config.targetLibraryIds)
            ? config.targetLibraryIds.filter((id): id is string => typeof id === 'string')
            : [];
          typeContext = {
            kind: 'research',
            topics: topicsByModule.get(m.id) ?? [],
            targetLibraries: targetIds
              .map((id) => allLibrariesById.get(id))
              .filter((row): row is NonNullable<typeof row> => row != null)
              .map((row) => ({ id: row.id, name: row.name })),
            researchSubtype:
              typeof config.researchSubtype === 'string' ? config.researchSubtype : null,
            cadenceMinutes:
              typeof config.cadenceMinutes === 'number' ? config.cadenceMinutes : null,
          };
          break;
        }
        case 'live_api': {
          const instruments = Array.isArray(config.instruments)
            ? config.instruments.filter((s): s is string => typeof s === 'string')
            : [];
          typeContext = {
            kind: 'live_api',
            venue: typeof config.venue === 'string' ? config.venue : null,
            instruments,
            feedClass: typeof config.feedClass === 'string' ? config.feedClass : null,
            pollSeconds: typeof config.pollSeconds === 'number' ? config.pollSeconds : null,
          };
          break;
        }
        case 'trend': {
          const maxActive =
            typeof config.maxActiveTrends === 'number' && config.maxActiveTrends > 0
              ? config.maxActiveTrends
              : 10;
          const all = trendsByModule.get(m.id) ?? [];
          typeContext = {
            kind: 'trend',
            trendPosture:
              typeof config.trendPosture === 'string' ? config.trendPosture : null,
            maxActiveTrends: maxActive,
            cadenceMinutes:
              typeof config.cadenceMinutes === 'number' ? config.cadenceMinutes : null,
            trends: all.slice(0, maxActive),
          };
          break;
        }
        default:
          typeContext = { kind: 'none' };
          break;
      }

      return {
        moduleId: m.id,
        pendingJobs: normalPending,
        budgetQueuedJobs: budgetQueued,
        activeJobs: counts.active,
        deadJobs: counts.dead,
        lastTradeOutcome: lastTrade?.outcome ?? null,
        lastTrendSymbol: lastTrend?.symbol ?? null,
        statusText,
        typeContext,
      };
    });

    return { modules: projections };
  });
}
