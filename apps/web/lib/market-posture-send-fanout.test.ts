import { describe, expect, it } from 'vitest';
import type {
  PostureAlgoGraph,
  PostureAlgoGraphNode,
} from './market-posture-algorithm-graph';
import {
  bundleSendFanOut,
  stripOutputChannel,
} from './market-posture-send-fanout';

function node(
  id: string,
  role: PostureAlgoGraphNode['data']['nodeRole'],
  label: string,
  pos: { x: number; y: number } = { x: 0, y: 0 },
): PostureAlgoGraphNode {
  return {
    id,
    type: 'postureAlgo',
    position: pos,
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
  opts?: {
    edgeType?: PostureAlgoGraph['edges'][number]['data']['edgeType'];
    label?: string;
    sourceHandle?: string;
    traceStyle?: 'flow' | 'elbow';
  },
): PostureAlgoGraph['edges'][number] {
  const edgeType = opts?.edgeType ?? 'emit';
  const label = opts?.label;
  return {
    id,
    source,
    target,
    sourceHandle: opts?.sourceHandle,
    label,
    data: {
      edgeType,
      activation: 'armed',
      status: 'ready',
      track: 'compound',
      label,
      traceStyle: opts?.traceStyle ?? 'flow',
    },
  };
}

describe('stripOutputChannel', () => {
  it('keys content sends by edgeType + verb + handle', () => {
    expect(
      stripOutputChannel(
        edge('e1', 'a', 'b', { edgeType: 'emit', label: 'emit' }),
      ),
    ).toBe('emit::emit::default');
  });

  it('strips count suffixes so multi-target sends share a channel', () => {
    expect(
      stripOutputChannel(
        edge('e1', 'a', 'b', { edgeType: 'emit', label: 'emit · 3' }),
      ),
    ).toBe('emit::emit::default');
  });

  it('uses structural bridge classes for rail/exit ids', () => {
    expect(
      stripOutputChannel({
        id: 'e-rail:cluster:a->cluster:b',
        sourceHandle: 'section-out',
        data: { edgeType: 'parallel', label: 'a → b' },
      }),
    ).toBe('parallel::rail_bridge::section-out');
  });
});

describe('bundleSendFanOut', () => {
  it('leaves single-target sends alone', () => {
    const nodes = [
      node('src', 'stage', 'Src', { x: 0, y: 0 }),
      node('t1', 'panel_surface', 'P1', { x: 200, y: 0 }),
    ];
    const edges = [edge('e1', 'src', 't1', { label: 'emit' })];
    const out = bundleSendFanOut({ nodes, edges });
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]?.id).toBe('e1');
    expect(out.nodes.some((n) => n.data.nodeRole === 'send_tap')).toBe(false);
  });

  it('collapses same-channel multi-target send into trunk + taps + branches', () => {
    const nodes = [
      node('src', 'stage', 'Src', { x: 0, y: 40 }),
      node('t1', 'panel_surface', 'P1', { x: 220, y: 0 }),
      node('t2', 'panel_surface', 'P2', { x: 220, y: 40 }),
      node('t3', 'panel_surface', 'P3', { x: 220, y: 80 }),
    ];
    const edges = [
      edge('e1', 'src', 't1', { label: 'emit' }),
      edge('e2', 'src', 't2', { label: 'emit' }),
      edge('e3', 'src', 't3', { label: 'emit' }),
    ];
    const out = bundleSendFanOut({ nodes, edges });

    expect(out.edges.some((e) => e.id === 'e1')).toBe(false);
    expect(out.nodes.filter((n) => n.data.nodeRole === 'send_tap')).toHaveLength(
      3,
    );

    const trunks = out.edges.filter((e) => e.data.fanRole === 'trunk');
    const branches = out.edges.filter((e) => e.data.fanRole === 'branch');
    expect(trunks).toHaveLength(3);
    expect(branches).toHaveLength(3);
    expect(branches.every((e) => e.data.traceStyle === 'elbow')).toBe(true);
    expect(trunks[0]?.source).toBe('src');
    expect(new Set(branches.map((e) => e.target))).toEqual(
      new Set(['t1', 't2', 't3']),
    );
    expect(trunks[0]?.data.outputChannel).toBe('emit::emit::default');
  });

  it('does not mix different output verbs on one trunk', () => {
    const nodes = [
      node('src', 'stage', 'Src'),
      node('t1', 'panel_surface', 'P1', { x: 200, y: 0 }),
      node('t2', 'panel_surface', 'P2', { x: 200, y: 40 }),
    ];
    const edges = [
      edge('e1', 'src', 't1', { edgeType: 'emit', label: 'emit' }),
      edge('e2', 'src', 't2', { edgeType: 'hydrate', label: 'hydrate' }),
    ];
    const out = bundleSendFanOut({ nodes, edges });
    expect(out.edges).toHaveLength(2);
    expect(out.nodes.some((n) => n.data.nodeRole === 'send_tap')).toBe(false);
  });

  it('bundles rail bridges from one source onto a shared rail_bridge channel', () => {
    const nodes = [
      node('cluster:a', 'process_cluster', 'A', { x: 0, y: 0 }),
      node('cluster:b', 'process_cluster', 'B', { x: 300, y: 0 }),
      node('cluster:c', 'process_cluster', 'C', { x: 300, y: 80 }),
    ];
    const edges = [
      {
        id: 'e-rail:cluster:a->cluster:b',
        source: 'cluster:a',
        target: 'cluster:b',
        sourceHandle: 'section-out',
        targetHandle: 'section-in',
        data: {
          edgeType: 'parallel' as const,
          activation: 'armed' as const,
          status: 'ready' as const,
          track: 'compound' as const,
          label: 'a → b',
          traceStyle: 'elbow' as const,
        },
      },
      {
        id: 'e-rail:cluster:a->cluster:c',
        source: 'cluster:a',
        target: 'cluster:c',
        sourceHandle: 'section-out',
        targetHandle: 'section-in',
        data: {
          edgeType: 'parallel' as const,
          activation: 'armed' as const,
          status: 'ready' as const,
          track: 'compound' as const,
          label: 'a → c',
          traceStyle: 'elbow' as const,
        },
      },
    ];
    const out = bundleSendFanOut({ nodes, edges });
    expect(out.edges.some((e) => e.id.startsWith('e-rail:'))).toBe(false);
    expect(out.nodes.filter((n) => n.data.nodeRole === 'send_tap')).toHaveLength(
      2,
    );
    const branches = out.edges.filter((e) => e.data.fanRole === 'branch');
    expect(branches.every((e) => e.targetHandle === 'section-in')).toBe(true);
    expect(
      out.edges.find((e) => e.data.fanRole === 'trunk')?.sourceHandle,
    ).toBe('section-out');
  });
});
