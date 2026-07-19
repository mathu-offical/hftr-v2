import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  RESEARCH_SOURCE_REGISTRY,
  MarketHubResponse,
  MarketHubRefreshResponse,
  type MarketHubEngineChip,
  type MarketHubPipelineBySymbol,
  type MarketHubReportLink,
  type MarketHubSourceRow,
} from '@hftr/contracts';
import { scoping } from '@hftr/db';
import {
  companies,
  concepts,
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
  loadLatestSynthesisRun,
  parseVerifiedSealBundle,
  resolveResearchGatherCredentials,
  MOVERS_LANE_SOURCE_KINDS,
  researchAvailabilityFromCredentials,
  buildSymbolViz,
  buildMarketHubCharts,
  mapTrendStrengthToBand,
  projectMarketModelToAwareness,
  resolveExecutionContext,
  resolveMarketQuoteWithAdapter,
} from '@hftr/engine';
import type { MarketHubSymbolViz, QualitativeBand } from '@hftr/contracts';
import { withAuth } from '@/lib/api';
import { projectMarketHubCapitalSources } from '@/lib/market-hub-capital';
import { projectMarketHubModelHydration } from '@/lib/market-hub-model-hydration';
import { buildMarketHubModelPanelSurfaces } from '@/lib/market-hub-panel-surfaces';
import { buildMarketHubSourceChips } from '@/lib/market-hub-source-chips';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

function looksLikeTicker(label: string | undefined): label is string {
  if (!label) return false;
  const s = label.trim().replace(/^\$/, '').toUpperCase();
  return /^[A-Z]{1,5}$/.test(s);
}

function watchRelevance(status: string, sourceClass: string): QualitativeBand {
  if (sourceClass === 'movers_rank') return 'high';
  if (status === 'suggested_verified' || status === 'triggered') return 'high';
  if (status === 'watching') return 'medium';
  return 'low';
}

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

/** Report seals projected into Market posture hub (D-085 / D-101). */
const REPORT_SEAL_LOOKUPS: Array<{
  kind: 'movers_board' | 'sector_bulletin' | 'daily_summary_phase';
  subjectKey: string;
  reportKind: MarketHubReportLink['kind'];
  fallbackTitle: string;
}> = [
  {
    kind: 'movers_board',
    subjectKey: 'daily',
    reportKind: 'movers_report',
    fallbackTitle: 'Daily movers report',
  },
  {
    kind: 'sector_bulletin',
    subjectKey: 'sector_daily',
    reportKind: 'sector_bulletin',
    fallbackTitle: 'Sector bulletin',
  },
  {
    kind: 'daily_summary_phase',
    subjectKey: 'phase_pre_open',
    reportKind: 'daily_summary',
    fallbackTitle: 'Daily summary · pre-open',
  },
  {
    kind: 'daily_summary_phase',
    subjectKey: 'phase_midday',
    reportKind: 'daily_summary',
    fallbackTitle: 'Daily summary · midday',
  },
  {
    kind: 'daily_summary_phase',
    subjectKey: 'phase_close',
    reportKind: 'daily_summary',
    fallbackTitle: 'Daily summary · close',
  },
  {
    kind: 'daily_summary_phase',
    subjectKey: 'phase_post_analysis',
    reportKind: 'daily_summary',
    fallbackTitle: 'Daily summary · post',
  },
];

