/**
 * Model strip tool docking (D-228): dedicated Math (and similar owned tools)
 * sit attached under their parent consumer so operators can read real
 * ownership + calc-ref links instead of a free Process island.
 */

import type {
  PostureAlgoGraph,
  PostureAlgoGraphNode,
} from './market-posture-algorithm-graph';

/** Match strip compact chrome (D-214) without circular import on graph constants. */
const STRIP_NODE_H = 40;
const STRIP_NODE_W = 118;

/** Gap between owner bottom and docked Math top (strip compact). */
export const STRIP_MATH_ATTACH_GAP = 10;

type StripEdge = PostureAlgoGraph['edges'][number];

export function stripOwnerNodeId(
  ownerModuleId: string,
  nodes: readonly PostureAlgoGraphNode[],
): string | null {
  const scoped = nodes.find(
    (n) =>
      n.id.startsWith('scoped:') &&
      n.id.endsWith(`:${ownerModuleId}`) &&
      n.data.moduleType !== 'math',
  );
  if (scoped) return scoped.id;
  const engine = nodes.find((n) => n.id === `engine:research:${ownerModuleId}`);
  if (engine) return engine.id;
  const capital = nodes.find((n) => n.id === `capital:${ownerModuleId}`);
  if (capital) return capital.id;
  return null;
}

function nodeW(n: PostureAlgoGraphNode): number {
  return n.style?.width ?? STRIP_NODE_W;
}

function nodeH(n: PostureAlgoGraphNode): number {
  return n.style?.height ?? STRIP_NODE_H;
}

function growParentForDock(
  parent: PostureAlgoGraphNode,
  children: PostureAlgoGraphNode[],
): PostureAlgoGraphNode {
  let maxX = 0;
  let maxY = 0;
  for (const c of children) {
    maxX = Math.max(maxX, c.position.x + nodeW(c));
    maxY = Math.max(maxY, c.position.y + nodeH(c));
  }
  const pad = 12;
  const header =
    parent.data.nodeRole === 'process_cluster' ||
    parent.data.nodeRole === 'screen_group'
      ? 26
      : 8;
  const nextW = Math.max(parent.style?.width ?? 0, maxX + pad);
  const nextH = Math.max(parent.style?.height ?? 0, maxY + pad + header * 0.15);
  if (
    nextW === parent.style?.width &&
    nextH === parent.style?.height
  ) {
    return parent;
  }
  return {
    ...parent,
    style: { width: nextW, height: nextH },
  };
}

/**
 * Relocate owned Math under their strip parent and emit vertical calc-ref
 * edges (math Top → owner Bottom). Append edges after finalize so they are
 * not collapsed into rail bridges.
 */
export function attachOwnedMathToParents(opts: {
  nodes: PostureAlgoGraphNode[];
  edges: StripEdge[];
}): { nodes: PostureAlgoGraphNode[]; edges: StripEdge[] } {
  const byId = new Map(opts.nodes.map((n) => [n.id, n]));
  const nextNodes = [...opts.nodes];
  const replace = (node: PostureAlgoGraphNode): void => {
    const idx = nextNodes.findIndex((n) => n.id === node.id);
    if (idx >= 0) nextNodes[idx] = node;
    byId.set(node.id, node);
  };

  const attachEdges: StripEdge[] = [];
  const dockedMathIds = new Set<string>();

  for (const n of opts.nodes) {
    if (n.data.moduleType !== 'math') continue;
    const ownerModuleId = n.data.attachedToModuleId;
    if (!ownerModuleId) continue;
    const ownerId = stripOwnerNodeId(ownerModuleId, nextNodes);
    if (!ownerId) continue;
    const owner = byId.get(ownerId);
    if (!owner) continue;

    const mathW = nodeW(n);
    const ownerW = nodeW(owner);
    const docked: PostureAlgoGraphNode = {
      ...n,
      position: {
        x: owner.position.x + Math.max(0, (ownerW - mathW) / 2),
        y: owner.position.y + nodeH(owner) + STRIP_MATH_ATTACH_GAP,
      },
      data: {
        ...n.data,
        attachedToModuleId: ownerModuleId,
        // Stay in owner's visual group for analysis — not a free scoped_math rail.
        ...(owner.data.processRoute &&
        !owner.data.processRoute.startsWith('scoped_math')
          ? { processRoute: owner.data.processRoute }
          : {}),
        ...(owner.data.stageScreenId
          ? { stageScreenId: owner.data.stageScreenId }
          : {}),
        detail: `attached · ${owner.data.label}`.slice(0, 80),
      },
      ...(owner.parentId
        ? { parentId: owner.parentId, extent: 'parent' as const }
        : {}),
    };
    replace(docked);
    dockedMathIds.add(docked.id);

    const edgeId = `e-attach:${docked.id}->${ownerId}`;
    if (
      opts.edges.some((e) => e.id === edgeId) ||
      attachEdges.some((e) => e.id === edgeId)
    ) {
      continue;
    }
    attachEdges.push({
      id: edgeId,
      source: docked.id,
      target: ownerId,
      sourceHandle: 'ref-out',
      targetHandle: 'ref-in',
      label: 'calc-ref',
      data: {
        edgeType: 'parallel',
        activation: docked.data.activation,
        status: docked.data.status === 'ready' ? 'ready' : 'idle',
        track: docked.data.track,
        label: 'calc-ref',
        traceStyle: 'elbow',
        outputChannel: 'parallel::calc-ref::ref-out',
      },
    });
  }

  // Grow cluster / screen frames that received docked children.
  const parentsTouched = new Set<string>();
  for (const id of dockedMathIds) {
    const math = byId.get(id);
    if (math?.parentId) parentsTouched.add(math.parentId);
  }
  for (const parentId of parentsTouched) {
    const parent = byId.get(parentId);
    if (!parent) continue;
    const kids = nextNodes.filter((n) => n.parentId === parentId);
    replace(growParentForDock(parent, kids));
  }

  // Drop empty scoped_math clusters left after docking.
  const childCount = new Map<string, number>();
  for (const n of nextNodes) {
    if (!n.parentId) continue;
    childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  }
  const pruned = nextNodes.filter((n) => {
    if (n.data.nodeRole !== 'process_cluster') return true;
    if (!n.id.includes('scoped_math')) return true;
    return (childCount.get(n.id) ?? 0) > 0;
  });

  return {
    nodes: pruned,
    edges: [...opts.edges, ...attachEdges],
  };
}
