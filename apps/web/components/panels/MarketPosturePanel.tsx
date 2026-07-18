'use client';

import { useCallback } from 'react';
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
    case 'holding_fund':
      return 'Fund';
    case 'trading_desk':
      return 'Desk';
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
      s.allocationShareBps != null
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

/**
 * Left-rail Market posture inventory (D-131 / D-138): open positions +
 * fund/engine/router allocations with resolved amounts.
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
          Funds + positions · day tape on canvas
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

      <section className="space-y-1.5">
        <h3 className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-ink-dim)]">
          Funds · sources · {hub.capitalSources.length}
        </h3>
        <CapitalSourcesList sources={hub.capitalSources} />
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

function CapitalSourcesList(props: { sources: MarketHubCapitalSource[] }) {
  if (props.sources.length === 0) {
    return (
      <p className="text-xs text-[var(--color-ink-faint)]">
        No holding funds, desks, routers, or engine envelopes yet
      </p>
    );
  }
  return (
    <ul className="space-y-1 text-xs" data-testid="market-posture-capital-sources">
      {props.sources.map((s) => (
        <li key={s.id} className="rounded border border-[var(--color-line)] px-2 py-1.5">
          <Justification
            sourceClass="operator"
            block
            lines={[
              `${capitalKindLabel(s.kind)} · ${s.entityType}`,
              `Source: ${s.sourceLabel}`,
              s.engineLabel ? `Engine: ${s.engineLabel}` : 'No engine binding',
              s.allocationRef ? `Allocation ref: ${s.allocationRef}` : 'No allocation ref',
              `Allocation: ${allocationAmountLabel(s)} (${s.allocationStatus})`,
              s.ledgerBalanceCents
                ? `Ledger: ${dollarsFromCents(s.ledgerBalanceCents)}`
                : 'No module ledger balance',
            ]}
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
              {s.engineLabel ? ` · ${s.engineLabel}` : ''}
              {s.ledgerBalanceCents
                ? ` · ledger ${dollarsFromCents(s.ledgerBalanceCents)}`
                : ''}
            </p>
          </Justification>
        </li>
      ))}
    </ul>
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
