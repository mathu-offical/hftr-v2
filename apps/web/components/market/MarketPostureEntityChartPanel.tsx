'use client';

import type { MarketHubSymbolViz } from '@hftr/contracts';
import { SymbolTicker } from '@/components/market/SymbolTicker';
import type { ReactNode } from 'react';

/**
 * One hydrated entity as a chart row: relative bar + optional spark ticker (D-186).
 */
export type MarketPostureEntityChartRow = {
  id: string;
  label: string;
  valueLabel: string;
  /** Relative magnitude 0–10000 (same semantics as MarketHubChartSlice.shareBps). */
  shareBps: number;
  detail?: string | null | undefined;
  viz?: MarketHubSymbolViz | null | undefined;
};

export function MarketPostureEntityChartPanel(props: {
  title: string;
  rows: MarketPostureEntityChartRow[];
  empty?: string;
  /** Optional header action (filters, etc.). */
  headerExtra?: ReactNode;
  onSelect?: ((row: MarketPostureEntityChartRow) => void) | undefined;
  /** Cap visible rows (overflow noted in footer). */
  maxRows?: number;
  testId?: string;
}) {
  const maxRows = props.maxRows ?? 24;
  const max = Math.max(1, ...props.rows.map((r) => r.shareBps));
  const visible = props.rows.slice(0, maxRows);
  const overflow = props.rows.length - visible.length;

  return (
    <section
      data-testid={props.testId ?? 'market-posture-entity-charts'}
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
      aria-label={props.title}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {props.title}{' '}
          <span className="tabular-nums text-[var(--color-ink-dim)]">
            ({props.rows.length})
          </span>
        </h3>
        {props.headerExtra}
      </div>
      {props.rows.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          {props.empty ?? 'No data'}
        </p>
      ) : (
        <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
          {visible.map((row) => {
            const interactive = Boolean(props.onSelect);
            const inner = (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {row.viz ? (
                    <SymbolTicker
                      viz={row.viz}
                      density="comfortable"
                      meta={
                        <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
                          {row.valueLabel}
                        </span>
                      }
                    />
                  ) : (
                    <>
                      <span className="text-xs font-medium text-[var(--color-ink)]">
                        {row.label}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-[var(--color-ink-faint)]">
                        {row.valueLabel}
                        {row.shareBps > 0 ? ` · ${(row.shareBps / 100).toFixed(0)}%` : ''}
                      </span>
                    </>
                  )}
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded bg-[var(--color-accent)]/85"
                    style={{ width: `${(row.shareBps / max) * 100}%` }}
                  />
                </div>
                {row.detail ? (
                  <p className="mt-0.5 text-[10px] text-[var(--color-ink-dim)]">{row.detail}</p>
                ) : null}
              </>
            );
            return (
              <li
                key={row.id}
                className="rounded border border-[var(--color-line)] bg-[var(--color-surface-0)] px-2 py-1.5"
              >
                {interactive ? (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => props.onSelect?.(row)}
                  >
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
      {overflow > 0 ? (
        <p className="mt-1 font-mono text-[9px] text-[var(--color-ink-faint)]">
          +{overflow} more
        </p>
      ) : null}
    </section>
  );
}
