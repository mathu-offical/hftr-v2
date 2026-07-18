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
 * Resolve fund / desk / router / engine allocations for Posture left rail (D-138).
 * Amounts come from ValueRefs + optional module ledger — never LLM text.
 */
export async function projectMarketHubCapitalSources(opts: {
  db: Db;
  moduleRows: ModuleCapitalRow[];
  engineRows: EngineCapitalRow[];
  engineLabelById: Map<string, string>;
  moduleLedgerBalance: Map<string, string>;
  companyPoolCents: bigint | null;
}): Promise<MarketHubCapitalSource[]> {
  const {
    db,
    moduleRows,
    engineRows,
    engineLabelById,
    moduleLedgerBalance,
    companyPoolCents,
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

  for (const m of moduleRows) {
    if (m.type !== 'holding_fund' && m.type !== 'trading' && m.type !== 'fund_router') {
      continue;
    }
    const cfg =
      m.config && typeof m.config === 'object' && !Array.isArray(m.config)
        ? (m.config as Record<string, unknown>)
        : {};
    let kind: MarketHubCapitalSource['kind'] = 'other';
    switch (m.type) {
      case 'holding_fund':
        kind = 'holding_fund';
        break;
      case 'trading':
        kind = 'trading_desk';
        break;
      case 'fund_router':
        kind = 'fund_router';
        break;
      default:
        kind = 'other';
    }
    const fundSource =
      typeof cfg.source === 'string' ? cfg.source.replace(/_/g, ' ') : null;
    const sourceLabel =
      fundSource ??
      (m.capitalAllocationRef ? 'allocation set' : 'capital not configured');
    const status: MarketHubCapitalSource['status'] =
      m.status === 'draft'
        ? 'draft'
        : m.type === 'holding_fund' || m.capitalAllocationRef
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
      moduleType: m.type,
      kind,
      sourceLabel: sourceLabel.slice(0, 80),
      status,
      allocationRef: m.capitalAllocationRef,
      ...resolved,
      ledgerBalanceCents: moduleLedgerBalance.get(m.id) ?? null,
      engineId: m.engineInstanceId,
      engineLabel: engLabel ? engLabel.slice(0, 120) : null,
    });
  }

  for (const eng of engineRows) {
    const resolved = await resolveAllocation(eng.capitalAllocationRef);
    out.push({
      id: eng.id,
      name: eng.label.slice(0, 120),
      entityType: 'engine',
      moduleType: null,
      kind: 'engine_envelope',
      sourceLabel: eng.capitalAllocationRef
        ? 'engine allocation envelope'
        : 'engine capital not configured',
      status: eng.capitalAllocationRef ? 'configured' : 'unavailable',
      allocationRef: eng.capitalAllocationRef,
      ...resolved,
      ledgerBalanceCents: null,
      engineId: eng.id,
      engineLabel: eng.label.slice(0, 120),
    });
  }

  return out.slice(0, 64);
}
