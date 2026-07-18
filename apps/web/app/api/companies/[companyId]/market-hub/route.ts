import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  MarketHubResponse,
  MarketHubRefreshResponse,
  VerifiedNormalizedBundle,
  type MarketHubEngineChip,
  type MarketHubPipelineBySymbol,
  type MarketHubReportLink,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  companies,
  decisionTrees,
  engineInstances,
  leadPackages,
  ledgerEntries,
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

function uniqEngines(chips: MarketHubEngineChip[]): MarketHubEngineChip[] {
  const seen = new Set<string>();
  const out: MarketHubEngineChip[] = [];
  for (const c of chips) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out.slice(0, 12);
}

/**
 * Market posture hub (D-081 / D-082): equity series, movers, positions with
 * engine chips, watchlists / trends / pipeline, and report navigation links.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const nowMs = clock.nowMs();
    const fetchedAt = new Date(nowMs).toISOString();

    let seal = null;
    try {
      seal = await loadLatestValidSeal(db, {
        companyId,
        kind: 'movers_board',
        subjectKey: 'daily',
        nowMs,
      });
    } catch {
      seal = null;
    }

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
      let expiredMovers: MarketHubResponse['movers'] | null = null;
      try {
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
          expiredMovers = {
            status: 'expired',
            title: parsed.data.view.title,
            sealId: parsed.data.sealId,
            corroborationBand: parsed.data.corroborationBand,
            items: parsed.data.view.items,
            verifiedAt: parsed.data.verifiedAt,
            expiresAt: parsed.data.expiresAt,
            reportConceptId: parsed.data.reportConceptId ?? null,
          };
        }
      } catch {
        expiredMovers = null;
      }
      movers =
        expiredMovers ??
        ({
          status: 'missing',
          title: null,
          sealId: null,
          corroborationBand: null,
          items: [],
          verifiedAt: null,
          expiresAt: null,
          reportConceptId: null,
        } as const);
    }

    const engineRows = await db
      .select({ id: engineInstances.id, label: engineInstances.label })
      .from(engineInstances)
      .where(eq(engineInstances.companyId, companyId));
    const engineById = new Map(engineRows.map((e) => [e.id, e.label]));

    const moduleRows = await db
      .select({
        id: modules.id,
        name: modules.name,
        type: modules.type,
        engineInstanceId: modules.engineInstanceId,
      })
      .from(modules)
      .where(eq(modules.companyId, companyId));
    const moduleById = new Map(moduleRows.map((m) => [m.id, m]));

    const enginesForModule = (moduleId: string): MarketHubEngineChip[] => {
      const mod = moduleById.get(moduleId);
      if (!mod?.engineInstanceId) return [];
      const label = engineById.get(mod.engineInstanceId);
      if (!label) return [];
      return [{ id: mod.engineInstanceId, label }];
    };

    const [watchRows, trendRows, positionRows, leadRows, treeRows, ledgerRows, companyEquity] =
      await Promise.all([
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
          .select({
            id: positions.id,
            moduleId: positions.moduleId,
            moduleName: modules.name,
            moduleType: modules.type,
            symbol: positions.symbol,
            qty: positions.qty,
            avgCostCents: positions.avgCostCents,
            realizedPnlCents: positions.realizedPnlCents,
            updatedAt: positions.updatedAt,
            engineInstanceId: modules.engineInstanceId,
          })
          .from(positions)
          .innerJoin(modules, eq(modules.id, positions.moduleId))
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
        db
          .select({
            createdAt: ledgerEntries.createdAt,
            balanceAfterCents: ledgerEntries.balanceAfterCents,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.companyId, companyId))
          .orderBy(asc(ledgerEntries.createdAt))
          .limit(120),
        db
          .select({
            equityCents: companies.equityCents,
            equityAsOf: companies.equityAsOf,
            equityStatus: companies.equityStatus,
            equityVersion: companies.equityVersion,
          })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1),
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
      engines: enginesForModule(r.moduleId),
    }));

    const trendCandidateRows = trendRows.map((r) => {
      const chips: MarketHubEngineChip[] = [];
      if (r.engineInstanceId) {
        const label = engineById.get(r.engineInstanceId);
        if (label) chips.push({ id: r.engineInstanceId, label });
      }
      chips.push(...enginesForModule(r.moduleId));
      if (r.tradingModuleId) chips.push(...enginesForModule(r.tradingModuleId));
      return {
        id: r.id,
        moduleId: r.moduleId,
        symbol: r.symbol,
        direction: r.direction,
        strengthBand: r.strengthBand,
        status: r.status,
        tradingModuleId: r.tradingModuleId ?? null,
        engineInstanceId: r.engineInstanceId ?? null,
        engines: uniqEngines(chips),
        scannedAt: iso(r.scannedAt),
        createdAt: r.createdAt.toISOString(),
      };
    });

    // Engines also linked via trends for the same symbol (presiding context).
    const enginesBySymbol = new Map<string, MarketHubEngineChip[]>();
    for (const t of trendCandidateRows) {
      const prev = enginesBySymbol.get(t.symbol) ?? [];
      enginesBySymbol.set(t.symbol, uniqEngines([...prev, ...t.engines]));
    }

    const positionProjection = positionRows.map((p) => {
      const quote = getSyntheticQuote(p.symbol, clock);
      const markCents = quote.lastCents ?? p.avgCostCents;
      const unrealized = p.qty * BigInt(markCents - p.avgCostCents);
      const chips: MarketHubEngineChip[] = [];
      if (p.engineInstanceId) {
        const label = engineById.get(p.engineInstanceId);
        if (label) chips.push({ id: p.engineInstanceId, label });
      }
      chips.push(...(enginesBySymbol.get(p.symbol) ?? []));
      return {
        id: p.id,
        moduleId: p.moduleId,
        moduleName: p.moduleName,
        moduleType: p.moduleType,
        symbol: p.symbol,
        qty: p.qty.toString(),
        avgCostCents: p.avgCostCents,
        markCents,
        unrealizedPnlCents: unrealized.toString(),
        realizedPnlCents: p.realizedPnlCents.toString(),
        engines: uniqEngines(chips),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    const equityRow = companyEquity[0];
    const equityStatus = (equityRow?.equityStatus ?? 'unavailable') as
      'fresh' | 'stale' | 'unavailable';
    const equityCents =
      equityRow?.equityCents !== undefined && equityRow.equityCents !== null
        ? equityRow.equityCents.toString()
        : null;

    const series = ledgerRows.map((row) => ({
      t: row.createdAt.toISOString(),
      equityCents: row.balanceAfterCents.toString(),
      positionMarkCents: null as string | null,
    }));
    if (equityCents && equityRow?.equityAsOf) {
      const lastT = series[series.length - 1]?.t;
      const asOf = equityRow.equityAsOf.toISOString();
      if (lastT !== asOf) {
        series.push({ t: asOf, equityCents, positionMarkCents: null });
      } else if (series.length > 0) {
        series[series.length - 1] = { t: asOf, equityCents, positionMarkCents: null };
      }
    }
    if (series.length === 0 && equityCents) {
      series.push({
        t: equityRow?.equityAsOf?.toISOString() ?? fetchedAt,
        equityCents,
        positionMarkCents: null,
      });
    }

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

    const reports: MarketHubReportLink[] = [];
    if (movers.reportConceptId) {
      reports.push({
        id: movers.reportConceptId,
        title: movers.title ?? 'Daily movers report',
        kind: 'movers_report',
      });
    }

    const sectorFocuses = Array.isArray(company.sectorFocuses)
      ? company.sectorFocuses.filter((s): s is string => typeof s === 'string').slice(0, 24)
      : [];

    const body = MarketHubResponse.parse({
      sectorFocuses,
      equity: {
        status: equityStatus,
        equityCents,
        asOfIso: equityRow?.equityAsOf?.toISOString() ?? null,
        version: equityRow?.equityVersion ?? 0,
        series: series.slice(-120),
      },
      movers,
      reports,
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
    try {
      await drainQueues(db, clock, {
        workerId: `inline:${clerkUserId.slice(0, 12)}`,
        budgetMs: 12_000,
        batchSize: 2,
      });
    } catch {
      // Enqueued; drain may fail if seal table/handler prerequisites missing.
    }
    return MarketHubRefreshResponse.parse({
      enqueued: true,
      kind: 'library.system_movers',
    });
  });
}
