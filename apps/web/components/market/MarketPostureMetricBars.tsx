'use client';

import type { MarketHubChartSlice } from '@hftr/contracts';

/**
 * Horizontal share bars for posture metrics (D-109). Text share % is primary.
 */
export function MarketPostureMetricBars(props: {
  title: string;
  slices: MarketHubChartSlice[];
  empty?: string;
}) {
  const max = Math.max(1, ...props.slices.map((s) => s.shareBps));
  return (
    <section
      data-testid="market-posture-bars"
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
      aria-label={props.title}
    >
      <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {props.title}
      </h3>
      {props.slices.length === 0 ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
          {props.empty ?? 'No data'}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {props.slices.map((s) => (
            <li key={s.id}>
              <div className="flex justify-between gap-2 text-[10px]">
                <span className="truncate text-[var(--color-ink-dim)]">{s.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--color-ink-faint)]">
                  {s.valueLabel} · {(s.shareBps / 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-[var(--color-surface-2)]">
                <div
                  className="h-full rounded bg-[var(--color-accent)]/80"
                  style={{ width: `${(s.shareBps / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
