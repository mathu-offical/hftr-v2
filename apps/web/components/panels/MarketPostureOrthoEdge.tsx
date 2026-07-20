'use client';

/**
 * Bespoke orthogonal (right-angle) edges for the Market Posture Model strip.
 * Sharp elbows, L→R hop rails, vertical rail↔rail bridges — labeled with sources.
 */

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { PostureAlgoEdgeData } from '@/lib/market-posture-algorithm-graph';

export type PostureOrthoEdgeData = PostureAlgoEdgeData & {
  /** Parallel-lane vertical offset so stacked transfers do not share one wire. */
  laneOffset?: number;
  /** Strip vs full-canvas chrome. */
  stripMode?: boolean;
  /** Source node / data-source display name. */
  railTitle?: string;
  /** Transfer verb (hydrate / adapt / …). */
  railVerb?: string;
  /** Short role tag (SRC / ADAPT / …). */
  railRole?: string;
  /** Cluster↔cluster rail bridge. */
  railBridge?: boolean;
};

function hashLane(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
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
  const edgeData = data as PostureOrthoEdgeData | undefined;
  const strip = edgeData?.stripMode === true;
  const railBridge = edgeData?.railBridge === true || id.startsWith('e-rail:');
  const explicit = edgeData?.laneOffset;
  const lane =
    explicit ?? (strip && !railBridge ? ((hashLane(id) % 5) - 2) * 3 : 0);

  const verticalBridge =
    railBridge &&
    (sourceHandleId === 'rail-out' ||
      sourceHandleId === 'rail-in' ||
      targetHandleId === 'rail-in' ||
      targetHandleId === 'rail-out');
  const fromPos = verticalBridge
    ? sourcePosition
    : strip
      ? Position.Right
      : sourcePosition;
  const toPos = verticalBridge
    ? targetPosition
    : strip
      ? Position.Left
      : targetPosition;
  const sy = sourceY + lane;
  const ty = targetY + lane;
  const midX = sourceX + (targetX - sourceX) * 0.5;
  const midY = sourceY + (targetY - sourceY) * 0.5;
  const aligned = Math.abs(sy - ty) < 2;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY: sy,
    targetX,
    targetY: ty,
    sourcePosition: fromPos,
    targetPosition: toPos,
    borderRadius: 0,
    offset: strip ? (railBridge ? 18 : aligned ? 6 : 12) : 16,
    ...(strip && !aligned && !verticalBridge ? { centerX: midX } : {}),
    ...(strip && verticalBridge ? { centerY: midY } : {}),
  });

  const railTitle = edgeData?.railTitle?.trim() || null;
  const railVerb = edgeData?.railVerb?.trim() || null;
  const railRole = edgeData?.railRole?.trim() || null;
  const fallback = typeof label === 'string' ? label.trim() : '';
  const showLabel = strip && Boolean(railTitle || fallback);
  const stroke =
    typeof style?.stroke === 'string' ? style.stroke : 'var(--color-accent)';

  const baseEdgeProps = {
    id,
    path,
    style: {
      ...style,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
      ...(railBridge
        ? {
            strokeDasharray: '7 5',
            strokeWidth:
              typeof style?.strokeWidth === 'number'
                ? Math.max(style.strokeWidth, 2.8)
                : 2.8,
          }
        : {}),
    },
    interactionWidth: strip ? 18 : 10,
    ...(markerEnd != null ? { markerEnd } : {}),
  };

  return (
    <>
      {strip ? (
        <BaseEdge
          id={`${id}__halo`}
          path={path}
          style={{
            stroke: 'var(--color-surface-0)',
            strokeWidth:
              typeof style?.strokeWidth === 'number'
                ? style.strokeWidth + (railBridge ? 4.5 : 3.5)
                : railBridge
                  ? 7
                  : 5.5,
            opacity: 0.88,
            strokeLinecap: 'square',
            strokeLinejoin: 'miter',
            fill: 'none',
          }}
          interactionWidth={0}
        />
      ) : null}
      <BaseEdge {...baseEdgeProps} />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute origin-center"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - (railTitle || railBridge ? 2 : 0)}px)`,
              opacity: selected ? 1 : 0.98,
            }}
          >
            <div
              className="max-w-[11rem] rounded border px-1.5 py-0.5 shadow-sm"
              style={{
                borderColor: stroke,
                background:
                  'color-mix(in srgb, var(--color-surface-0) 92%, transparent)',
                boxShadow: `0 0 0 1px color-mix(in srgb, ${stroke} 35%, transparent)`,
              }}
              data-testid="market-posture-model-edge-label"
              title={[railRole, railTitle || fallback, railVerb]
                .filter(Boolean)
                .join(' · ')}
            >
              {railBridge || (fallback.includes('→') && !railTitle) ? (
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    className="shrink-0 font-mono text-[7px] font-bold uppercase tracking-wider"
                    style={{ color: stroke }}
                  >
                    RAIL
                  </span>
                  <span className="truncate font-mono text-[8px] font-semibold leading-tight text-[var(--color-ink)]">
                    {fallback || railTitle}
                  </span>
                </div>
              ) : railTitle ? (
                <>
                  <div className="flex min-w-0 items-center gap-1">
                    {railRole ? (
                      <span
                        className="shrink-0 font-mono text-[7px] font-bold uppercase tracking-wider"
                        style={{ color: stroke }}
                      >
                        {railRole}
                      </span>
                    ) : null}
                    <span className="truncate font-mono text-[8px] font-semibold leading-tight text-[var(--color-ink)]">
                      {railTitle}
                    </span>
                  </div>
                  {railVerb ? (
                    <div className="mt-px truncate font-mono text-[7px] uppercase tracking-wider text-[var(--color-ink-dim)]">
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
