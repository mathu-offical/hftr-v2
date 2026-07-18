import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  MarketHubResponse,
  MarketHubRefreshResponse,
  VerifiedNormalizedBundle,
  type MarketHubPipelineBySymbol,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  decisionTrees,
  leadPackages,
  modules,
  positions,
  systemNormalizedViews,
  trendCandidates,
  watchlistItems,
} from '@hftr/db/schema';
import {
  createSystemClock,
  drainQueues,
  enqueue,
  getSyntheticQuote,
  loadLatestValidSeal,
} from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, 24);
}

/**
 * Market posture hub (D-081): compose movers seal, watchlists, trend candidates,
 * positions, and pipeline stubs for the left-panel Market posture tab.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const nowMs = clock.nowMs();
    const fetchedAt = new Date(nowMs).toISOString();

    const seal = await loadLatestValidSeal(db, {
      companyId,
      kind: 'movers_board',
      subjectKey: 'daily',
      nowMs,
    });

    let movers: MarketHubResponse['movers'];
    if (seal) {
      movers = {
        status: 'ready',
        title: seal.view.title,
        sealId: seal.sealId,
        corroborationBand: seal.corroborationBand,
        items: seal.view.items,
        verifiedAt: seal.verifiedAt,
        expiresAt: seal.expiresAt,
        reportConceptId: seal.reportConceptId ?? null,
      };
    } else {
      // Surface expired seals as status=expired (D-081 freshness honesty).
      const [stale] = await db
        .select({
          bundle: systemNormalizedViews.bundle,
          expiresAt: systemNormalizedViews.expiresAt,
        })
        .from(systemNormalizedViews)
        .where(
          and(
            eq(systemNormalizedViews.companyId, companyId),
            eq(systemNormalizedViews.kind, 'movers_board'),
            eq(systemNormalizedViews.subjectKey, 'daily'),
          ),
        )
        .orderBy(desc(systemNormalizedViews.expiresAt))
        .limit(1);
      const parsed = stale ? VerifiedNormalizedBundle.safeParse(stale.bundle) : null;
      if (parsed?.success && stale && stale.expiresAt.getTime() <= nowMs) {
        movers = {
          status: 'expired',
          title: parsed.data.view.title,
          sealId: parsed.data.sealId,
          corroborationBand: parsed.data.corroborationBand,
          items: parsed.data.view.items,
          verifiedAt: parsed.data.verifiedAt,
          expiresAt: parsed.data.expiresAt,
          reportConceptId: parsed.data.reportConceptId ?? null,
        };
      } else {
        movers = {
          status: 'missing',
          title: null,
          sealId: null,
          corroborationBand: null,
          items: [],
          verifiedAt: null,
          expiresAt: null,
          reportConceptId: null,
        };
      }
    }

    const [watchRows, trendRows, positionRows, leadRows, treeRows] = await Promise.all([
      db
        .select({
          id: watchlistItems.id,
          moduleId: watchlistItems.moduleId,
          moduleName: modules.name,
          moduleType: modules.type,
          symbol: watchlistItems.symbol,
          bias: watchlistItems.bias,
          note: watchlistItems.note,
          sourceClass: watchlistItems.sourceClass,
          status: watchlistItems.status,
          updatedAt: watchlistItems.updatedAt,
        })
        .from(watchlistItems)
        .innerJoin(modules, eq(modules.id, watchlistItems.moduleId))
        .where(eq(watchlistItems.companyId, companyId))
        .orderBy(desc(watchlistItems.updatedAt))
        .limit(200),
      db
        .select()
        .from(trendCandidates)
        .where(eq(trendCandidates.companyId, companyId))
        .orderBy(desc(trendCandidates.createdAt))
        .limit(50),
      db
        .select()
        .from(positions)
        .where(eq(positions.companyId, companyId))
        .orderBy(desc(positions.updatedAt))
        .limit(100),
      db
        .select()
        .from(leadPackages)
        .where(eq(leadPackages.companyId, companyId))
        .orderBy(desc(leadPackages.createdAt))
        .limit(100),
      db
        .select()
        .from(decisionTrees)
        .where(eq(decisionTrees.companyId, companyId))
        .orderBy(desc(decisionTrees.createdAt))
        .limit(100),
    ]);

    const watchlists = watchRows.map((r) => ({
      id: r.id,
      moduleId: r.moduleId,
      moduleName: r.moduleName,
      moduleType: r.moduleType,
      symbol: r.symbol,
      bias: r.bias,
      note: r.note,
      sourceClass: r.sourceClass,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
    }));

    const trendCandidateRows = trendRows.map((r) => ({
      id: r.id,
      moduleId: r.moduleId,
      symbol: r.symbol,
      direction: r.direction,
      strengthBand: r.strengthBand,
      status: r.status,
      tradingModuleId: r.tradingModuleId ?? null,
      engineInstanceId: r.engineInstanceId ?? null,
      scannedAt: iso(r.scannedAt),
      createdAt: r.createdAt.toISOString(),
    }));

    const positionProjection = positionRows.map((p) => {
      const quote = getSyntheticQuote(p.symbol, clock);
      const markCents = quote.lastCents ?? p.avgCostCents;
      const unrealized = p.qty * BigInt(markCents - p.avgCostCents);
      return {
        id: p.id,
        symbol: p.symbol,
        qty: p.qty.toString(),
        avgCostCents: p.avgCostCents,
        markCents,
        unrealizedPnlCents: unrealized.toString(),
        realizedPnlCents: p.realizedPnlCents.toString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    const latestLeadBySymbol = new Map<string, (typeof leadRows)[number]>();
    for (const lead of leadRows) {
      if (!latestLeadBySymbol.has(lead.symbol)) {
        latestLeadBySymbol.set(lead.symbol, lead);
      }
    }
    const latestTreeBySymbol = new Map<string, (typeof treeRows)[number]>();
    for (const tree of treeRows) {
      if (!latestTreeBySymbol.has(tree.symbol)) {
        latestTreeBySymbol.set(tree.symbol, tree);
      }
    }

    const pipelineSymbols = new Set<string>();
    for (const p of positionProjection) pipelineSymbols.add(p.symbol);
    for (const lead of latestLeadBySymbol.keys()) pipelineSymbols.add(lead);
    for (const tree of latestTreeBySymbol.keys()) pipelineSymbols.add(tree);

    const pipeline: MarketHubPipelineBySymbol[] = [...pipelineSymbols]
      .sort()
      .slice(0, 100)
      .map((symbol) => {
        const lead = latestLeadBySymbol.get(symbol);
        const tree = latestTreeBySymbol.get(symbol);
        return {
          symbol,
          lead: lead
            ? {
                id: lead.id,
                symbol: lead.symbol,
                status: lead.status,
                direction: lead.direction,
                strategyFamily: lead.strategyFamily,
                createdAt: lead.createdAt.toISOString(),
              }
            : null,
          tree: tree
            ? {
                id: tree.id,
                leadId: tree.leadId,
                symbol: tree.symbol,
                status: tree.status,
                recoveryLadder: asStringArray(tree.recoveryLadder),
                createdAt: tree.createdAt.toISOString(),
              }
            : null,
        };
      });

    const body = MarketHubResponse.parse({
      movers,
      watchlists,
      trendCandidates: trendCandidateRows,
      positions: positionProjection,
      pipeline,
      freshness: {
        moversExpiresAt: movers.expiresAt,
        fetchedAt,
      },
    });

    return body;
  });
}

/**
 * Operator refresh: enqueue library.system_movers (idempotent — skips when seal valid).
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'RESEARCH',
      kind: 'library.system_movers',
      payload: { companyId },
      idempotencyKey: `market-hub-movers-${companyId}-${randomUUID()}`,
      priority: 'NORMAL',
      companyId,
    });
    await drainQueues(db, clock, {
      workerId: `inline:${clerkUserId.slice(0, 12)}`,
      budgetMs: 12_000,
      batchSize: 2,
    });
    return MarketHubRefreshResponse.parse({
      enqueued: true,
      kind: 'library.system_movers',
    });
  });
}
