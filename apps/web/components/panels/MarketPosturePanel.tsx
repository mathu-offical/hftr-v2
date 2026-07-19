'use client';

import { useCallback, useMemo } from 'react';
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

function allocationAmountLabel(s: MarketHubCapitalSource): string {
  if (s.allocationCents) {
    const share =
      s.allocationShareBps != null && s.kind !== 'company_pool'
        ? ` · ${(s.allocationShareBps / 100).toFixed(1)}% pool`
        : '';
    return `${dollarsFromCents(s.allocationCents)}${share}`;
  }
  switch (s.allocationStatus) {
    case 'missing_base':
      return 'Need company pool';
    case 'missing_ref':
      return 'Ref unresolved';
    case 'unconfigured':
      return 'Not allocated';
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
 * Left-rail Market posture inventory (D-131 / D-138 / D-144):
 * company pool → root holding funds → execution desks by engine → open positions.
 */
export function MarketPosturePanel(props: { companyId: string }) {
  const mp = useMarketPostureView();
  const { data: hub, loading, refreshing, analyzing, error, refresh } = useMarketHub(
    props.companyId,
    { poll: true },
  );

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
    <div className="space-y-3" data-testid="market-posture-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          Company → execution · day tape on canvas
        </p>
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

      <section className="space-y-1.5" data-testid="market-posture-company-roots">
        <h3 className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
          Company · root funds
        </h3>
        {companyPool ? (
          <CapitalSourceRow source={companyPool} emphasis />
        ) : (
          <p className="text-xs text-[var(--color-ink-faint)]">Company pool unavailable</p>
        )}
        {rootHoldingFunds.length === 0 ? (
          <p className="pl-2 text-xs text-[var(--color-ink-faint)]">No root holding funds</p>
        ) : (
          <ul className="space-y-1 border-l border-[var(--color-line)] pl-2" data-testid="market-posture-root-funds">
            {rootHoldingFunds.map((s) => (
              <li key={s.id}>
                <CapitalSourceRow source={s} nested />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-1.5" data-testid="market-posture-execution-splits">
        <h3 className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
          Execution · module splits ·{' '}
          {executionGroups.reduce((n, g) => n + g.desks.length, 0)}
        </h3>
        {executionGroups.length === 0 ? (
          <p className="text-xs text-[var(--color-ink-faint)]">No trading / execution allocations yet</p>
        ) : (
          <div className="space-y-2">
            {executionGroups.map((group) => (
              <div key={group.key} className="space-y-1">
                <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
                  {group.label}
                </p>
                <ul className="space-y-1 border-l border-[var(--color-line)] pl-2">
                  {group.desks.map((s) => (
                    <li key={s.id}>
                      <CapitalSourceRow source={s} nested />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <h3 className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
          Open positions · {hub.positions.length}
        </h3>
        <PositionList hub={hub} />
      </section>

      <div className="border-t border-[var(--color-line)] pt-2">
        <p className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
          Equity {equityStatusLabel(hub.equity.status)}
          {hub.equity.equityCents ? ` · ${dollarsFromCents(hub.equity.equityCents)}` : ''}
          {hub.equity.asOfIso ? ` · as of ${formatOrientation(hub.equity.asOfIso)}` : ''}
        </p>
      </div>
    </div>
  );
}

function CapitalSourceRow(props: {
  source: MarketHubCapitalSource;
  emphasis?: boolean;
  nested?: boolean;
}) {
  const { source: s, emphasis, nested } = props;
  return (
    <Justification
      sourceClass="operator"
      block
      lines={[
        `${capitalKindLabel(s.kind)} · ${s.tier.replace(/_/g, ' ')}`,
        `Source: ${s.sourceLabel}`,
        s.engineLabel ? `Engine: ${s.engineLabel}` : 'No engine binding',
        s.allocationRef ? `Allocation ref: ${s.allocationRef}` : 'No allocation ref',
        `Allocation: ${allocationAmountLabel(s)} (${s.allocationStatus})`,
        s.ledgerBalanceCents
          ? `Ledger: ${dollarsFromCents(s.ledgerBalanceCents)}`
          : 'No module ledger balance',
      ]}
    >
      <div
        className={`rounded border px-2 py-1.5 text-xs ${
          emphasis
            ? 'border-[var(--color-accent)]/40 bg-[var(--color-surface-2)]'
            : nested
              ? 'border-transparent bg-transparent'
              : 'border-[var(--color-line)]'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-[var(--color-ink)]">{s.name}</span>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-faint)]">
            {capitalKindLabel(s.kind)}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--color-ink)]">
          {allocationAmountLabel(s)}
        </p>
        <p className="mt-0.5 font-mono text-[9px] text-[var(--color-ink-faint)]">
          {s.sourceLabel}
          {s.kind === 'holding_fund' && s.engineLabel ? ` · via ${s.engineLabel}` : ''}
          {s.ledgerBalanceCents ? ` · ledger ${dollarsFromCents(s.ledgerBalanceCents)}` : ''}
        </p>
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
    <ul className="space-y-1">
      {hub.positions.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => {
              const clear = mp.selectedPositionId === p.id;
              mp.selectPosition(clear ? null : p.id, clear ? null : p.symbol);
              mp.openOverlay();
            }}
            className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
              mp.selectedPositionId === p.id
                ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)]'
                : 'border-[var(--color-line)] hover:border-[var(--color-ink-faint)]'
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
