/**
 * Flexible, bespoke Model-strip placement recipes (D-186).
 * Linear hop chains for single-lane routes; matrix (lane × function) for
 * multi-provider routes like news_headline — plus optional per-node nudges.
 * Brick stagger opens ortho copper channels between hops/lanes.
 */

import type { PostureAlgoGraphNode } from './market-posture-algorithm-graph';

export type StripLayoutMode = 'linear' | 'matrix' | 'auto';

/** Force a layout mode per processRoute / cluster key. */
export const STRIP_ROUTE_LAYOUT: Record<string, StripLayoutMode> = {
  news_headline: 'matrix',
  web_search: 'matrix',
  filings: 'matrix',
};

/**
 * Optional per-node nudges inside the parent cluster/screen (px).
 * Use for bespoke Model polish without rewriting the packer.
 */
export const STRIP_NODE_PLACEMENT_OVERRIDES: Record<
  string,
  { dx?: number; dy?: number }
> = {
  // Keep capital emit cards from sitting on narrative seal.
  'panel:positions': { dx: 140, dy: 0 },
};

/**
 * PCB-aligned brick stagger (multiples of channel pitch 6).
 * Odd columns drop; odd rows shift right; stack siblings fan out —
 * keeps H-V-H / V-H-V traces off shared rails.
 */
export const STRIP_STAGGER = {
  x: 6,
  y: 12,
} as const;

/**
 * Horizontal stagger for stacked process rails (D-225).
 * Alternate inset + progressive step so rail end→start elbows clear.
 */
export const STRIP_RAIL_STAGGER = {
  /** Primary zig-zag inset for odd rails. */
  alternateX: 56,
  /** Extra inset per rail index for flexible viewing. */
  stepX: 18,
} as const;

/** Absolute X offset for a stacked rail (process cluster) within its screen. */
export function stripRailStaggerX(routeIdx: number): number {
  return (
    (routeIdx % 2) * STRIP_RAIL_STAGGER.alternateX +
    routeIdx * STRIP_RAIL_STAGGER.stepX
  );
}

/**
 * Offset a grid cell so adjacent hops/lanes do not share the same copper channel.
 */
export function staggerStripCell(opts: {
  col: number;
  row: number;
  stackIdx?: number;
  baseX: number;
  baseY: number;
}): { x: number; y: number } {
  const stack = opts.stackIdx ?? 0;
  return {
    x:
      opts.baseX +
      (opts.row % 2) * STRIP_STAGGER.x +
      stack * STRIP_STAGGER.x,
    y:
      opts.baseY +
      (opts.col % 2) * STRIP_STAGGER.y +
      Math.floor(stack / 2) * (STRIP_STAGGER.y / 2),
  };
}

const MATRIX_FN_ORDER: Record<string, number> = {
  fetch: 0,
  entitle: 0,
  load: 0,
  gather: 0,
  announce: 1,
  normalize: 2,
  validate: 2,
  extract: 3,
  organize: 3,
  context: 4,
  route: 4,
  corroborate: 5,
  synthesize: 5,
  score: 6,
  analyze: 6,
  rank: 7,
  verify: 8,
  admit: 8,
  seal: 9,
  compose: 10,
};

/** Provider / lane key for matrix rows (parallel sources share a route). */
export function stripLaneKey(n: PostureAlgoGraphNode): string {
  const id = n.id;
  const process = id.match(/^process:([^:]+):/);
  if (process?.[1] && process[1] !== 'shared' && process[1] !== 'engine' && process[1] !== 'library') {
    return process[1];
  }
  const analyze = id.match(/^analyze:([^:]+):/);
  if (analyze?.[1]) return analyze[1];
  const adapter = id.match(/^adapter:([^:]+):/);
  if (adapter?.[1]) return adapter[1];
  if (id.startsWith('live:')) return id.slice('live:'.length);
  if (id.startsWith('lib:')) return id.slice('lib:'.length);
  return n.data.processRoute ?? n.data.label ?? id;
}

