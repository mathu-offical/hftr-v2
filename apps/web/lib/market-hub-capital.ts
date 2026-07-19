import type { Db } from '@hftr/db';
import type { MarketHubCapitalSource } from '@hftr/contracts';
import { resolveCapitalAllocationUsdCents } from '@hftr/engine';

type ModuleCapitalRow = {
  id: string;
  name: string;
  type: string;
  engineInstanceId: string | null;
  config: unknown;
  capitalAllocationRef: string | null;
  status: string;
};

type EngineCapitalRow = {
  id: string;
  label: string;
  capitalAllocationRef: string | null;
};

/**
 * Company root funds + execution module splits for Posture left rail (D-139).
 * Omits fund_router hops — those are route topology, not capital sources.
 * Amounts from ValueRefs / ledger — never LLM text.
 */
export async function projectMarketHubCapitalSources(opts: {
  db: Db;
  moduleRows: ModuleCapitalRow[];
  engineRows: EngineCapitalRow[];
  engineLabelById: Map<string, string>;
  moduleLedgerBalance: Map<string, string>;
  companyPoolCents: bigint | null;
  companyId: string;
}): Promise<MarketHubCapitalSource[]> {
  const {
    db,
    moduleRows,
    engineRows,
    engineLabelById,
    moduleLedgerBalance,
    companyPoolCents,
    companyId,
  } = opts;

  const resolveAllocation = async (
    ref: string | null,
  ): Promise<{
    allocationCents: string | null;
    allocationShareBps: number | null;
    allocationStatus: MarketHubCapitalSource['allocationStatus'];
  }> => {
    if (!ref) {
      return {
        allocationCents: null,
        allocationShareBps: null,
        allocationStatus: 'unconfigured',
      };
    }
    if (companyPoolCents === null) {
      return {
        allocationCents: null,
        allocationShareBps: null,
        allocationStatus: 'missing_base',
      };
    }
    const cents = await resolveCapitalAllocationUsdCents(db, ref, {
      baseBalanceCents: companyPoolCents,
    });
    if (cents === null) {
      return {
        allocationCents: null,
        allocationShareBps: null,
        allocationStatus: 'missing_ref',
      };
    }
    const shareBps =
      companyPoolCents > 0n ? Number((cents * 10_000n) / companyPoolCents) : null;
    return {
      allocationCents: cents.toString(),
      allocationShareBps:
        shareBps != null && Number.isFinite(shareBps)
          ? Math.min(10_000, Math.max(0, Math.trunc(shareBps)))
          : null,
      allocationStatus: 'resolved',
    };
  };

  const out: MarketHubCapitalSource[] = [];

  // Company root pool (synthetic) — parent of holding funds.
  out.push({
    id: companyId,
    name: 'Company pool',
    entityType: 'company',
    moduleType: null,
    kind: 'company_pool',
    tier: 'company_root',
    sourceLabel:
      companyPoolCents != null ? 'company equity / seed pool' : 'company pool unavailable',
    status: companyPoolCents != null ? 'configured' : 'unavailable',
    allocationRef: null,
    allocationCents: companyPoolCents != null ? companyPoolCents.toString() : null,
    allocationShareBps: companyPoolCents != null ? 10_000 : null,
    allocationStatus: companyPoolCents != null ? 'resolved' : 'missing_base',
    ledgerBalanceCents: null,
    engineId: null,
    engineLabel: null,
  });

  // Root funds only — holding_fund modules (not fund_router route hops).
  for (const m of moduleRows) {
    if (m.type !== 'holding_fund') continue;
    const cfg =
      m.config && typeof m.config === 'object' && !Array.isArray(m.config)
        ? (m.config as Record<string, unknown>)
        : {};
    const fundSource =
      typeof cfg.source === 'string' ? cfg.source.replace(/_/g, ' ') : null;
    const sourceLabel =
      fundSource ??
      (m.capitalAllocationRef ? 'root holding fund' : 'holding fund not configured');
    const status: MarketHubCapitalSource['status'] =
      m.status === 'draft'
        ? 'draft'
        : m.capitalAllocationRef || fundSource
          ? 'configured'
          : 'unavailable';
    const resolved = await resolveAllocation(m.capitalAllocationRef);
    const engLabel = m.engineInstanceId
      ? (engineLabelById.get(m.engineInstanceId) ?? null)
      : null;
    out.push({
      id: m.id,
      name: m.name.slice(0, 120),
      entityType: 'module',
      moduleType: 'holding_fund',
      kind: 'holding_fund',
      tier: 'company_root',
      sourceLabel: sourceLabel.slice(0, 80),
      status,
      allocationRef: m.capitalAllocationRef,
      ...resolved,
      ledgerBalanceCents: moduleLedgerBalance.get(m.id) ?? null,
      engineId: m.engineInstanceId,
      engineLabel: engLabel ? engLabel.slice(0, 120) : null,
    });
  }

  // Execution module splits — trading desks (capital they may spend).
  const enginesWithTrading = new Set<string>();
  for (const m of moduleRows) {
    if (m.type !== 'trading') continue;
    if (m.engineInstanceId) enginesWithTrading.add(m.engineInstanceId);
    const resolved = await resolveAllocation(m.capitalAllocationRef);
    const engLabel = m.engineInstanceId
      ? (engineLabelById.get(m.engineInstanceId) ?? null)
      : null;
    out.push({
      id: m.id,
      name: m.name.slice(0, 120),
      entityType: 'module',
      moduleType: 'trading',
      kind: 'trading_desk',
      tier: 'execution_split',
      sourceLabel: m.capitalAllocationRef
        ? 'execution module allocation'
        : 'execution capital not configured',
      status:
        m.status === 'draft'
          ? 'draft'
          : m.capitalAllocationRef
            ? 'configured'
            : 'unavailable',
      allocationRef: m.capitalAllocationRef,
      ...resolved,
      ledgerBalanceCents: moduleLedgerBalance.get(m.id) ?? null,
      engineId: m.engineInstanceId,
      engineLabel: engLabel ? engLabel.slice(0, 120) : null,
    });
  }

  // Engine envelopes only when no trading desk already represents that engine.
  for (const eng of engineRows) {
    if (enginesWithTrading.has(eng.id)) continue;
    if (!eng.capitalAllocationRef) continue;
    const resolved = await resolveAllocation(eng.capitalAllocationRef);
    out.push({
      id: eng.id,
      name: eng.label.slice(0, 120),
      entityType: 'engine',
      moduleType: null,
      kind: 'engine_envelope',
      tier: 'execution_split',
      sourceLabel: 'engine spend envelope (no trading desk)',
      status: 'configured',
      allocationRef: eng.capitalAllocationRef,
      ...resolved,
      ledgerBalanceCents: null,
      engineId: eng.id,
      engineLabel: eng.label.slice(0, 120),
    });
  }

  return out.slice(0, 64);
}
