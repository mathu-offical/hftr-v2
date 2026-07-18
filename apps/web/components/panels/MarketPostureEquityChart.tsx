'use client';

import { useMemo } from 'react';
import type { MarketHubEquityPoint } from '@hftr/contracts';

type ChartPoint = { t: number; equity: number; position: number | null };

function parseSeries(
  series: MarketHubEquityPoint[],
  selectedQty: number | null,
  selectedMarkCents: number | null,
): ChartPoint[] {
  return series.map((p) => {
    const equity = Number(p.equityCents);
    let position: number | null = null;
    if (selectedQty !== null && selectedMarkCents !== null && Number.isFinite(selectedMarkCents)) {
      // Holding market value at current mark (honest synthetic until live marks).
      position = selectedQty * selectedMarkCents;
    }
    return {
      t: new Date(p.t).getTime(),
      equity: Number.isFinite(equity) ? equity : 0,
      position,
    };
  });
}

/**
 * SVG equity sparkline. When a position is selected, draws a second path for
 * that holding's mark value so the chart "focuses" with selection.
 */
export function MarketPostureEquityChart(props: {
  series: MarketHubEquityPoint[];
  selectedQty: number | null;
  selectedMarkCents: number | null;
  selectedSymbol: string | null;
  equityLabel: string;
}) {
  const points = useMemo(
    () => parseSeries(props.series, props.selectedQty, props.selectedMarkCents),
    [props.series, props.selectedQty, props.selectedMarkCents],
  );

  const { equityPath, positionPath, minY, maxY, width, height } = useMemo(() => {
    const w = 640;
    const h = 120;
    if (points.length === 0) {
      return { equityPath: '', positionPath: '', minY: 0, maxY: 1, width: w, height: h };
    }
    const ys = points.flatMap((p) => (p.position !== null ? [p.equity, p.position] : [p.equity]));
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const span = max - min || 1;
    const pad = span * 0.08;
    const y0 = min - pad;
    const y1 = max + pad;
    const t0 = points[0]!.t;
    const t1 = points[points.length - 1]!.t;
    const tSpan = t1 - t0 || 1;
    const toX = (t: number) => ((t - t0) / tSpan) * (w - 8) + 4;
    const toY = (v: number) => h - 4 - ((v - y0) / (y1 - y0)) * (h - 8);
    const eq = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.t).toFixed(1)},${toY(p.equity).toFixed(1)}`)
      .join(' ');
    const hasPos = points.some((p) => p.position !== null);
    const pos = hasPos
      ? points
          .map((p, i) => {
            const v = p.position ?? p.equity;
            return `${i === 0 ? 'M' : 'L'}${toX(p.t).toFixed(1)},${toY(v).toFixed(1)}`;
          })
          .join(' ')
      : '';
    return { equityPath: eq, positionPath: pos, minY: y0, maxY: y1, width: w, height: h };
  }, [points]);

  if (points.length === 0) {
    return (
      <div
        data-testid="market-posture-equity-chart"
        className="flex h-[120px] items-center justify-center rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] text-[10px] text-[var(--color-ink-faint)]"
      >
        No equity series yet
      </div>
    );
  }

  return (
    <div data-testid="market-posture-equity-chart" className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          Equity
          {props.selectedSymbol ? ` · focus ${props.selectedSymbol}` : ' · company'}
        </p>
        <p className="font-mono text-xs tabular-nums text-[var(--color-ink)]">
          {props.equityLabel}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[120px] w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-1)]"
        role="img"
        aria-label={
          props.selectedSymbol
            ? `Equity chart focused on ${props.selectedSymbol}`
            : 'Company equity chart'
        }
      >
        <path
          d={equityPath}
          fill="none"
          stroke="var(--color-ink-dim)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {positionPath ? (
          <path
            d={positionPath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <text x="8" y="14" className="fill-[var(--color-ink-faint)] text-[9px]">
          {Math.round(maxY).toLocaleString()}¢
        </text>
        <text x="8" y={height - 6} className="fill-[var(--color-ink-faint)] text-[9px]">
          {Math.round(minY).toLocaleString()}¢
        </text>
      </svg>
      {props.selectedSymbol ? (
        <p className="text-[10px] text-[var(--color-ink-faint)]">
          Accent path = selected holding mark value (synthetic marks).
        </p>
      ) : null}
    </div>
  );
}