/**
 * Market posture hub (D-081 / D-085 / D-101): equity series, movers, positions with
 * engine chips, watchlists / trends / pipeline, and multi-seal report navigation links.
 * `series[].positionMarkCents` stays null until a durable mark history exists —
 * UI draws a dashed current-mark reference rather than inventing a path.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    const company = await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const nowMs = clock.nowMs();
    const fetchedAt = new Date(nowMs).toISOString();

    let seal = null;
    let contributedKinds: string[] = [];
    let sourcesScannedAt: string | null = null;
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
      contributedKinds = (seal.contributingSourceKinds ?? []).slice(0, 32);
      sourcesScannedAt = seal.verifiedAt;
      movers = {
        status: 'ready',
        title: seal.view.title,
        sealId: seal.sealId,
        corroborationBand: seal.corroborationBand,
        items: seal.view.items,
        itemViz: [],
        verifiedAt: seal.verifiedAt,
        expiresAt: seal.expiresAt,
        reportConceptId: seal.reportConceptId ?? null,
        sourceChips: buildMarketHubSourceChips(contributedKinds),
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
        const parsed = stale ? parseVerifiedSealBundle(stale.bundle) : null;
        if (parsed && stale && stale.expiresAt.getTime() <= nowMs) {
          contributedKinds = (parsed.contributingSourceKinds ?? []).slice(0, 32);
          sourcesScannedAt = parsed.verifiedAt;
          expiredMovers = {
            status: 'expired',
            title: parsed.view.title,
            sealId: parsed.sealId,
            corroborationBand: parsed.corroborationBand,
            items: parsed.view.items,
            itemViz: [],
            verifiedAt: parsed.verifiedAt,
            expiresAt: parsed.expiresAt,
            reportConceptId: parsed.reportConceptId ?? null,
            sourceChips: buildMarketHubSourceChips(contributedKinds),
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
          itemViz: [],
          verifiedAt: null,
          expiresAt: null,
          reportConceptId: null,
          sourceChips: [],
        } as const);
    }

    const engineRows = await db
      .select({
        id: engineInstances.id,
        label: engineInstances.label,
        capitalAllocationRef: engineInstances.capitalAllocationRef,
      })
      .from(engineInstances)
      .where(eq(engineInstances.companyId, companyId));
    const engineById = new Map(engineRows.map((e) => [e.id, e.label]));

    const moduleRows = await db
      .select({
        id: modules.id,
        name: modules.name,
        type: modules.type,
        engineInstanceId: modules.engineInstanceId,
        config: modules.config,
        capitalAllocationRef: modules.capitalAllocationRef,
        status: modules.status,
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

    const [
      watchRows,
      trendRows,
      positionRows,
      leadRows,
      treeRows,
      ledgerRows,
      companyEquity,
      moduleLedgerRows,
    ] = await Promise.all([
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
          seedCreditsCents: companies.seedCreditsCents,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1),
      db
        .select({
          moduleId: ledgerEntries.moduleId,
          balanceAfterCents: ledgerEntries.balanceAfterCents,
        })
        .from(ledgerEntries)
        .where(
          and(eq(ledgerEntries.companyId, companyId), sql`${ledgerEntries.moduleId} is not null`),
        )
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(500),
    ]);

    const moduleLedgerBalance = new Map<string, string>();
    for (const row of moduleLedgerRows) {
      if (!row.moduleId) continue;
      if (moduleLedgerBalance.has(row.moduleId)) continue;
      moduleLedgerBalance.set(row.moduleId, row.balanceAfterCents.toString());
    }

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
        direction: r.direction as 'up' | 'down' | 'flat',
        strengthBand: r.strengthBand as 'weak' | 'moderate' | 'strong',
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

    const heldBySymbol = new Map<
      string,
      { markCents: number; avgCostCents: number; unrealizedPnlCents: string }
    >();

    const positionProjection = positionRows.map((p) => {
      const quote = getSyntheticQuote(p.symbol, clock);
      const markCents = quote.lastCents ?? p.avgCostCents;
      const unrealized = p.qty * BigInt(markCents - p.avgCostCents);
      const unrealizedPnlCents = unrealized.toString();
      const chips: MarketHubEngineChip[] = [];
      if (p.engineInstanceId) {
        const label = engineById.get(p.engineInstanceId);
        if (label) chips.push({ id: p.engineInstanceId, label });
      }
      chips.push(...(enginesBySymbol.get(p.symbol) ?? []));
      const held = {
        markCents,
        avgCostCents: p.avgCostCents,
        unrealizedPnlCents,
      };
      heldBySymbol.set(p.symbol.toUpperCase(), held);
      const viz = buildSymbolViz({
        symbol: p.symbol,
        clock,
        strengthBand: 'medium',
        relevanceBand: 'medium',
        held,
      });
      return {
        id: p.id,
        moduleId: p.moduleId,
        moduleName: p.moduleName,
        moduleType: p.moduleType,
        symbol: p.symbol,
        qty: p.qty.toString(),
        avgCostCents: p.avgCostCents,
        markCents,
        unrealizedPnlCents,
        realizedPnlCents: p.realizedPnlCents.toString(),
        engines: uniqEngines(chips),
        updatedAt: p.updatedAt.toISOString(),
        viz,
      };
    });

    const watchlistsWithViz = watchlists.map((w) => {
      const held = heldBySymbol.get(w.symbol.toUpperCase());
      const relevance = watchRelevance(w.status, w.sourceClass);
      const viz = held
        ? buildSymbolViz({
            symbol: w.symbol,
            clock,
            strengthBand: relevance,
            relevanceBand: relevance,
            held: {
              markCents: held.markCents,
              avgCostCents: held.avgCostCents,
              unrealizedPnlCents: held.unrealizedPnlCents,
            },
          })
        : buildSymbolViz({
            symbol: w.symbol,
            clock,
            strengthBand: relevance,
            relevanceBand: relevance,
          });
      const kinds: string[] = [];
      if (w.sourceClass === 'operator') kinds.push('operator');
      else if (w.sourceClass === 'movers_rank') kinds.push('movers_rank', 'library');
      else if (w.sourceClass) kinds.push(w.sourceClass);
      else kinds.push('operator');
      return { ...w, viz, sourceChips: buildMarketHubSourceChips(kinds) };
    });

    const trendsWithViz = trendCandidateRows.map((t) => {
      const held = heldBySymbol.get(t.symbol.toUpperCase());
      const strength = mapTrendStrengthToBand(t.strengthBand);
      const viz = held
        ? buildSymbolViz({
            symbol: t.symbol,
            clock,
            direction: t.direction,
            strengthBand: strength,
            relevanceBand: strength,
            held: {
              markCents: held.markCents,
              avgCostCents: held.avgCostCents,
              unrealizedPnlCents: held.unrealizedPnlCents,
            },
          })
        : buildSymbolViz({
            symbol: t.symbol,
            clock,
            direction: t.direction,
            strengthBand: strength,
            relevanceBand: strength,
          });
      return { ...t, viz };
    });

    const moversItemViz: MarketHubSymbolViz[] = [];
    for (const item of movers.items) {
      if (!looksLikeTicker(item.symbolOrSector)) continue;
      const sym = item.symbolOrSector.trim().replace(/^\$/, '').toUpperCase();
      const held = heldBySymbol.get(sym);
      const strength = (item.strengthBand ?? 'medium') as QualitativeBand;
      const relevance = (item.directionBand ?? strength) as QualitativeBand;
      moversItemViz.push(
        held
          ? buildSymbolViz({
              symbol: sym,
              clock,
              strengthBand: strength,
              relevanceBand: relevance,
              held: {
                markCents: held.markCents,
                avgCostCents: held.avgCostCents,
                unrealizedPnlCents: held.unrealizedPnlCents,
              },
            })
          : buildSymbolViz({
              symbol: sym,
              clock,
              strengthBand: strength,
              relevanceBand: relevance,
            }),
      );
    }
    movers = { ...movers, itemViz: moversItemViz };

    const equityRow = companyEquity[0];
    const equityStatus = (equityRow?.equityStatus ?? 'unavailable') as
      'fresh' | 'stale' | 'unavailable';
    const equityCents =
      equityRow?.equityCents !== undefined && equityRow.equityCents !== null
        ? equityRow.equityCents.toString()
        : null;

    const companyPoolCents =
      equityRow?.equityCents != null && equityRow.equityCents > 0n
        ? equityRow.equityCents
        : equityRow?.seedCreditsCents != null && equityRow.seedCreditsCents > 0n
          ? equityRow.seedCreditsCents
          : null;

    const capitalSources = await projectMarketHubCapitalSources({
      db,
      moduleRows,
      engineLabelById: engineById,
      moduleLedgerBalance,
      companyPoolCents,
      companyId,
    });

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
    const seenReportIds = new Set<string>();
    for (const lookup of REPORT_SEAL_LOOKUPS) {
      if (reports.length >= 8) break;
      let reportSeal = null;
      try {
        reportSeal = await loadLatestValidSeal(db, {
          companyId,
          kind: lookup.kind,
          subjectKey: lookup.subjectKey,
          nowMs,
        });
      } catch {
        reportSeal = null;
      }
      const conceptId = reportSeal?.reportConceptId ?? null;
      if (!conceptId || seenReportIds.has(conceptId)) continue;
      seenReportIds.add(conceptId);
      reports.push({
        id: conceptId,
        title: reportSeal?.view.title?.slice(0, 200) || lookup.fallbackTitle,
        kind: lookup.reportKind,
        expiresAt: reportSeal?.expiresAt ?? null,
      });
    }
    // Movers board may be expired but still have a navigable report concept.
    if (
      movers.reportConceptId &&
      !seenReportIds.has(movers.reportConceptId) &&
      reports.length < 8
    ) {
      reports.push({
        id: movers.reportConceptId,
        title: movers.title ?? 'Daily movers report',
        kind: 'movers_report',
        expiresAt: movers.expiresAt,
      });
    }

    const [narrativeConcept] = await db
      .select({ id: concepts.id })
      .from(concepts)
      .where(
        and(
          eq(concepts.companyId, companyId),
          eq(concepts.title, 'posture_synthesis_narrative'),
          eq(concepts.status, 'active'),
        ),
      )
      .orderBy(desc(concepts.updatedAt))
      .limit(1);
    if (narrativeConcept && !seenReportIds.has(narrativeConcept.id) && reports.length < 8) {
      seenReportIds.add(narrativeConcept.id);
      reports.push({
        id: narrativeConcept.id,
        title: 'Posture synthesis narrative',
        kind: 'posture_narrative',
      });
    }

    let sectorExpiresAt: string | null = null;
    let dailyExpiresAt: string | null = null;
    let news: {
      status: 'ready' | 'missing' | 'expired';
      title: string | null;
      sealId: string | null;
      corroborationBand: QualitativeBand | null;
      items: Array<{
        symbolOrSector?: string;
        directionBand?: QualitativeBand;
        strengthBand?: QualitativeBand;
        headline?: string;
      }>;
      verifiedAt: string | null;
      expiresAt: string | null;
      reportConceptId: string | null;
      sourceChips: ReturnType<typeof buildMarketHubSourceChips>;
    } = {
      status: 'missing',
      title: null,
      sealId: null,
      corroborationBand: null,
      items: [],
      verifiedAt: null,
      expiresAt: null,
      reportConceptId: null,
      sourceChips: [],
    };
    try {
      const sectorSeal = await loadLatestValidSeal(db, {
        companyId,
        kind: 'sector_bulletin',
        subjectKey: 'sector_daily',
        nowMs,
      });
      sectorExpiresAt = sectorSeal?.expiresAt ?? null;
      if (sectorSeal) {
        const expMs = Date.parse(sectorSeal.expiresAt);
        const expired = Number.isFinite(expMs) && expMs <= nowMs;
        const newsKinds = (sectorSeal.contributingSourceKinds ?? []).slice(0, 32);
        news = {
          status: expired ? 'expired' : 'ready',
          title: sectorSeal.view.title?.slice(0, 300) ?? null,
          sealId: sectorSeal.sealId,
          corroborationBand: sectorSeal.corroborationBand,
          items: sectorSeal.view.items.slice(0, 48).map((item) => ({
            ...(item.symbolOrSector ? { symbolOrSector: item.symbolOrSector } : {}),
            ...(item.directionBand ? { directionBand: item.directionBand } : {}),
            ...(item.strengthBand ? { strengthBand: item.strengthBand } : {}),
            ...(item.headline ? { headline: item.headline } : {}),
          })),
          verifiedAt: sectorSeal.verifiedAt,
          expiresAt: sectorSeal.expiresAt,
          reportConceptId: sectorSeal.reportConceptId ?? null,
          sourceChips: buildMarketHubSourceChips(newsKinds),
        };
      }
    } catch {
      sectorExpiresAt = null;
    }
    try {
      const dailySealLookups = REPORT_SEAL_LOOKUPS.filter((l) => l.kind === 'daily_summary_phase');
      for (const lookup of dailySealLookups) {
        const seal = await loadLatestValidSeal(db, {
          companyId,
          kind: lookup.kind,
          subjectKey: lookup.subjectKey,
          nowMs,
        });
        if (seal?.expiresAt) {
          dailyExpiresAt = seal.expiresAt;
          break;
        }
      }
    } catch {
      dailyExpiresAt = null;
    }

    const synthesisRun = await loadLatestSynthesisRun(db, { companyId });
    const stagesDone =
      synthesisRun?.stages.filter(
        (s) =>
          s.status === 'succeeded' || s.status === 'skipped' || s.status === 'failed',
      ).length ?? 0;
    const synthesis = {
      runId: synthesisRun?.id ?? null,
      status: synthesisRun?.status ?? null,
      narrativeConceptId: narrativeConcept?.id ?? null,
      stagesDone,
      stagesTotal: synthesisRun?.stages.length ?? 0,
      errorCode: synthesisRun?.errorCode ?? null,
    };

    const sectorFocuses = Array.isArray(company.sectorFocuses)
      ? company.sectorFocuses.filter((s): s is string => typeof s === 'string').slice(0, 64)
      : [];
    const universeExcludes = Array.isArray(company.universeExcludes)
      ? company.universeExcludes.filter((s): s is string => typeof s === 'string').slice(0, 200)
      : [];

    const gatherCredentials = await resolveResearchGatherCredentials(db, companyId);
    const availability = researchAvailabilityFromCredentials(gatherCredentials);
    const contributedSet = new Set(contributedKinds);
    const sourceLanes: MarketHubSourceRow[] = MOVERS_LANE_SOURCE_KINDS.map((kind) => {
      const descriptor = RESEARCH_SOURCE_REGISTRY[kind];
      let status: MarketHubSourceRow['status'] = 'ready';
      switch (descriptor.authMode) {
        case 'none':
          status = 'ready';
          break;
        case 'research_key':
          status =
            descriptor.keyProvider && availability.researchKeys.includes(descriptor.keyProvider)
              ? 'ready'
              : 'missing_key';
          break;
        case 'broker_paper':
          status = availability.hasAlpacaPaper ? 'ready' : 'missing_key';
          break;
        default: {
          const _exhaustive: never = descriptor.authMode;
          void _exhaustive;
          status = 'missing_key';
        }
      }
      return {
        kind,
        domain: descriptor.domain,
        label: kind.replace(/_/g, ' '),
        authMode: descriptor.authMode,
        status,
        contributed: contributedSet.has(kind),
      };
    });

    const charts = buildMarketHubCharts({
      positions: positionProjection,
      watchlists: watchlistsWithViz,
      trends: trendsWithViz,
      moverDirections: moversItemViz.map((v) => v.direction),
      sourceLanes: sourceLanes.map((l) => ({ status: l.status })),
    });

    // Shared MarketModel awareness for day overlay (D-122) — same quote path as dispatch/exits.
    const awarenessSymbols = new Set<string>();
    for (const p of positionProjection) awarenessSymbols.add(p.symbol.toUpperCase());
    for (const w of watchlistsWithViz.slice(0, 24)) awarenessSymbols.add(w.symbol.toUpperCase());
    for (const t of trendsWithViz.slice(0, 12)) awarenessSymbols.add(t.symbol.toUpperCase());
    for (const m of movers.items.slice(0, 24)) {
      if (looksLikeTicker(m.symbolOrSector)) {
        awarenessSymbols.add(m.symbolOrSector.trim().replace(/^\$/, '').toUpperCase());
      }
    }
    const awarenessSymbolList = [...awarenessSymbols].slice(0, 32);

    let marketModelAwareness: {
      symbols: string[];
      feedClasses: string[];
      usedLiveCount: number;
      syntheticCount: number;
      asOfIso: string;
      notes: string[];
    };
    let markFeedClass: 'synthetic' | 'broker_paper' = 'synthetic';
    if (awarenessSymbolList.length === 0) {
      marketModelAwareness = {
        symbols: [],
        feedClasses: [],
        usedLiveCount: 0,
        syntheticCount: 0,
        asOfIso: clock.nowIso(),
        notes: [
          'No held, watch, trend, or mover tickers to mark yet — MarketModel idle',
          'Day overlay shares this substrate with paper dispatch and exits',
        ],
      };
    } else {
      let adapter = null as Awaited<
        ReturnType<typeof resolveExecutionContext>
      >['adapter'] | null;
      try {
        const execCtx = await resolveExecutionContext(db, clock, companyId);
        adapter = execCtx.adapter;
      } catch {
        adapter = null;
      }
      const resolved = [];
      for (const symbol of awarenessSymbolList) {
        resolved.push(await resolveMarketQuoteWithAdapter({ symbol, clock, adapter }));
      }
      const projections = projectMarketModelToAwareness(resolved, clock);
      const posture = projections.find((p) => p.surface === 'market_posture_hub');
      marketModelAwareness = posture
        ? {
            symbols: posture.symbols.slice(0, 64),
            feedClasses: posture.feedClasses.slice(0, 16),
            usedLiveCount: posture.usedLiveCount,
            syntheticCount: posture.syntheticCount,
            asOfIso: posture.asOfIso,
            notes: posture.notes.slice(0, 8),
          }
        : {
            symbols: awarenessSymbolList.slice(0, 64),
            feedClasses: [],
            usedLiveCount: 0,
            syntheticCount: awarenessSymbolList.length,
            asOfIso: clock.nowIso(),
            notes: ['MarketModel projection unavailable — synthetic fallback implied'],
          };
      if (marketModelAwareness.usedLiveCount > 0) markFeedClass = 'broker_paper';
    }

    const modelHydrationBase = await projectMarketHubModelHydration({
      db,
      companyId,
      availability,
      contributedKinds,
      usedLiveMarks: marketModelAwareness.usedLiveCount,
      syntheticMarks: marketModelAwareness.syntheticCount,
      moversItemCount: movers.items.length,
      newsItemCount: news.items.length,
      watchlistCount: watchlistsWithViz.length,
      positionCount: positionProjection.length,
      asOfIso: fetchedAt,
      sealStamps: {
        moversVerifiedAt: movers.verifiedAt,
        moversExpiresAt: movers.expiresAt,
        newsVerifiedAt: news.verifiedAt,
        newsExpiresAt: news.expiresAt,
        dailyExpiresAt: dailyExpiresAt ?? null,
      },
    });
    const modelHydration = {
      ...modelHydrationBase,
      panelSurfaces: buildMarketHubModelPanelSurfaces({
        equity: {
          status: equityStatus,
          asOfIso: equityRow?.equityAsOf?.toISOString() ?? null,
          equityCents,
        },
        movers,
        news,
        positions: positionProjection,
        watchlists: watchlistsWithViz,
        capitalSources,
        reports,
        charts,
      }),
    };

    const markChipKinds =
      markFeedClass === 'broker_paper' ? ['broker_paper'] : ['synthetic_sim'];
    const positionsWithChips = positionProjection.map((p) => ({
      ...p,
      sourceChips: buildMarketHubSourceChips([...markChipKinds, 'ledger']),
    }));
    const equitySourceChips = buildMarketHubSourceChips(
      equityCents != null ? ['ledger'] : [],
    );

    const body = MarketHubResponse.parse({
      sectorFocuses,
      universeExcludes,
      equity: {
        status: equityStatus,
        equityCents,
        asOfIso: equityRow?.equityAsOf?.toISOString() ?? null,
        version: equityRow?.equityVersion ?? 0,
        series: series.slice(-120),
        sourceChips: equitySourceChips,
      },
      movers,
      reports,
      watchlists: watchlistsWithViz,
      trendCandidates: trendsWithViz,
      positions: positionsWithChips,
      pipeline,
      capitalSources,
      news,
      freshness: {
        moversExpiresAt: movers.expiresAt,
        sectorExpiresAt,
        dailyExpiresAt,
        fetchedAt,
      },
      synthesis,
      marketModelAwareness,
      modelHydration,
      sources: {
        lanes: sourceLanes,
        contributedKinds,
        markFeedClass,
        scannedAt: sourcesScannedAt,
      },
      charts,
    });

    return body;
  });
}

/**
 * Operator refresh: enqueue library.system_movers (idempotent — skips when seal valid).
 * Drain budget is long enough for gather + compound rank + seal persist (D-101).
 */
export async function POST(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    await enqueue(db, clock, {
      queueClass: 'POSTURE_RESEARCH',
      kind: 'library.system_movers',
      payload: { companyId },
      idempotencyKey: `market-hub-movers-${companyId}-${randomUUID()}`,
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
        budgetMs: 45_000,
        batchSize: 4,
        queueClasses: ['POSTURE_RESEARCH'],
        kickMaintenanceSweep: false,
      });
    } catch (err) {
      // Enqueued; drain may fail if seal table/handler prerequisites missing.
      drainError = err instanceof Error ? err.message : String(err);
    }
    return MarketHubRefreshResponse.parse({
      enqueued: true,
      kind: 'library.system_movers',
      ...(drained ? { drained } : {}),
      ...(drainError ? { drainError } : {}),
    });
  });
}
