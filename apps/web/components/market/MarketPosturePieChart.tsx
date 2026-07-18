'use client';

import { useMemo } from 'react';
import type { MarketHubChartSlice } from '@hftr/contracts';

const SLICE_STROKES = [
  'var(--color-accent)',
  'var(--color-ok)',
  'var(--color-warn)',
  'var(--color-relevance-high, #9be15d)',
  'var(--color-relevance-low, #f0a04b)',
  'var(--color-ink-dim)',
  'var(--color-block)',
];

/**
 * SVG donut / pie for Market posture metric slices (D-109).
 * Labels listed text-first beside the chart — color reinforces only.
 */
export function MarketPosturePieChart(props: {
  title: string;
  slices: MarketHubChartSlice[];
  size?: number;
  empty?: string;
}) {
  const size = props.size ?? 96;
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const inner = r * 0.55;

  const arcs = useMemo(() => {
    const total = props.slices.reduce((s, x) => s + x.shareBps, 0);
    if (total <= 0) return [];
    let angle = -Math.PI / 2;
    return props.slices.map((slice, i) => {
      const sweep = (slice.shareBps / total) * Math.PI * 2;
      const a0 = angle;
      const a1 = angle + sweep;
      angle = a1;
      const large = sweep > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const xi0 = cx + inner * Math.cos(a1);
      const yi0 = cy + inner * Math.sin(a1);
      const xi1 = cx + inner * Math.cos(a0);
      const yi1 = cy + inner * Math.sin(a0);
      const d = [
        `M ${x0.toFixed(2)} ${y0.toFixed(2)}`,
        `A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        `L ${xi0.toFixed(2)} ${yi0.toFixed(2)}`,
        `A ${inner} ${inner} 0 ${large} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)}`,
        'Z',
      ].join(' ');
      return {
        id: slice.id,
        d,
        stroke: SLICE_STROKES[i % SLICE_STROKES.length]!,
        label: slice.label,
        valueLabel: slice.valueLabel,
        shareBps: slice.shareBps,
      };
    });
  }, [props.slices, cx, cy, r, inner]);

  return (
    <section
      data-testid="market-posture-pie"
      className="rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] p-2.5"
      aria-label={props.title}
    >
      <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
        {props.title}
      </h3>
      {arcs.length === 0 ? (
        <p className="mt-2 text-[10px] text-[var(--color-ink-faint)]">
          {props.empty ?? 'No data'}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            {arcs.map((a) => (
              <path key={a.id} d={a.d} fill={a.stroke} opacity={0.85} />
            ))}
          </svg>
          <ul className="min-w-0 flex-1 space-y-0.5">
            {arcs.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-2 text-[10px]">
                <span className="truncate text-[var(--color-ink-dim)]">
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: a.stroke }}
                    aria-hidden
                  />
                  {a.label}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--color-ink-faint)]">
                  {a.valueLabel} · {(a.shareBps / 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
