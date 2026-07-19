'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MarketHubCapitalSource, MarketHubResponse } from '@hftr/contracts';
import { useMarketPostureView } from '@/components/panels/MarketPostureViewContext';
import { SymbolTicker } from '@/components/market/SymbolTicker';
import { Justification } from '@/components/panels/Justification';
import {
  dollarsFromCents,
  equityStatusLabel,
  formatOrientation,
} from '@/components/panels/market-posture-format';
import { useMarketHub } from '@/lib/use-market-hub';

function capitalKindLabel(kind: MarketHubCapitalSource['kind']): string {
  switch (kind) {
    case 'company_pool':
      return 'Company';
    case 'holding_fund':
      return 'Root fund';
    case 'trading_desk':
      return 'Execution';
    case 'fund_router':
      return 'Router';
    case 'engine_envelope':
      return 'Engine';
    case 'other':
      return 'Capital';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Compact inline amount — dollars only (no share % clutter on the row). */
function allocationAmountInline(s: MarketHubCapitalSource): string {
  if (s.allocationCents) return dollarsFromCents(s.allocationCents);
  switch (s.allocationStatus) {
    case 'missing_base':
      return 'need pool';
    case 'missing_ref':
      return 'unresolved';
    case 'unconfigured':
      return '—';
    case 'resolved':
      return '—';
    default: {
      const _exhaustive: never = s.allocationStatus;
      return _exhaustive;
    }
  }
}

type ExecutionGroup = {
  key: string;
  label: string;
  desks: MarketHubCapitalSource[];
};

/**
 * Left-rail Market posture inventory (D-131 / D-144 / D-149):
 * open positions first; funds as collapsed indented outline by default.
 */
export function MarketPosturePanel(props: { companyId: string }) {
  const mp = useMarketPostureView();
  const { data: hub, loading, refreshing, analyzing, error, refresh } = useMarketHub(
    props.companyId,
    { poll: true },
  );
  const [fundsOpen, setFundsOpen] = useState(false);

  const openDayView = useCallback(() => {
    mp.openOverlay();
  }, [mp]);

  const companyPool = useMemo(
    () => (hub?.capitalSources ?? []).find((s) => s.kind === 'company_pool') ?? null,
    [hub],
  );
  const rootHoldingFunds = useMemo(
    () =>
      (hub?.capitalSources ?? []).filter(
        (s) => s.tier === 'company_root' && s.kind === 'holding_fund',
      ),
    [hub],
  );
  const executionGroups = useMemo((): ExecutionGroup[] => {
    const desks = (hub?.capitalSources ?? []).filter((s) => s.tier === 'execution_split');
    const byKey = new Map<string, ExecutionGroup>();
    for (const desk of desks) {
      const key = desk.engineId ?? '__unbound__';
      const label = desk.engineLabel ?? 'Unbound execution';
      const existing = byKey.get(key);
      if (existing) {
        existing.desks.push(desk);
      } else {
        byKey.set(key, { key, label, desks: [desk] });
      }
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [hub]);

  const deskCount = executionGroups.reduce((n, g) => n + g.desks.length, 0);
  const fundsSummary = useMemo(() => {
    const parts: string[] = [];
    if (companyPool?.allocationCents) {
      parts.push(dollarsFromCents(companyPool.allocationCents));
    }
    parts.push(`${rootHoldingFunds.length} root`);
    parts.push(`${deskCount} desk`);
    return parts.join(' · ');
  }, [companyPool, rootHoldingFunds.length, deskCount]);

  if (error && !hub) {
    return <p className="text-xs text-[var(--color-block)]">{error}</p>;
  }

  if (!hub && loading) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-ink-faint)]">
        Loading…
      </p>
    );
  }

  if (!hub) {
    return <p className="text-[10px] text-[var(--color-ink-faint)]">No posture data</p>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="market-posture-panel">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--color-ink-faint)]">Holdings inventory</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {(refreshing || analyzing) && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
              {analyzing ? 'Analyzing' : 'Sync'}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={refreshing || analyzing}
            className="border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)] disabled:opacity-50"
            title="Reload holdings inventory"
          >
            Sync
          </button>
          <button
            type="button"
            onClick={openDayView}
            className="border border-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)]"
            data-testid="market-posture-open-day"
            title="Open day quant dashboard on canvas"
          >
            Day view
          </button>
        </div>
      </div>

      <section className="min-h-0 flex-1 space-y-1.5" data-testid="market-posture-positions">
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink)]">
          Open positions · {hub.positions.length}
        </h3>
        <PositionList hub={hub} />
      </section>

      <section
        className="shrink-0 border-t border-[var(--color-line)] pt-2"
        data-testid="market-posture-funds"
      >
        <button
          type="button"
          aria-expanded={fundsOpen}
          onClick={() => setFundsOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left"
          data-testid="market-posture-funds-toggle"
        >
          {fundsOpen ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--color-ink-faint)]" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-ink-faint)]" aria-hidden />
          )}
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
            Funds
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[9px] tabular-nums text-[var(--color-ink-faint)]">
            {fundsSummary}
          </span>
        </button>

        {fundsOpen ? (
          <div className="mt-1.5 space-y-0.5 font-mono text-[10px]" data-testid="market-posture-funds-outline">
            {companyPool ? (
              <FundOutlineRow source={companyPool} depth={0} />
            ) : (
              <p className="pl-4 text-[var(--color-ink-faint)]">No company pool</p>
            )}
            {rootHoldingFunds.map((s) => (
              <FundOutlineRow key={s.id} source={s} depth={1} />
            ))}
            {executionGroups.length > 0 ? (
              <>
                <p className="pl-0 pt-1 font-mono text-[8px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  Execution
                </p>
                {executionGroups.map((group) => (
                  <div key={group.key}>
                    <p className="truncate pl-2 text-[9px] text-[var(--color-ink-faint)]">
                      {group.label}
                    </p>
                    {group.desks.map((s) => (
                      <FundOutlineRow key={s.id} source={s} depth={2} />
                    ))}
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="shrink-0 border-t border-[var(--color-line)] pt-2">
        <p className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
          Equity {equityStatusLabel(hub.equity.status)}
          {hub.equity.equityCents ? ` · ${dollarsFromCents(hub.equity.equityCents)}` : ''}
          {hub.equity.asOfIso ? ` · as of ${formatOrientation(hub.equity.asOfIso)}` : ''}
        </p>
      </div>
    </div>
  );
}

function FundOutlineRow(props: { source: MarketHubCapitalSource; depth: number }) {
  const { source: s, depth } = props;
  const pad = 8 + depth * 12;
  return (
    <Justification
      sourceClass="operator"
      block
      lines={[
        `${capitalKindLabel(s.kind)} · ${s.tier.replace(/_/g, ' ')}`,
        `Source: ${s.sourceLabel}`,
        s.engineLabel ? `Engine: ${s.engineLabel}` : 'No engine binding',
        s.allocationRef ? `Allocation ref: ${s.allocationRef}` : 'No allocation ref',
        `Allocation: ${allocationAmountInline(s)} (${s.allocationStatus})`,
        s.ledgerBalanceCents
          ? `Ledger: ${dollarsFromCents(s.ledgerBalanceCents)}`
          : 'No module ledger balance',
      ]}
    >
      <div
        className="flex items-baseline justify-between gap-2 py-0.5 text-[var(--color-ink)]"
        style={{ paddingLeft: pad }}
        data-testid={`market-posture-fund-row-${s.kind}`}
      >
        <span className="min-w-0 truncate text-[11px]">{s.name}</span>
        <span className="shrink-0 tabular-nums text-[var(--color-ink-dim)]">
          {allocationAmountInline(s)}
        </span>
      </div>
    </Justification>
  );
}

function PositionList(props: { hub: MarketHubResponse }) {
  const mp = useMarketPostureView();
  const { hub } = props;
  if (hub.positions.length === 0) {
    return <p className="text-xs text-[var(--color-ink-faint)]">No open positions</p>;
  }
  return (
    <ul className="space-y-1.5">
      {hub.positions.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => {
              const clear = mp.selectedPositionId === p.id;
              mp.selectPosition(clear ? null : p.id, clear ? null : p.symbol);
              mp.openOverlay();
            }}
            className={`w-full rounded border px-2.5 py-2 text-left text-xs ${
              mp.selectedPositionId === p.id
                ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                : 'border-[var(--color-line)] bg-[var(--color-surface-1)] hover:border-[var(--color-ink-faint)]'
            }`}
          >
            <SymbolTicker
              viz={p.viz}
              density="compact"
              meta={
                <span className="font-mono text-[10px] text-[var(--color-ink-faint)]">
                  qty {p.qty}
                  {p.engines.length > 0
                    ? ` · ${p.engines.map((e) => e.label).join(' · ')}`
                    : ''}
                </span>
              }
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
