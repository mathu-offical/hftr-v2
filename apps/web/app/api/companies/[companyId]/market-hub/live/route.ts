import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { MarketHubLiveResponse } from '@hftr/contracts';
import { scoping } from '@hftr/db';
import { companies, ledgerEntries, modules, positions } from '@hftr/db/schema';
import { buildSymbolViz, createSystemClock, getSyntheticQuote } from '@hftr/engine';
import { withAuth } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const Params = z.object({ companyId: z.string().uuid() });
type Ctx = { params: Promise<{ companyId: string }> };

/**
 * Lightweight live hub slice (D-112).
 * Equity + position marks/sparks only — never blocks Analyze / seal jobs.
 */
export async function GET(_req: Request, ctx: Ctx) {
  return withAuth(async ({ db, clerkUserId }) => {
    const { companyId } = Params.parse(await ctx.params);
    await scoping.getOwnedCompany(db, clerkUserId, companyId);
    const clock = createSystemClock();
    const fetchedAt = new Date(clock.nowMs()).toISOString();

    const [positionRows, ledgerRows, companyEquity] = await Promise.all([
      db
        .select({
          id: positions.id,
          symbol: positions.symbol,
          qty: positions.qty,
          avgCostCents: positions.avgCostCents,
        })
        .from(positions)
        .innerJoin(modules, eq(positions.moduleId, modules.id))
        .where(and(eq(positions.companyId, companyId), eq(modules.companyId, companyId)))
        .orderBy(desc(positions.updatedAt))
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

    const livePositions = positionRows.map((p) => {
      const quote = getSyntheticQuote(p.symbol, clock);
      const markCents = quote.lastCents ?? p.avgCostCents;
      const unrealized = p.qty * BigInt(markCents - p.avgCostCents);
      const unrealizedPnlCents = unrealized.toString();
      const held = {
        markCents,
        avgCostCents: p.avgCostCents,
        unrealizedPnlCents,
      };
      return {
        id: p.id,
        symbol: p.symbol,
        qty: p.qty.toString(),
        avgCostCents: p.avgCostCents,
        markCents,
        unrealizedPnlCents,
        viz: buildSymbolViz({
          symbol: p.symbol,
          clock,
          strengthBand: 'medium',
          relevanceBand: 'medium',
          held,
        }),
      };
    });

    const equityRow = companyEquity[0];
    const equityStatus = (equityRow?.equityStatus ?? 'unavailable') as
      | 'fresh'
      | 'stale'
      | 'unavailable';
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

    return MarketHubLiveResponse.parse({
      fetchedAt,
      equity: {
        status: equityStatus,
        equityCents,
        asOfIso: equityRow?.equityAsOf?.toISOString() ?? null,
        version: equityRow?.equityVersion ?? 0,
        series: series.slice(-120),
      },
      positions: livePositions,
    });
  });
}
