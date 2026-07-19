/**
 * Root user-controlled capital for Market Posture capital stage (D-186).
 * Company pool + holding funds + engine execution splits — not every
 * capital-bearing panel / router / research envelope.
 */

import type { MarketHubCapitalSource, MarketHubPosition, MarketHubResponse } from '@hftr/contracts';

export type RootCapitalEngineGroup = {
  key: string;
  label: string;
  desks: MarketHubCapitalSource[];
  /** Sum of resolved desk allocationCents when available. */
  allocationCentsTotal: string | null;
};

export type RootUserCapitalView = {
  companyPool: MarketHubCapitalSource | null;
  rootHoldingFunds: MarketHubCapitalSource[];
  engineGroups: RootCapitalEngineGroup[];
  /** Positions with mark / PnL orientation for capital stage. */
  positions: MarketHubPosition[];
  equityCents: string | null;
  equityStatus: MarketHubResponse['equity']['status'];
  equityAsOfIso: string | null;
};

function dollarsFromCents(cents: number | string): string {
  const n = typeof cents === 'string' ? Number(cents) : cents;
  if (!Number.isFinite(n)) return '—';
  return `$${(n / 100).toFixed(2)}`;
}

/** True for company pool + root holding funds (operator-controlled root). */
export function isRootUserFund(s: Pick<MarketHubCapitalSource, 'tier' | 'kind'>): boolean {
  if (s.tier !== 'company_root') return false;
  return s.kind === 'company_pool' || s.kind === 'holding_fund';
}

/** Execution desks / envelopes that split root capital into engines. */
export function isEngineAllocation(
  s: Pick<MarketHubCapitalSource, 'tier' | 'kind'>,
): boolean {
  if (s.tier !== 'execution_split') return false;
  return s.kind === 'trading_desk' || s.kind === 'engine_envelope';
}

function sumAllocationCents(rows: MarketHubCapitalSource[]): string | null {
  let total = 0n;
  let any = false;
  for (const r of rows) {
    if (r.allocationCents == null) continue;
    try {
      total += BigInt(r.allocationCents);
      any = true;
    } catch {
      /* skip non-bigint */
    }
  }
  return any ? total.toString() : null;
}

/**
 * Project hub capitalSources into the capital-stage inventory.
 * Omits fund_router, other, and non-root noise.
 */
export function buildRootUserCapitalView(hub: MarketHubResponse): RootUserCapitalView {
  const sources = hub.capitalSources ?? [];
  const companyPool = sources.find((s) => s.kind === 'company_pool') ?? null;
  const rootHoldingFunds = sources.filter(
    (s) => s.tier === 'company_root' && s.kind === 'holding_fund',
  );
  const desks = sources.filter(isEngineAllocation);
  const byKey = new Map<string, RootCapitalEngineGroup>();
  for (const desk of desks) {
    const key = desk.engineId ?? '__unbound__';
    const label = desk.engineLabel ?? 'Unbound execution';
    const existing = byKey.get(key);
    if (existing) {
      existing.desks.push(desk);
    } else {
      byKey.set(key, { key, label, desks: [desk], allocationCentsTotal: null });
    }
  }
  const engineGroups = [...byKey.values()]
    .map((g) => ({
      ...g,
      allocationCentsTotal: sumAllocationCents(g.desks),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    companyPool,
    rootHoldingFunds,
    engineGroups,
    positions: hub.positions ?? [],
    equityCents: hub.equity.equityCents,
    equityStatus: hub.equity.status,
    equityAsOfIso: hub.equity.asOfIso,
  };
}

export function formatCapitalCents(cents: string | null | undefined): string {
  if (cents == null) return '—';
  return dollarsFromCents(cents);
}

/** Model capital nodes: root funds only (pool + holding). */
export function filterModelCapitalToRootFunds<
  T extends { tier: 'company_root' | 'execution_split' },
>(sources: T[]): T[] {
  return sources.filter((s) => s.tier === 'company_root');
}
