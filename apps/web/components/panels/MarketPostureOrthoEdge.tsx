'use client';

/**
 * Bespoke orthogonal (right-angle) edges for the Market Posture Model strip.
 * Sharp elbows, L→R handle bias, lane offsets — not freeform bezier spaghetti.
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
  style,
  markerEnd,
  label,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as PostureOrthoEdgeData | undefined;
  const strip = edgeData?.stripMode === true;
  const explicit = edgeData?.laneOffset;
  // Stable small jog so parallel same-row transfers read as distinct rails.
  const lane =
    explicit ?? (strip ? ((hashLane(id) % 5) - 2) * 3 : 0);

  // Model strip is L→R transfer flow — bias handles even if RF guesses Top/Bottom.
  const fromPos = strip ? Position.Right : sourcePosition;
  const toPos = strip ? Position.Left : targetPosition;
  const sy = sourceY + lane;
  const ty = targetY + lane;
  // Mid-channel elbow so stacked routes share a clean horizontal bus, not diagonals.
  const midX = sourceX + (targetX - sourceX) * 0.5;
  const aligned = Math.abs(sy - ty) < 2;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY: sy,
    targetX,
    targetY: ty,
    sourcePosition: fromPos,
    targetPosition: toPos,
    borderRadius: 0,
    offset: strip ? (aligned ? 6 : 12) : 16,
    ...(strip && !aligned ? { centerX: midX } : {}),
  });

  const showLabel = Boolean(label) && strip;
  const baseEdgeProps = {
    id,
    path,
    style: {
      ...style,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    },
    interactionWidth: strip ? 14 : 10,
    ...(markerEnd != null ? { markerEnd } : {}),
  };

  return (
    <>
      <BaseEdge {...baseEdgeProps} />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute origin-center"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              opacity: selected ? 1 : 0.92,
            }}
          >
            <span
              className="rounded-sm border border-[var(--color-line)] bg-[var(--color-surface-0)] px-1 py-px font-mono text-[7px] font-semibold uppercase tracking-wider text-[var(--color-ink-dim)]"
              data-testid="market-posture-model-edge-label"
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
