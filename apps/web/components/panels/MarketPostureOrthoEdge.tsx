'use client';

/**
 * Circuit-board traces for the Market Posture Model strip.
 * Orthogonal copper runs, vias at elbows, pads at terminals — not freeform spaghetti.
 */

import { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  type EdgeProps,
} from '@xyflow/react';
import type { PostureAlgoEdgeData } from '@/lib/market-posture-algorithm-graph';

export type PostureOrthoEdgeData = PostureAlgoEdgeData & {
  laneOffset?: number;
  stripMode?: boolean;
  /** System id (kind / step / route) — primary silkscreen. */
  railTitle?: string;
  /** Human display name — secondary line under system key. */
  railHuman?: string;
  railVerb?: string;
  railRole?: string;
  railBridge?: boolean;
  /** Cross-section exit from rail/column end (Right → Left). */
  sectionExit?: boolean;
};

/** PCB channel pitch — traces snap to this grid like autorouted copper. */
const PCB_CHANNEL = 6;

function hashLane(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function snap(v: number): number {
  return Math.round(v / PCB_CHANNEL) * PCB_CHANNEL;
}

function pcbCopper(stroke: string | undefined, bridge: boolean): {
  mask: string;
  body: string;
  shine: string;
} {
  // Prefer track stroke when it's a CSS var; else copper alloy.
  const body = stroke && stroke.startsWith('var(') ? stroke : '#c48a3a';
  return {
    mask: bridge
      ? 'color-mix(in srgb, #1a3d2e 70%, var(--color-surface-0))'
      : 'color-mix(in srgb, #0f2a1c 55%, var(--color-surface-0))',
    body,
    shine: bridge
      ? 'color-mix(in srgb, #e8c078 55%, white)'
      : 'color-mix(in srgb, #e0b060 40%, white)',
  };
}

type TraceGeom = {
  d: string;
  vias: Array<{ x: number; y: number }>;
  pads: Array<{ x: number; y: number }>;
  labelX: number;
  labelY: number;
};

/**
 * Build a right-angle PCB trace with channel-snapped bus and elbow vias.
 * H-V-H for hop rails; V-H-V for vertical rail↔rail bridges.
 */
export function buildPcbTrace(opts: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  verticalBridge: boolean;
  lane: number;
  stub?: number;
}): TraceGeom {
  const stub = opts.stub ?? 10;
  const sx = opts.sourceX;
  const sy = snap(opts.sourceY + opts.lane);
  const tx = opts.targetX;
  const ty = snap(opts.targetY + opts.lane);
  const vias: Array<{ x: number; y: number }> = [];
  const pads = [
    { x: sx, y: sy },
    { x: tx, y: ty },
  ];

  if (opts.verticalBridge) {
    const dir = ty >= sy ? 1 : -1;
    const y1 = snap(sy + dir * stub);
    const y2 = snap(ty - dir * stub);
    const busX = snap((sx + tx) / 2 + opts.lane * 2);
    vias.push({ x: sx, y: y1 }, { x: busX, y: y1 }, { x: busX, y: y2 }, { x: tx, y: y2 });
    const d = [
      `M ${sx} ${sy}`,
      `L ${sx} ${y1}`,
      `L ${busX} ${y1}`,
      `L ${busX} ${y2}`,
      `L ${tx} ${y2}`,
      `L ${tx} ${ty}`,
    ].join(' ');
    return {
      d,
      vias,
      pads,
      labelX: busX,
      labelY: snap((y1 + y2) / 2),
    };
  }

  // Hop rail: exit stub → vertical channel → entry stub (classic PCB dogleg).
  const x1 = snap(sx + stub);
  const x2 = snap(tx - stub);
  let busX = snap((x1 + x2) / 2 + opts.lane * 2);
  // Keep bus between terminals when space is tight.
  if (x2 > x1) {
    busX = Math.min(Math.max(busX, x1), x2);
  } else {
    busX = Math.min(Math.max(busX, x2), x1);
  }
  vias.push({ x: x1, y: sy }, { x: busX, y: sy }, { x: busX, y: ty }, { x: x2, y: ty });
  const d = [
    `M ${sx} ${sy}`,
    `L ${x1} ${sy}`,
    `L ${busX} ${sy}`,
    `L ${busX} ${ty}`,
    `L ${x2} ${ty}`,
    `L ${tx} ${ty}`,
  ].join(' ');
  return {
    d,
    vias,
    pads,
    labelX: busX,
    labelY: snap((sy + ty) / 2),
  };
}