function matrixColumnKey(n: PostureAlgoGraphNode): string {
  const fn = (n.data.processFunction ?? '').toLowerCase();
  if (fn) return fn;
  switch (n.data.nodeRole) {
    case 'live_source':
    case 'query_source':
    case 'library_source':
      return 'source';
    case 'adapter':
      return 'adapter';
    case 'analysis':
      return 'analyze';
    default:
      return n.data.nodeRole;
  }
}

function matrixColumnOrder(key: string): number {
  if (key === 'source') return -2;
  if (key === 'adapter') return -1;
  return MATRIX_FN_ORDER[key] ?? 40;
}

export function resolveStripLayoutMode(
  route: string,
  steps: readonly PostureAlgoGraphNode[],
): 'linear' | 'matrix' {
  const forced = STRIP_ROUTE_LAYOUT[route] ?? 'auto';
  if (forced === 'linear') return 'linear';
  if (forced === 'matrix') return 'matrix';
  const lanes = new Set(steps.map(stripLaneKey));
  if (lanes.size < 2) return 'linear';
  // Same processFunction on 2+ lanes → parallel matrix, not a long hop mash.
  const byFn = new Map<string, Set<string>>();
  for (const s of steps) {
    const fn = matrixColumnKey(s);
    const set = byFn.get(fn) ?? new Set();
    set.add(stripLaneKey(s));
    byFn.set(fn, set);
  }
  return [...byFn.values()].some((lanesForFn) => lanesForFn.size >= 2)
    ? 'matrix'
    : 'linear';
}

export function applyStripPlacementOverride(
  id: string,
  pos: { x: number; y: number },
): { x: number; y: number } {
  const o = STRIP_NODE_PLACEMENT_OVERRIDES[id];
  if (!o) return pos;
  return {
    x: pos.x + (o.dx ?? 0),
    y: pos.y + (o.dy ?? 0),
  };
}

/**
 * Lane × function matrix: rows = providers, columns = pipeline functions.
 * Hop index = column (1-based) so strip edge pruning stays adjacent-only.
 */
export function layoutStepsByMatrix(
  steps: PostureAlgoGraphNode[],
  cell: { nodeW: number; nodeH: number; gapX: number; gapY: number },
): {
  positions: Map<string, { x: number; y: number }>;
  hops: Map<string, number>;
  width: number;
  height: number;
  mode: 'matrix';
} {
  const lanes = [...new Set(steps.map(stripLaneKey))].sort((a, b) =>
    a.localeCompare(b),
  );
  const colKeys = [
    ...new Set(steps.map(matrixColumnKey)),
  ].sort((a, b) => matrixColumnOrder(a) - matrixColumnOrder(b) || a.localeCompare(b));

  const colIndex = new Map(colKeys.map((k, i) => [k, i]));
  const rowIndex = new Map(lanes.map((k, i) => [k, i]));

  const positions = new Map<string, { x: number; y: number }>();
  const hops = new Map<string, number>();
  let maxX = 0;
  let maxY = 0;

  // Stable pack when multiple steps share a cell (rare).
  const cellStack = new Map<string, number>();

  for (const step of steps) {
    const lane = stripLaneKey(step);
    const colKey = matrixColumnKey(step);
    const col = colIndex.get(colKey) ?? 0;
    const row = rowIndex.get(lane) ?? 0;
    const stackKey = `${row}:${col}`;
    const stack = cellStack.get(stackKey) ?? 0;
    cellStack.set(stackKey, stack + 1);
    const baseX = col * (cell.nodeW + cell.gapX);
    const baseY =
      row * (cell.nodeH + cell.gapY) + stack * Math.floor(cell.nodeH * 0.35);
    const { x, y } = staggerStripCell({
      col,
      row,
      stackIdx: stack,
      baseX,
      baseY,
    });
    positions.set(step.id, { x, y });
    hops.set(step.id, col + 1);
    maxX = Math.max(maxX, x + cell.nodeW);
    maxY = Math.max(maxY, y + cell.nodeH);
  }

  return {
    positions,
    hops,
    width: Math.max(cell.nodeW, maxX),
    height: Math.max(cell.nodeH, maxY),
    mode: 'matrix',
  };
}
