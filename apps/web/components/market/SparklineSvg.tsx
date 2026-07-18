'use client';

import { useMemo } from 'react';

/**
 * Generic SVG sparkline (D-109). Stroke token is caller-controlled
 * (held ok/block vs neutral ink).
 */
export function SparklineSvg(props: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const w = props.width ?? 72;
  const h = props.height ?? 22;
  const stroke = props.stroke ?? 'var(--color-ink-dim)';

  const path = useMemo(() => {
    const vals = props.values.filter((v) => Number.isFinite(v));
    if (vals.length < 2) return '';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const tSpan = vals.length - 1;
    return vals
      .map((v, i) => {
        const x = (i / tSpan) * (w - 2) + 1;
        const y = h - 1 - ((v - min) / span) * (h - 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [props.values, w, h]);

  if (!path) {
    return (
      <svg
        width={w}
        height={h}
        className={props.className}
        aria-label={props['aria-label'] ?? 'No series'}
      >
        <line
          x1={2}
          y1={h / 2}
          x2={w - 2}
          y2={h / 2}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.5}
        />
      </svg>
    );
  }

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={props.className}
      aria-label={props['aria-label'] ?? 'Sparkline'}
    >
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" />
    </svg>
  );
}
