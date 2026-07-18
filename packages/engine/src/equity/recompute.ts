import { and, eq, gt } from 'drizzle-orm';
import type { CompanyEquityProjection } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { companies, positions } from '@hftr/db/schema';
import type { Clock } from '../clock';
import * as calcStore from '../calc/store';
import { getCompanyBalanceCents } from '../dispatch/balances';
import {
  calculateCompanyEquity,
  type EquityConfirmedPosition,
  type EquityMarkCandidate,
} from './equity';

/** Quote / mark freshness window for equity (plan: 15s fallback while live data available). */
export const DEFAULT_EQUITY_MARK_TTL_MS = 15_000;

export type EquityTrigger =
  | 'fill'
  | 'reconcile'
  | 'quote'
  | 'schedule'
  | 'manual'
  | 'create';

export type RecomputeCompanyEquityOpts = {
  marks?: readonly EquityMarkCandidate[];
  ttlMs?: number;
  /** When set, reject writes if company.equity_version !== expectedVersion. */
  expectedVersion?: number;
};

type CompanyEquityRow = {
  equityCents: bigint | null;
  equityRef: string | null;
  equityAsOf: Date | null;
  equityStatus: 'fresh' | 'stale' | 'unavailable';
  equityVersion: number;
};

function toProjection(row: CompanyEquityRow): CompanyEquityProjection {
  if (row.equityStatus === 'fresh') {
    if (row.equityCents === null || row.equityAsOf === null) {
      return {
        status: 'unavailable',
        equityCents: row.equityCents?.toString() ?? null,
        asOfIso: row.equityAsOf?.toISOString() ?? null,
        version: row.equityVersion,
      };
    }
    return {
      status: 'fresh',
      equityCents: row.equityCents.toString(),
      asOfIso: row.equityAsOf.toISOString(),
      version: row.equityVersion,
    };
  }
  if (row.equityStatus === 'stale') {
    if (row.equityCents === null || row.equityAsOf === null) {
      return {
        status: 'unavailable',
        equityCents: null,
        asOfIso: null,
        version: row.equityVersion,
      };
    }
    return {
      status: 'stale',
      equityCents: row.equityCents.toString(),
      asOfIso: row.equityAsOf.toISOString(),
      version: row.equityVersion,
    };
  }
  return {
    status: 'unavailable',
    equityCents: row.equityCents?.toString() ?? null,
    asOfIso: row.equityAsOf?.toISOString() ?? null,
    version: row.equityVersion,
  };
}

/**
 * Decide next projection fields from a calc result without touching the DB.
 * Fail-closed: unavailable calc preserves last good cents as `stale` when present.
 */
export function nextEquityFields(
  prev: CompanyEquityRow,
  calc: ReturnType<typeof calculateCompanyEquity>,
  nowMs: number,
  newEquityRef: string | null,
): Omit<CompanyEquityRow, 'equityVersion'> & { bumpVersion: boolean } {
  if (calc.status === 'fresh') {
    return {
      equityCents: calc.equityCents,
      equityRef: newEquityRef,
      equityAsOf: new Date(nowMs),
      equityStatus: 'fresh',
      bumpVersion: true,
    };
  }

  if (prev.equityCents !== null && prev.equityAsOf !== null) {
    return {
      equityCents: prev.equityCents,
      equityRef: prev.equityRef,
      equityAsOf: prev.equityAsOf,
      equityStatus: 'stale',
      bumpVersion: true,
    };
  }

  return {
    equityCents: null,
    equityRef: prev.equityRef,
    equityAsOf: null,
    equityStatus: 'unavailable',
    bumpVersion: true,
  };
}

async function loadOpenPositions(db: Db, companyId: string): Promise<EquityConfirmedPosition[]> {
  const rows = await db
    .select({
      symbol: positions.symbol,
      qty: positions.qty,
    })
    .from(positions)
    .where(and(eq(positions.companyId, companyId), gt(positions.qty, 0n)));

  return rows.map((row) => ({
    symbol: row.symbol,
    qty: row.qty,
  }));
}

/**
 * Deterministic company equity recompute + projection write (D-064).
 * Preserves last successful cents as `stale` when calc is unavailable.
 */
export async function recomputeCompanyEquity(
  db: Db,
  clock: Clock,
  companyId: string,
  trigger: EquityTrigger,
  opts?: RecomputeCompanyEquityOpts,
): Promise<CompanyEquityProjection> {
  const nowMs = clock.nowMs();
  const ttlMs = opts?.ttlMs ?? DEFAULT_EQUITY_MARK_TTL_MS;
  const marks = opts?.marks ?? [];

  const companyRows = await db
    .select({
      equityCents: companies.equityCents,
      equityRef: companies.equityRef,
      equityAsOf: companies.equityAsOf,
      equityStatus: companies.equityStatus,
      equityVersion: companies.equityVersion,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const prev = companyRows[0];
  if (!prev) {
    return {
      status: 'unavailable',
      equityCents: null,
      asOfIso: null,
      version: 0,
    };
  }

  if (opts?.expectedVersion !== undefined && prev.equityVersion !== opts.expectedVersion) {
    return toProjection(prev);
  }

  const cashCents = await getCompanyBalanceCents(db, companyId);
  const openPositions = await loadOpenPositions(db, companyId);
  const calc = calculateCompanyEquity({
    cash: { cashCents },
    positions: openPositions,
    marks,
    nowMs,
    ttlMs,
  });

  let newEquityRef: string | null = null;
  if (calc.status === 'fresh') {
    newEquityRef = await calcStore.record(db, clock, {
      kind: 'usd_cents',
      unit: 'USD_cents',
      scale: 0,
      valueInt: calc.equityCents,
      sourceClass: 'derived',
      sourceId: `company_equity:${companyId}:${trigger}`,
      ttlMs: Number.MAX_SAFE_INTEGER,
      companyId,
      sanity: {
        minInt: '0',
        maxInt: null,
        maxAgeMs: null,
        mustBePositive: false,
      },
    });
  }

  const next = nextEquityFields(prev, calc, nowMs, newEquityRef);
  const nextVersion = next.bumpVersion ? prev.equityVersion + 1 : prev.equityVersion;

  const whereClause =
    opts?.expectedVersion !== undefined
      ? and(eq(companies.id, companyId), eq(companies.equityVersion, opts.expectedVersion))
      : eq(companies.id, companyId);

  const updated = await db
    .update(companies)
    .set({
      equityCents: next.equityCents,
      equityRef: next.equityRef,
      equityAsOf: next.equityAsOf,
      equityStatus: next.equityStatus,
      equityVersion: nextVersion,
      updatedAt: new Date(nowMs),
    })
    .where(whereClause)
    .returning({
      equityCents: companies.equityCents,
      equityRef: companies.equityRef,
      equityAsOf: companies.equityAsOf,
      equityStatus: companies.equityStatus,
      equityVersion: companies.equityVersion,
    });

  if (updated[0]) {
    return toProjection(updated[0]);
  }

  // Concurrent version lost the race — return current row.
  const refreshed = await db
    .select({
      equityCents: companies.equityCents,
      equityRef: companies.equityRef,
      equityAsOf: companies.equityAsOf,
      equityStatus: companies.equityStatus,
      equityVersion: companies.equityVersion,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return toProjection(
    refreshed[0] ?? {
      equityCents: null,
      equityRef: null,
      equityAsOf: null,
      equityStatus: 'unavailable',
      equityVersion: 0,
    },
  );
}
