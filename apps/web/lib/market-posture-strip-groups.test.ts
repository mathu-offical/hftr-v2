import { describe, expect, it } from 'vitest';
import { applyStripScreenGroups } from './market-posture-algorithm-graph';
import type { PostureAlgoGraphNode } from './market-posture-algorithm-graph';

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

describe('applyStripScreenGroups', () => {
  it('packs nodes into screen group columns', () => {
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
      'library',
      'live',
      'process',
      'seals',
      'day',
    ]);
    expect(packed.some((n) => n.data.nodeRole === 'lane_label')).toBe(false);
    const capitalKids = packed.filter((n) => n.parentId === 'group:capital');
    expect(capitalKids).toHaveLength(1);
    expect(capitalKids[0]?.id).toBe('capital:a');
    const sealKids = packed.filter((n) => n.parentId === 'group:seals');
    expect(sealKids.some((n) => n.id === 'seal_movers')).toBe(true);
  });
});
