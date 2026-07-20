/**
 * Strip send fan-out (D-226): one logical output (edgeType + send verb + source
 * handle) may feed many targets. Collapse N source→target wires into one trunk
 * with tap nodes along its length, each spawning a short branch.
 */

import type {
  PostureAlgoEdgeData,
  PostureAlgoGraph,
  PostureAlgoGraphNode,
  PostureAlgoNodeData,
} from './market-posture-algorithm-graph';

export const SEND_TAP_W = 12;
export const SEND_TAP_H = 12;

/** Min distinct targets before a shared send is worth bundling. */
const MIN_FAN_TARGETS = 2;

/** Horizontal stub past the source pad before the first tap. */
const TRUNK_STUB_X = 20;
/** Pitch between taps along the trunk. */
const TAP_PITCH_X = 22;

export type SendFanRole = 'trunk' | 'branch';

type StripEdge = PostureAlgoGraph['edges'][number];

/**
 * Output-channel key from actual send semantics (not per-target labels).
 * Structural bridges share a class channel so multi-rail exits from one rail
 * collapse onto one trunk.
 */
export function stripOutputChannel(e: {
  id?: string | undefined;
  label?: string | undefined;
  sourceHandle?: string | null | undefined;
  data: Pick<PostureAlgoEdgeData, 'edgeType' | 'label'>;
}): string {
  const handle = e.sourceHandle?.trim() || 'default';
  if (e.id?.startsWith('e-rail:')) {
    return `${e.data.edgeType}::rail_bridge::${handle}`;
  }
  if (e.id?.startsWith('e-exit:')) {
    return `${e.data.edgeType}::section_exit::${handle}`;
  }
  if (e.id?.startsWith('e-group:')) {
    return `${e.data.edgeType}::screen_backbone::${handle}`;
  }
  const raw = (e.label ?? e.data.label ?? '').trim().toLowerCase();
  // Drop count suffixes ("flows · 3") — same send, many targets.
  const verb =
    raw.replace(/\s*·\s*\d+\s*$/u, '').trim() || e.data.edgeType;
  return `${e.data.edgeType}::${verb}::${handle}`;
}

function absoluteOrigin(
  node: PostureAlgoGraphNode,
  byId: Map<string, PostureAlgoGraphNode>,
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let pid = node.parentId;
  const seen = new Set<string>();
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = byId.get(pid);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    pid = parent.parentId;
  }
  return { x, y };
}

function toParentRelative(
  abs: { x: number; y: number },
  parentId: string | undefined,
  byId: Map<string, PostureAlgoGraphNode>,
): { x: number; y: number } {
  if (!parentId) return abs;
  const parent = byId.get(parentId);
  if (!parent) return abs;
  const pAbs = absoluteOrigin(parent, byId);
  return { x: abs.x - pAbs.x, y: abs.y - pAbs.y };
}

function nodeWidth(n: PostureAlgoGraphNode): number {
  return n.style?.width ?? (n.type === 'postureGroup' ? 160 : 118);
}

function nodeHeight(n: PostureAlgoGraphNode): number {
  return n.style?.height ?? (n.type === 'postureGroup' ? 48 : 40);
}

function channelSlug(channel: string): string {
  return channel.replace(/[^a-z0-9]+/giu, '_').slice(0, 48);
}

function tapNodeData(
  source: PostureAlgoGraphNode,
  channel: string,
  targetCount: number,
): PostureAlgoNodeData {
  const verb = channel.split('::')[1] ?? source.data.operation;
  const {
    moduleType: _m,
    subtypeChip: _s,
    processRoute: _pr,
    processStepId: _ps,
    processFunction: _pf,
    transferHop: _th,
    panelSurfaceId: _p,
    panelKind: _pk,
    analysisRoles: _ar,
    pipelines: _pl,
    sourceDomain: _sd,
    sourceClass: _sc,
    capitalBearing: _cb,
    stageId: _si,
    ...base
  } = source.data;
  return {
    ...base,
    label: verb,
    detail: `send · ${targetCount}`,
    nodeRole: 'send_tap',
    operation: 'send',
    amount: String(targetCount),
    stripCompact: true,
  };
}

/**
 * Bundle multi-target sends into trunk + along-length tap branches.
 * Leaves single-target edges untouched. Idempotent for already-bundled graphs
 * (skips edges that touch `send_tap` nodes).
 */
