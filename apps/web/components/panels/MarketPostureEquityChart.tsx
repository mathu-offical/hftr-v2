'use client';

import { useMemo } from 'react';
import type { MarketHubEquityPoint } from '@hftr/contracts';

type ChartPoint = { t: number; equity: number; positionMark: number | null };

function parseSeries(series: MarketHubEquityPoint[]): ChartPoint[] {
  return series.map((p) => {
    const equity = Number(p.equityCents);
    const markRaw = p.positionMarkCents;
    const mark =
      markRaw !== undefined && markRaw !== null && markRaw !== ''
        ? Number(markRaw)
        : null;
    return {
      t: new Date(p.t).getTime(),
      equity: Number.isFinite(equity) ? equity : 0,
      positionMark: mark !== null && Number.isFinite(mark) ? mark : null,
    };
  });
}

/**
 * SVG equity sparkline (D-085 / D-101).
 * Prefer `series[].positionMarkCents` when the API populates a historical mark path.
 * Otherwise draw a dashed horizontal reference at the current synthetic mark — never invent history.
 */
export function MarketPostureEquityChart(props: {
  series: MarketHubEquityPoint[];
  selectedQty: number | null;
  selectedMarkCents: number | null;
  selectedSymbol: string | null;
  equityLabel: string;
  /** Optional paper/live headline replacing the generic "Equity" label (D-167). */
  capitalModeTitle?: string;
  equityStatus?: 'fresh' | 'stale' | 'unavailable';
  asOfIso?: string | null;
  version?: number;
  /** Render height in px (default 120). Drawer desk uses a taller pass. */
  heightPx?: number;
}) {
  const chartHeight = props.heightPx ?? 120;
  const points = useMemo(() => parseSeries(props.series), [props.series]);

  const hasHistoricalMarks = useMemo(
    () =>
      props.selectedSymbol != null &&
      props.selectedQty != null &&
      points.some((p) => p.positionMark !== null),
    [points, props.selectedQty, props.selectedSymbol],
  );

  const syntheticMarkValue =
    props.selectedSymbol != null &&
    props.selectedQty != null &&
    props.selectedMarkCents != null &&
    Number.isFinite(props.selectedMarkCents)
      ? props.selectedQty * props.selectedMarkCents
      : null;

  const { equityPath, positionPath, dashedY, minY, maxY, width, height } = useMemo(() => {
    const w = 640;
    const h = chartHeight;
    if (points.length === 0) {
      return {
        equityPath: '',
        positionPath: '',
        dashedY: null as number | null,
        minY: 0,
        maxY: 1,
        width: w,
        height: h,
      };
    }

    const holdingSeries = hasHistoricalMarks
      ? points.map((p) =>
          p.positionMark !== null && props.selectedQty != null
            ? props.selectedQty * p.positionMark
            : null,
        )
      : [];

    const ys = [
      ...points.map((p) => p.equity),
      ...holdingSeries.filter((v): v is number => v !== null),
      ...(syntheticMarkValue !== null && !hasHistoricalMarks ? [syntheticMarkValue] : []),
    ];
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

    let pos = '';
    if (hasHistoricalMarks) {
      const firstIdx = holdingSeries.findIndex((v) => v !== null);
      pos = points
        .map((p, i) => {
          const v = holdingSeries[i];
          if (v == null) return null;
          const cmd = i === firstIdx ? 'M' : 'L';
          return `${cmd}${toX(p.t).toFixed(1)},${toY(v).toFixed(1)}`;
        })
        .filter(Boolean)
        .join(' ');
    }

    const dashed =
      !hasHistoricalMarks && syntheticMarkValue !== null ? toY(syntheticMarkValue) : null;

    return {
      equityPath: eq,
      positionPath: pos,
      dashedY: dashed,
      minY: y0,
      maxY: y1,
      width: w,
      height: h,
    };
  }, [points, hasHistoricalMarks, props.selectedQty, syntheticMarkValue, chartHeight]);

  if (points.length === 0) {
    return (
      <div
        data-testid="market-posture-equity-chart"
        className="flex items-center justify-center rounded border border-[var(--color-line)] bg-[var(--color-surface-1)] text-[10px] text-[var(--color-ink-faint)]"
        style={{ height: chartHeight }}
      >
        No equity series yet
      </div>
    );
  }

  const status = props.equityStatus;
  const asOf =
    props.asOfIso != null
      ? (() => {
          const d = new Date(props.asOfIso);
          return Number.isNaN(d.getTime())
            ? props.asOfIso
            : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        })()
      : null;

  return (
    <div data-testid="market-posture-equity-chart" className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)]">
          {props.capitalModeTitle ?? 'Equity'}
          {props.selectedSymbol ? ` · focus ${props.selectedSymbol}` : ' · company'}
          {status ? (
            <span
              className={`ml-2 rounded border px-1 py-0.5 text-[9px] normal-case tracking-normal ${
                status === 'fresh'
                  ? 'border-[var(--color-line)] text-[var(--color-ink-dim)]'
                  : status === 'stale'
                    ? 'border-[var(--color-warn,var(--color-ink-faint))] text-[var(--color-ink)]'
                    : 'border-[var(--color-line)] text-[var(--color-ink-faint)]'
              }`}
            >
              {status}
            </span>
          ) : null}
        </p>
        <p className="font-mono text-xs tabular-nums text-[var(--color-ink)]">
          {props.equityLabel}
          {asOf ? (
            <span className="ml-2 text-[10px] text-[var(--color-ink-faint)]">as of {asOf}</span>
          ) : null}
          {props.version != null && props.version > 0 ? (
            <span className="ml-1 text-[9px] text-[var(--color-ink-faint)]">v{props.version}</span>
          ) : null}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full rounded border border-[var(--color-line)] bg-[var(--color-surface-1)]"
        style={{ height: chartHeight }}
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
        {dashedY !== null ? (
          <>
            <line
              x1={4}
              x2={width - 4}
              y1={dashedY}
              y2={dashedY}
              stroke="var(--color-accent)"
              strokeWidth="1.25"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={width - 8}
              y={Math.max(14, dashedY - 4)}
              textAnchor="end"
              className="fill-[var(--color-accent)] text-[9px]"
            >
              mark (synthetic)
            </text>
          </>
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
          {hasHistoricalMarks
            ? 'Accent path = selected holding mark series from hub (when populated).'
            : 'Dashed line = current synthetic mark only — no invented mark history.'}
        </p>
      ) : null}
    </div>
  );
}
