import { describe, expect, it } from 'vitest';
import {
  applyStripScreenGroups,
  finalizeStripEdges,
} from './market-posture-algorithm-graph';
import type {
  PostureAlgoGraphNode,
  PostureAlgoGraph,
} from './market-posture-algorithm-graph';

function node(
  id: string,
  role: PostureAlgoGraphNode['data']['nodeRole'],
  label: string,
): PostureAlgoGraphNode {
  return {
    id,
    type: 'postureAlgo',
    position: { x: 0, y: 0 },
    data: {
      label,
      detail: '',
      kind: 'data',
      nodeRole: role,
      operation: 'op',
      amount: '1',
      layer: 'sources',
      track: 'compound',
      activation: 'idle',
      status: 'idle',
      updatedAt: null,
    },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
): PostureAlgoGraph['edges'][number] {
  return {
    id,
    source,
    target,
    data: {
      edgeType: 'pipeline',
      activation: 'armed',
      status: 'ready',
      track: 'compound',
    },
  };
}

describe('applyStripScreenGroups', () => {
  it('packs nodes into screen group columns in D-186 order', () => {
    const packed = applyStripScreenGroups([
      node('capital:a', 'capital_source', 'Pool'),
      node('live:bars', 'live_source', 'Bars'),
      node('adapter:1', 'adapter', 'Adapt'),
      node('lane:x', 'lane_label', 'Lane'),
      node('seal_movers', 'stage', 'Seal'),
    ]);
    const groups = packed.filter((n) => n.type === 'postureGroup');
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.data.stageScreenId)).toEqual([
      'capital',
      'live',
      'library',
      'process',
      'outlook',
      'day',
    ]);
    expect(packed.some((n) => n.data.nodeRole === 'lane_label')).toBe(false);
    const capitalKids = packed.filter((n) => n.parentId === 'group:capital');
    expect(capitalKids).toHaveLength(1);
    expect(capitalKids[0]?.id).toBe('capital:a');
    expect(capitalKids[0]?.data.stageScreenId).toBe('capital');
    const outlookKids = packed.filter((n) => n.parentId === 'group:outlook');
    expect(outlookKids.some((n) => n.id === 'seal_movers')).toBe(true);
  });

  it('keeps all nodes (no 8-cap) and spreads by role lane + connections', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      node(`live:src${i}`, 'live_source', `Src ${i}`),
    );
    const edges = [
      edge('e-a', 'live:src0', 'adapter:1'),
      edge('e-b', 'live:src9', 'adapter:1'),
      edge('e-c', 'adapter:1', 'process:step'),
    ];
    const packed = applyStripScreenGroups(
      [
        ...many,
        node('adapter:1', 'adapter', 'Adapt'),
        node('process:step', 'process', 'Norm'),
      ],
      edges,
    );
    const liveKids = packed.filter((n) => n.parentId === 'group:live');
    expect(liveKids.length).toBe(11); // 10 sources + adapter
    // Adapter sits in a later inner lane (x) than live sources
    const src0 = liveKids.find((n) => n.id === 'live:src0')!;
    const adapt = liveKids.find((n) => n.id === 'adapter:1')!;
    expect(adapt.position.x).toBeGreaterThan(src0.position.x);
    const processKids = packed.filter((n) => n.parentId === 'group:process');
    expect(processKids.some((n) => n.id === 'process:step')).toBe(true);
  });

  it('finalizeStripEdges keeps child edges and adds group backbone', () => {
    const nodes = [
      node('live:bars', 'live_source', 'Bars'),
      node('adapter:1', 'adapter', 'Adapt'),
      node('process:step', 'process', 'Norm'),
      node('seal_movers', 'stage', 'Seal'),
    ];
    const edges = [
      edge('e-live-adapt', 'live:bars', 'adapter:1'),
      edge('e-adapt-proc', 'adapter:1', 'process:step'),
      edge('e-proc-seal', 'process:step', 'seal_movers'),
    ];
    const packed = applyStripScreenGroups(nodes, edges);
    const final = finalizeStripEdges(edges, packed);
    expect(final.some((e) => e.id === 'e-live-adapt')).toBe(true);
    expect(final.some((e) => e.id === 'e-adapt-proc')).toBe(true);
    expect(final.some((e) => e.id === 'e-proc-seal')).toBe(true);
    expect(final.some((e) => e.id === 'e-group:live->process')).toBe(true);
    expect(final.some((e) => e.id === 'e-group:process->outlook')).toBe(true);
  });
});