export function bundleSendFanOut(opts: {
  nodes: PostureAlgoGraphNode[];
  edges: StripEdge[];
}): { nodes: PostureAlgoGraphNode[]; edges: StripEdge[] } {
  const byId = new Map(opts.nodes.map((n) => [n.id, n]));
  const tapIds = new Set(
    opts.nodes.filter((n) => n.data.nodeRole === 'send_tap').map((n) => n.id),
  );

  type Group = {
    sourceId: string;
    channel: string;
    edges: StripEdge[];
  };
  const groups = new Map<string, Group>();

  for (const e of opts.edges) {
    if (tapIds.has(e.source) || tapIds.has(e.target)) continue;
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const channel = stripOutputChannel(e);
    const key = `${e.source}@@${channel}`;
    const prev = groups.get(key);
    if (prev) prev.edges.push(e);
    else groups.set(key, { sourceId: e.source, channel, edges: [e] });
  }

  const removeIds = new Set<string>();
  const addedNodes: PostureAlgoGraphNode[] = [];
  const addedEdges: StripEdge[] = [];

  for (const group of groups.values()) {
    const targets = [
      ...new Set(group.edges.map((e) => e.target).filter((id) => id !== group.sourceId)),
    ];
    if (targets.length < MIN_FAN_TARGETS) continue;

    const source = byId.get(group.sourceId);
    if (!source) continue;

    // Prefer first edge as template for activation/status/handles.
    const template = group.edges[0];
    if (!template) continue;

    const srcAbs = absoluteOrigin(source, byId);
    const srcW = nodeWidth(source);
    const srcH = nodeHeight(source);
    const trunkY = srcAbs.y + srcH / 2 - SEND_TAP_H / 2;

    const sortedTargets = [...targets].sort((a, b) => {
      const na = byId.get(a);
      const nb = byId.get(b);
      if (!na || !nb) return a.localeCompare(b);
      const aa = absoluteOrigin(na, byId);
      const bb = absoluteOrigin(nb, byId);
      if (Math.abs(aa.y - bb.y) > 6) return aa.y - bb.y;
      return aa.x - bb.x;
    });

    const parentId = source.parentId;
    const slug = channelSlug(group.channel);
    const tapIdsOrdered: string[] = [];

    for (let i = 0; i < sortedTargets.length; i++) {
      const tapId = `send:${group.sourceId}:${slug}:${i}`;
      tapIdsOrdered.push(tapId);
      const abs = {
        x: srcAbs.x + srcW + TRUNK_STUB_X + i * TAP_PITCH_X,
        y: trunkY,
      };
      const rel = toParentRelative(abs, parentId, byId);
      const tap: PostureAlgoGraphNode = {
        id: tapId,
        type: 'postureAlgo',
        position: rel,
        style: { width: SEND_TAP_W, height: SEND_TAP_H },
        draggable: false,
        data: tapNodeData(source, group.channel, sortedTargets.length),
        ...(parentId
          ? { parentId, extent: 'parent' as const }
          : {}),
      };
      addedNodes.push(tap);
      byId.set(tapId, tap);
      tapIds.add(tapId);
    }

    const edgeByTarget = new Map<string, StripEdge>();
    for (const e of group.edges) {
      if (!edgeByTarget.has(e.target)) edgeByTarget.set(e.target, e);
      removeIds.add(e.id);
    }

    const fanMeta = {
      fanRole: 'trunk' as const,
      outputChannel: group.channel,
    };
    const branchMeta = {
      fanRole: 'branch' as const,
      outputChannel: group.channel,
    };

    const verb =
      group.channel.split('::')[1]?.replace(/_/gu, ' ') ?? template.data.edgeType;
    const trunkLabel = `${verb} · ${sortedTargets.length}`;

    for (let i = 0; i < tapIdsOrdered.length; i++) {
      const tapId = tapIdsOrdered[i]!;
      const fromId = i === 0 ? group.sourceId : tapIdsOrdered[i - 1]!;
      const trunkId = `e-send:${group.sourceId}:${slug}:trunk:${i}`;
      const trunkEdge: StripEdge = {
        id: trunkId,
        source: fromId,
        target: tapId,
        data: {
          ...template.data,
          ...(i === 0 ? { label: trunkLabel } : {}),
          traceStyle: template.data.traceStyle ?? 'flow',
          ...fanMeta,
        },
      };
      if (i === 0) {
        trunkEdge.label = trunkLabel;
        if (template.sourceHandle != null) {
          trunkEdge.sourceHandle = template.sourceHandle;
        }
      }
      addedEdges.push(trunkEdge);

      const targetId = sortedTargets[i]!;
      const original = edgeByTarget.get(targetId) ?? template;
      const branchId = `e-send:${group.sourceId}:${slug}:branch:${i}`;
      const {
        label: _omitLabel,
        ...originalDataSansLabel
      } = original.data;
      const branchEdge: StripEdge = {
        id: branchId,
        source: tapId,
        target: targetId,
        sourceHandle: 'tap-out',
        data: {
          ...originalDataSansLabel,
          traceStyle: 'elbow',
          ...branchMeta,
        },
      };
      if (original.targetHandle != null) {
        branchEdge.targetHandle = original.targetHandle;
      }
      addedEdges.push(branchEdge);
    }
  }

  if (removeIds.size === 0) {
    return { nodes: opts.nodes, edges: opts.edges };
  }

  const keptEdges = opts.edges.filter((e) => !removeIds.has(e.id));
  return {
    nodes: [...opts.nodes, ...addedNodes],
    edges: [...keptEdges, ...addedEdges],
  };
}