function Via({
  x,
  y,
  r,
  copper,
}: {
  x: number;
  y: number;
  r: number;
  copper: { body: string; shine: string; mask: string };
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r + 1.2} fill={copper.mask} stroke={copper.body} strokeWidth={1.1} />
      <circle r={r * 0.45} fill={copper.shine} opacity={0.85} />
    </g>
  );
}

function Pad({
  x,
  y,
  size,
  copper,
}: {
  x: number;
  y: number;
  size: number;
  copper: { body: string; shine: string; mask: string };
}) {
  const half = size / 2;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-half - 0.8}
        y={-half - 0.8}
        width={size + 1.6}
        height={size + 1.6}
        fill={copper.mask}
        stroke={copper.body}
        strokeWidth={0.9}
        rx={0.5}
      />
      <rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        fill={copper.body}
        opacity={0.95}
        rx={0.4}
      />
      <rect
        x={-half * 0.35}
        y={-half * 0.35}
        width={size * 0.35}
        height={size * 0.35}
        fill={copper.shine}
        opacity={0.7}
      />
    </g>
  );
}

export const MarketPostureOrthoEdge = memo(function MarketPostureOrthoEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
  style,
  markerEnd,
  label,
  data,
  selected,
}: EdgeProps) {
  // Stable across remounts — avoid useId() churn on edge style ticks.
  const gradientId = `pcb-shine-${hashLane(id).toString(36)}`;
  const edgeData = data as PostureOrthoEdgeData | undefined;
  const strip = edgeData?.stripMode === true;
  const railBridge = edgeData?.railBridge === true || id.startsWith('e-rail:');
  const sectionExit =
    edgeData?.sectionExit === true || id.startsWith('e-exit:') || id.startsWith('e-group:');
  const explicit = edgeData?.laneOffset;
  const lane =
    explicit ??
    (strip && !railBridge && !sectionExit ? ((hashLane(id) % 5) - 2) * PCB_CHANNEL : 0);

  const verticalBridge =
    railBridge &&
    !sectionExit &&
    (sourceHandleId === 'rail-out' ||
      sourceHandleId === 'rail-in' ||
      targetHandleId === 'rail-in' ||
      targetHandleId === 'rail-out');

  // Non-strip fallback: still orthogonal but simpler (keep RF positions).
  const usePcb = strip;
  const stroke =
    typeof style?.stroke === 'string' ? style.stroke : 'var(--color-accent)';
  const copper = pcbCopper(stroke, railBridge || sectionExit);
  const baseW =
    typeof style?.strokeWidth === 'number'
      ? style.strokeWidth
      : sectionExit
        ? 2.8
        : railBridge
          ? 2.6
          : 2.1;
  const opacity =
    typeof style?.opacity === 'number' ? style.opacity : selected ? 1 : 0.92;

  const geom = useMemo(() => {
    if (!usePcb) {
      // Minimal ortho dogleg when not in strip mode.
      const midX = snap((sourceX + targetX) / 2);
      const d = `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`;
      return {
        d,
        vias: [
          { x: midX, y: sourceY },
          { x: midX, y: targetY },
        ],
        pads: [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ],
        labelX: midX,
        labelY: (sourceY + targetY) / 2,
      } satisfies TraceGeom;
    }
    return buildPcbTrace({
      sourceX,
      sourceY,
      targetX,
      targetY,
      verticalBridge,
      lane,
      stub: railBridge ? 14 : 10,
    });
  }, [
    usePcb,
    sourceX,
    sourceY,
    targetX,
    targetY,
    verticalBridge,
    lane,
    railBridge,
  ]);

  const railTitle = edgeData?.railTitle?.trim() || null;
  const railHuman = edgeData?.railHuman?.trim() || null;
  const railVerb = edgeData?.railVerb?.trim() || null;
  const railRole = edgeData?.railRole?.trim() || null;
  const fallback = typeof label === 'string' ? label.trim() : '';
  const showLabel = strip && Boolean(railTitle || fallback);

  // Silence unused RF handle positions in PCB mode (geometry is explicit).
  void sourcePosition;
  void targetPosition;
  void markerEnd;

  if (!strip) {
    return (
      <BaseEdge
        id={id}
        path={geom.d}
        style={{
          ...style,
          strokeLinecap: 'square',
          strokeLinejoin: 'miter',
        }}
        interactionWidth={10}
        {...(markerEnd != null ? { markerEnd } : {})}
      />
    );
  }

  return (
    <>
      <g
        className="react-flow__edge-path"
        data-testid="market-posture-pcb-trace"
        data-rail-bridge={railBridge ? 'true' : undefined}
        opacity={opacity}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={copper.body} stopOpacity={0.85} />
            <stop offset="45%" stopColor={copper.shine} stopOpacity={0.95} />
            <stop offset="100%" stopColor={copper.body} stopOpacity={0.9} />
          </linearGradient>
        </defs>
        {/* Soldermask / clearance under the copper run */}
        <path
          d={geom.d}
          fill="none"
          stroke={copper.mask}
          strokeWidth={baseW + 3.2}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        {/* Copper body */}
        <path
          d={geom.d}
          fill="none"
          stroke={copper.body}
          strokeWidth={baseW}
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeDasharray={
            sectionExit ? '6 2' : railBridge ? '5 3 1 3' : undefined
          }
        />
        {/* Highlight filament (thin inner shine) */}
        <path
          d={geom.d}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={Math.max(0.7, baseW * 0.28)}
          strokeLinecap="square"
          strokeLinejoin="miter"
          opacity={0.75}
        />
        {geom.vias.map((v, i) => (
          <Via key={`v-${i}`} x={v.x} y={v.y} r={railBridge ? 3.2 : 2.6} copper={copper} />
        ))}
        {geom.pads.map((p, i) => (
          <Pad
            key={`p-${i}`}
            x={p.x}
            y={p.y}
            size={railBridge ? 7 : 5.5}
            copper={copper}
          />
        ))}
      </g>
      {/* Invisible hit target */}
      <BaseEdge
        id={id}
        path={geom.d}
        style={{ stroke: 'transparent', strokeWidth: 14 }}
        interactionWidth={18}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute origin-center"
            style={{
              transform: `translate(-50%, -50%) translate(${geom.labelX}px,${geom.labelY}px)`,
              opacity: selected ? 1 : 0.96,
            }}
          >
            <div
              className="max-w-[11rem] border px-1.5 py-0.5"
              style={{
                borderColor: copper.body,
                background:
                  'color-mix(in srgb, #0a1a12 88%, var(--color-surface-0))',
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${copper.shine} 25%, transparent)`,
                borderRadius: 1,
              }}
              data-testid="market-posture-model-edge-label"
              title={[railRole, railTitle || fallback, railHuman, railVerb]
                .filter(Boolean)
                .join(' · ')}
            >
              {railBridge ||
              sectionExit ||
              (fallback.includes('→') && !railTitle) ? (
                <>
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      className="shrink-0 font-mono text-[6px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: copper.shine }}
                    >
                      {railRole || (sectionExit ? 'EXIT' : railBridge ? 'NET' : 'NET')}
                    </span>
                    <span className="truncate font-mono text-[8px] font-bold leading-tight text-[var(--color-accent)]">
                      {railTitle || fallback}
                    </span>
                  </div>
                  {railHuman ? (
                    <div className="mt-px truncate font-mono text-[6px] leading-tight text-[var(--color-ink-dim)]">
                      {railHuman}
                    </div>
                  ) : null}
                  {railVerb ? (
                    <div
                      className="mt-px truncate font-mono text-[6px] uppercase tracking-[0.12em]"
                      style={{ color: 'color-mix(in srgb, #9fb5a4 80%, transparent)' }}
                    >
                      {railVerb}
                    </div>
                  ) : null}
                </>
              ) : railTitle ? (
                <>
                  <div className="flex min-w-0 items-center gap-1">
                    {railRole ? (
                      <span
                        className="shrink-0 font-mono text-[6px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: copper.shine }}
                      >
                        {railRole}
                      </span>
                    ) : null}
                    <span className="truncate font-mono text-[8px] font-bold leading-tight text-[var(--color-accent)]">
                      {railTitle}
                    </span>
                  </div>
                  {railHuman ? (
                    <div className="mt-px truncate text-[7px] leading-tight text-[var(--color-ink-dim)]">
                      {railHuman}
                    </div>
                  ) : null}
                  {railVerb ? (
                    <div
                      className="mt-px truncate font-mono text-[6px] uppercase tracking-[0.12em]"
                      style={{ color: 'color-mix(in srgb, #9fb5a4 80%, transparent)' }}
                    >
                      {railVerb}
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="font-mono text-[8px] font-semibold uppercase tracking-wider text-[var(--color-ink)]">
                  {fallback}
                </span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
