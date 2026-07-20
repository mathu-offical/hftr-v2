import { describe, expect, it } from 'vitest';
import type {
  PostureAlgoGraph,
  PostureAlgoGraphNode,
} from './market-posture-algorithm-graph';
import {
  attachOwnedMathToParents,
  stripOwnerNodeId,
  STRIP_MATH_ATTACH_GAP,
} from './market-posture-attach-tools';

function node(
  id: string,
  opts: {
    role?: PostureAlgoGraphNode['data']['nodeRole'];
    label?: string;
    moduleType?: string;
    attachedToModuleId?: string;
    parentId?: string;
    x?: number;
    y?: number;
    processRoute?: string;
  } = {},
): PostureAlgoGraphNode {
  return {
    id,
    type: 'postureAlgo',
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    ...(opts.parentId
      ? { parentId: opts.parentId, extent: 'parent' as const }
      : {}),
    data: {
      label: opts.label ?? id,
      detail: '',
      kind: 'deterministic',
      nodeRole: opts.role ?? 'process',
      operation: 'op',
      amount: '1',
      layer: 'pipeline',
      track: 'compound',
      activation: 'armed',
      status: 'ready',
      updatedAt: null,
      stripCompact: true,
      ...(opts.moduleType ? { moduleType: opts.moduleType } : {}),
      ...(opts.attachedToModuleId
        ? { attachedToModuleId: opts.attachedToModuleId }
        : {}),
      ...(opts.processRoute ? { processRoute: opts.processRoute } : {}),
    },
  };
}

describe('attachOwnedMathToParents', () => {
  it('resolves scoped owner ids', () => {
    const nodes = [
      node('scoped:trading:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', {
        moduleType: 'trading',
        label: 'Desk',
      }),
      node('scoped:math:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', {
        moduleType: 'math',
        label: 'Math',
      }),
    ];
    expect(
      stripOwnerNodeId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', nodes),
    ).toBe('scoped:trading:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  });

  it('docks math under owner with calc-ref Top→Bottom edge', () => {
    const ownerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const mathId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const nodes = [
      node(`scoped:trading:${ownerId}`, {
        moduleType: 'trading',
        label: 'Desk',
        parentId: 'group:outlook',
        x: 40,
        y: 20,
        processRoute: 'scoped_trading',
      }),
      node(`scoped:math:${mathId}`, {
        moduleType: 'math',
        label: 'Desk Math',
        attachedToModuleId: ownerId,
        parentId: 'group:outlook',
        x: 0,
        y: 0,
      }),
      {
        id: 'group:outlook',
        type: 'postureGroup' as const,
        position: { x: 0, y: 0 },
        style: { width: 400, height: 200 },
        data: {
          label: 'Outlook',
          detail: '',
          kind: 'data' as const,
          nodeRole: 'screen_group' as const,
          operation: 'section',
          amount: '2',
          layer: 'sources' as const,
          track: 'compose' as const,
          activation: 'armed' as const,
          status: 'ready' as const,
          updatedAt: null,
          stripCompact: true,
          stageScreenId: 'outlook',
        },
      },
    ];
    const edges: PostureAlgoGraph['edges'] = [];
    const out = attachOwnedMathToParents({ nodes, edges });
    const math = out.nodes.find((n) => n.id === `scoped:math:${mathId}`);
    const owner = out.nodes.find((n) => n.id === `scoped:trading:${ownerId}`);
    expect(math?.parentId).toBe('group:outlook');
    expect(math?.position.y).toBe(
      (owner?.position.y ?? 0) + 40 + STRIP_MATH_ATTACH_GAP,
    );
    const attach = out.edges.find((e) => e.id.startsWith('e-attach:'));
    expect(attach?.source).toBe(`scoped:math:${mathId}`);
    expect(attach?.target).toBe(`scoped:trading:${ownerId}`);
    expect(attach?.sourceHandle).toBe('ref-out');
    expect(attach?.targetHandle).toBe('ref-in');
    expect(attach?.data.label).toBe('calc-ref');
    expect(attach?.data.traceStyle).toBe('elbow');
  });

  it('leaves unowned math alone', () => {
    const nodes = [
      node('scoped:math:cccccccc-cccc-cccc-cccc-cccccccccccc', {
        moduleType: 'math',
        label: 'Free Math',
      }),
    ];
    const out = attachOwnedMathToParents({ nodes, edges: [] });
    expect(out.edges).toHaveLength(0);
    expect(out.nodes[0]?.position).toEqual({ x: 0, y: 0 });
  });
});
