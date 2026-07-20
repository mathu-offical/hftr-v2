import { describe, expect, it } from 'vitest';
import {
  applyStripScreenGroups,
  finalizeStripEdges,
  STRIP_NODE_H,
  STRIP_NODE_W,
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
    // 10 sources + adapter + process:step (kind-specific analysis on Live)
    expect(liveKids.length).toBeGreaterThanOrEqual(11);
    const src0 = liveKids.find((n) => n.id === 'live:src0')!;
    const adapt = liveKids.find((n) => n.id === 'adapter:1')!;
    expect(adapt.position.x).toBeGreaterThan(src0.position.x);
    expect(
      packed.some(
        (n) =>
          n.id === 'process:step' &&
          (n.parentId === 'group:live' ||
            n.parentId?.startsWith('cluster:process:')),
      ),
    ).toBe(true);
    expect(packed.some((n) => n.data.nodeRole === 'process_cluster')).toBe(true);
  });

  it('clusters process nodes by route with function-ordered chains', () => {
    const nodes = [
      node('process:news:fetch', 'process', 'Fetch'),
      node('process:news:normalize', 'process', 'Normalize'),
      node('process:news:extract', 'process', 'Extract'),
      node('process:bars:fetch', 'process', 'Bars fetch'),
      node('process:bars:score', 'process', 'RS'),
      node('universe', 'stage', 'Universe'),
    ];
    // Stamp routes / functions like real hydration nodes.
    const stamped = nodes.map((n) => {
      if (n.id.startsWith('process:news:')) {
        const fn = n.id.split(':')[2]!;
        return {
          ...n,
          data: {
            ...n.data,
            processRoute: 'news_headline',
            processFunction: fn,
          },
        };
      }
      if (n.id.startsWith('process:bars:')) {
        const fn = n.id.split(':')[2]!;
        return {
          ...n,
          data: {
            ...n.data,
            processRoute: 'bars_ohlc',
            processFunction: fn === 'score' ? 'score' : 'fetch',
          },
        };
      }
      return n;
    });
    const edges = [
      edge('e1', 'process:news:fetch', 'process:news:normalize'),
      edge('e2', 'process:news:normalize', 'process:news:extract'),
      edge('e3', 'process:bars:fetch', 'process:bars:score'),
      edge('e4', 'process:news:extract', 'universe'),
    ];
    const packed = applyStripScreenGroups(stamped, edges);
    const clusters = packed.filter((n) => n.data.nodeRole === 'process_cluster');
    expect(clusters.map((c) => c.data.processRoute).sort()).toEqual([
      'bars_ohlc',
      'news_headline',
    ]);
    const newsKids = packed.filter(
      (n) => n.parentId === 'cluster:process:news_headline',
    );
    expect(newsKids.map((n) => n.data.processFunction)).toEqual([
      'fetch',
      'normalize',
      'extract',
    ]);
    const barsKids = packed.filter(
      (n) => n.parentId === 'cluster:process:bars_ohlc',
    );
    expect(barsKids[0]?.position.x).toBeLessThan(barsKids[1]?.position.x ?? 0);
    expect(clusters.every((c) => c.parentId === 'group:live')).toBe(true);
    expect(packed.some((n) => n.parentId === 'group:process' && n.id === 'universe')).toBe(
      true,
    );
  });

  it('finalizeStripEdges keeps local rails and adjacent group backbone', () => {
    const nodes = [
      node('live:bars', 'live_source', 'Bars'),
      node('adapter:1', 'adapter', 'Adapt'),
      {
        ...node('process:step', 'process', 'Norm'),
        data: {
          ...node('process:step', 'process', 'Norm').data,
          processRoute: 'web_search',
          processFunction: 'normalize',
        },
      },
      node('seal_movers', 'stage', 'Seal'),
    ];
    const edges = [
      edge('e-live-adapt', 'live:bars', 'adapter:1'),
      edge('e-adapt-proc', 'adapter:1', 'process:step'),
      edge('e-proc-seal', 'process:step', 'seal_movers'),
      // Backward edge must not create reverse backbone.
      edge('e-back', 'seal_movers', 'live:bars'),
    ];
    const packed = applyStripScreenGroups(nodes, edges);
    const final = finalizeStripEdges(edges, packed);
    // Same-screen ingest rail stays.
    expect(final.some((e) => e.id === 'e-live-adapt')).toBe(true);
    // Cluster↔cluster / live→process content wires become screen backbone.
    expect(final.some((e) => e.id === 'e-adapt-proc')).toBe(false);
    expect(final.some((e) => e.id === 'e-proc-seal')).toBe(false);
    expect(final.some((e) => e.id === 'e-group:live->library')).toBe(true);
    expect(final.some((e) => e.id === 'e-group:library->process')).toBe(true);
    expect(final.some((e) => e.id === 'e-group:process->outlook')).toBe(true);
    expect(final.some((e) => e.id === 'e-group:outlook->live')).toBe(false);
    expect(final.some((e) => e.id === 'e-group:live->outlook')).toBe(false);
  });

  it('drops cross-route spaghetti on the same screen', () => {
    const stamped = [
      {
        ...node('process:news:fetch', 'process', 'Fetch'),
        data: {
          ...node('process:news:fetch', 'process', 'Fetch').data,
          processRoute: 'news_headline',
          processFunction: 'fetch',
        },
      },
      {
        ...node('process:news:norm', 'process', 'Norm'),
        data: {
          ...node('process:news:norm', 'process', 'Norm').data,
          processRoute: 'news_headline',
          processFunction: 'normalize',
        },
      },
      {
        ...node('process:bars:fetch', 'process', 'Bars'),
        data: {
          ...node('process:bars:fetch', 'process', 'Bars').data,
          processRoute: 'bars_ohlc',
          processFunction: 'fetch',
        },
      },
    ];
    const edges = [
      edge('e-news', 'process:news:fetch', 'process:news:norm'),
      edge('e-cross', 'process:news:fetch', 'process:bars:fetch'),
    ];
    const packed = applyStripScreenGroups(stamped, edges);
    const final = finalizeStripEdges(edges, packed);
    expect(final.some((e) => e.id === 'e-news')).toBe(true);
    expect(final.some((e) => e.id === 'e-cross')).toBe(false);
  });

  it('drops skip-hop wires inside a route cluster', () => {
    const stamped = [
      {
        ...node('process:alpaca_news:fetch', 'process', 'Fetch'),
        data: {
          ...node('process:alpaca_news:fetch', 'process', 'Fetch').data,
          processRoute: 'news_headline',
          processFunction: 'fetch',
          transferHop: 1,
        },
      },
      {
        ...node('process:alpaca_news:normalize', 'process', 'Norm'),
        data: {
          ...node('process:alpaca_news:normalize', 'process', 'Norm').data,
          processRoute: 'news_headline',
          processFunction: 'normalize',
          transferHop: 2,
        },
      },
      {
        ...node('process:alpaca_news:corroborate', 'process', 'Corr'),
        data: {
          ...node('process:alpaca_news:corroborate', 'process', 'Corr').data,
          processRoute: 'news_headline',
          processFunction: 'corroborate',
          transferHop: 3,
        },
      },
    ];
    const edges = [
      edge('adj-1', 'process:alpaca_news:fetch', 'process:alpaca_news:normalize'),
      edge(
        'adj-2',
        'process:alpaca_news:normalize',
        'process:alpaca_news:corroborate',
      ),
      edge('skip', 'process:alpaca_news:fetch', 'process:alpaca_news:corroborate'),
    ];
    const packed = applyStripScreenGroups(stamped, edges);
    const withHops = packed.map((n) => {
      if (n.id === 'process:alpaca_news:fetch') {
        return { ...n, data: { ...n.data, transferHop: 1 } };
      }
      if (n.id === 'process:alpaca_news:normalize') {
        return { ...n, data: { ...n.data, transferHop: 2 } };
      }
      if (n.id === 'process:alpaca_news:corroborate') {
        return { ...n, data: { ...n.data, transferHop: 3 } };
      }
      return n;
    });
    const final = finalizeStripEdges(edges, withHops);
    expect(final.some((e) => e.id === 'adj-1')).toBe(true);
    expect(final.some((e) => e.id === 'adj-2')).toBe(true);
    expect(final.some((e) => e.id === 'skip')).toBe(false);
  });

  it('packs library adapters under library, not live', () => {
    const packed = applyStripScreenGroups([
      node('lib:1', 'library_source', 'Shelf'),
      {
        ...node('lib-adapter:jaccard', 'adapter', 'Lib adapter'),
        data: {
          ...node('lib-adapter:jaccard', 'adapter', 'Lib adapter').data,
          // id prefix drives screen; role alone would be live
        },
      },
      node('adapter:live-flow', 'adapter', 'Live adapter'),
    ]);
    expect(
      packed.some(
        (n) =>
          n.id === 'lib-adapter:jaccard' &&
          (n.parentId === 'group:library' ||
            n.parentId?.startsWith('cluster:process:')),
      ),
    ).toBe(true);
    expect(
      packed.some(
        (n) =>
          n.id === 'adapter:live-flow' &&
          (n.parentId === 'group:live' ||
            n.parentId?.startsWith('cluster:process:')),
      ),
    ).toBe(true);
  });

  it('bundles live source + adapter + analysis into one ingest cluster', () => {
    const nodes = [
      node('live:bars_ohlc', 'live_source', 'Bars'),
      node('adapter:bars_ohlc:alpaca', 'adapter', 'Alpaca'),
      {
        ...node('analyze:bars_ohlc:organize', 'analysis', 'Organize'),
        data: {
          ...node('analyze:bars_ohlc:organize', 'analysis', 'Organize').data,
          processFunction: 'organize',
        },
      },
      {
        ...node('analyze:bars_ohlc:route', 'analysis', 'Route'),
        data: {
          ...node('analyze:bars_ohlc:route', 'analysis', 'Route').data,
          processFunction: 'route',
        },
      },
    ];
    const packed = applyStripScreenGroups(nodes, [
      edge('e1', 'live:bars_ohlc', 'adapter:bars_ohlc:alpaca'),
      edge('e2', 'adapter:bars_ohlc:alpaca', 'analyze:bars_ohlc:organize'),
      edge('e3', 'analyze:bars_ohlc:organize', 'analyze:bars_ohlc:route'),
    ]);
    const cluster = packed.find(
      (n) =>
        n.data.nodeRole === 'process_cluster' &&
        n.data.processRoute === 'analysis_bars_ohlc',
    );
    expect(cluster?.parentId).toBe('group:live');
    const kids = packed
      .filter((n) => n.parentId === 'cluster:process:analysis_bars_ohlc')
      .sort((a, b) => a.position.x - b.position.x);
    expect(kids.map((k) => k.id)).toEqual([
      'live:bars_ohlc',
      'adapter:bars_ohlc:alpaca',
      'analyze:bars_ohlc:organize',
      'analyze:bars_ohlc:route',
    ]);
  });

  it('clusters library shelf + adapter + per-shelf process chain', () => {
    const shelf = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const nodes = [
      node(`lib:${shelf}`, 'library_source', 'Shelf A'),
      node(`lib-adapter:library:${shelf}:jaccard`, 'adapter', 'Jaccard'),
      {
        ...node(`process:library:${shelf}:normalize`, 'process', 'Normalize'),
        data: {
          ...node(`process:library:${shelf}:normalize`, 'process', 'Normalize')
            .data,
          processRoute: 'library_jaccard',
          processFunction: 'normalize',
        },
      },
      {
        ...node(`process:library:${shelf}:score`, 'process', 'Score'),
        data: {
          ...node(`process:library:${shelf}:score`, 'process', 'Score').data,
          processRoute: 'library_jaccard',
          processFunction: 'score',
        },
      },
      node('lib:other-shelf', 'library_source', 'Shelf B'),
    ];
    const packed = applyStripScreenGroups(nodes, []);
    const shelfCluster = packed.find(
      (n) =>
        n.data.nodeRole === 'process_cluster' &&
        n.data.processRoute === `shelf_${shelf}`,
    );
    expect(shelfCluster?.parentId).toBe('group:library');
    const kids = packed
      .filter((n) => n.parentId === `cluster:process:shelf_${shelf}`)
      .sort((a, b) => a.position.x - b.position.x);
    expect(kids.map((k) => k.id)).toEqual([
      `lib:${shelf}`,
      `lib-adapter:library:${shelf}:jaccard`,
      `process:library:${shelf}:normalize`,
      `process:library:${shelf}:score`,
    ]);
    expect(
      packed.some(
        (n) =>
          n.id === 'lib:other-shelf' &&
          (n.parentId === 'group:library' ||
            n.parentId === 'cluster:process:shelf_other-shelf'),
      ),
    ).toBe(true);
  });

  it('lanes capital by tier and outlook by stage order', () => {
    const packed = applyStripScreenGroups([
      {
        ...node('capital:pool', 'capital_source', 'Pool'),
        data: {
          ...node('capital:pool', 'capital_source', 'Pool').data,
          detail: 'company_root · pool',
        },
      },
      {
        ...node('capital:desk', 'capital_source', 'Desk'),
        data: {
          ...node('capital:desk', 'capital_source', 'Desk').data,
          detail: 'execution_split · desk',
        },
      },
      {
        ...node('seal_movers', 'stage', 'Movers'),
        data: {
          ...node('seal_movers', 'stage', 'Movers').data,
          stageId: 'seal_movers',
        },
      },
      {
        ...node('narrative', 'stage', 'Narrative'),
        data: {
          ...node('narrative', 'stage', 'Narrative').data,
          stageId: 'narrative',
        },
      },
    ]);
    const pool = packed.find((n) => n.id === 'capital:pool')!;
    const desk = packed.find((n) => n.id === 'capital:desk')!;
    expect(desk.position.x).toBeGreaterThan(pool.position.x);
    const movers = packed.find((n) => n.id === 'seal_movers')!;
    const narrative = packed.find((n) => n.id === 'narrative')!;
    // stageIds order in outlook screen: earlier stages left of later ones
    expect(movers.position.x).toBeLessThan(narrative.position.x);
  });

  it('orders process route clusters by pipeline order', () => {
    const stamped = [
      {
        ...node('process:a', 'process', 'Narr'),
        data: {
          ...node('process:a', 'process', 'Narr').data,
          processRoute: 'narrative_compose',
          processFunction: 'compose',
        },
      },
      {
        ...node('process:b', 'process', 'Entitle'),
        data: {
          ...node('process:b', 'process', 'Entitle').data,
          processRoute: 'providers_entitle',
          processFunction: 'entitle',
        },
      },
      {
        ...node('process:c', 'process', 'News'),
        data: {
          ...node('process:c', 'process', 'News').data,
          processRoute: 'news_headline',
          processFunction: 'fetch',
        },
      },
    ];
    const packed = applyStripScreenGroups(stamped, []);
    const clusters = packed
      .filter((n) => n.data.nodeRole === 'process_cluster')
      .sort((a, b) => a.position.y - b.position.y);
    expect(clusters.map((c) => c.data.processRoute)).toEqual([
      'providers_entitle',
      'news_headline',
      'narrative_compose',
    ]);
  });

  it('aligns sequential routes on shared transfer hops without empty mid-band holes', () => {
    const stamped = [
      {
        ...node('process:news:fetch', 'process', 'Fetch'),
        data: {
          ...node('process:news:fetch', 'process', 'Fetch').data,
          processRoute: 'news_headline',
          processFunction: 'fetch',
        },
      },
      {
        ...node('process:news:normalize', 'process', 'Norm'),
        data: {
          ...node('process:news:normalize', 'process', 'Norm').data,
          processRoute: 'news_headline',
          processFunction: 'normalize',
        },
      },
      {
        ...node('process:bars:fetch', 'process', 'Bars fetch'),
        data: {
          ...node('process:bars:fetch', 'process', 'Bars fetch').data,
          processRoute: 'bars_ohlc',
          processFunction: 'fetch',
        },
      },
      {
        ...node('process:bars:score', 'process', 'Score'),
        data: {
          ...node('process:bars:score', 'process', 'Score').data,
          processRoute: 'bars_ohlc',
          processFunction: 'score',
        },
      },
    ];
    const edges = [
      edge('e-n', 'process:news:fetch', 'process:news:normalize'),
      edge('e-b', 'process:bars:fetch', 'process:bars:score'),
    ];
    const packed = applyStripScreenGroups(stamped, edges);
    const clusters = packed
      .filter((n) => n.data.nodeRole === 'process_cluster')
      .sort((a, b) => a.position.y - b.position.y);
    expect(clusters.map((c) => c.data.processRoute)).toEqual([
      'news_headline',
      'bars_ohlc',
    ]);
    const newsFetch = packed.find((n) => n.id === 'process:news:fetch')!;
    const barsFetch = packed.find((n) => n.id === 'process:bars:fetch')!;
    const newsNorm = packed.find((n) => n.id === 'process:news:normalize')!;
    const barsScore = packed.find((n) => n.id === 'process:bars:score')!;
    // Hop 1 aligns across route rows.
    expect(newsFetch.position.x).toBe(barsFetch.position.x);
    expect(newsFetch.data.transferHop).toBe(1);
    expect(barsFetch.data.transferHop).toBe(1);
    expect(newsNorm.data.transferHop).toBe(2);
    expect(barsScore.data.transferHop).toBe(2);
    // Continuous transfer — hop 2 sits just past hop 1 (room for ortho elbows).
    const hopGap = newsNorm.position.x - newsFetch.position.x;
    expect(hopGap).toBeGreaterThan(110);
    expect(hopGap).toBeLessThan(220);
    expect(barsScore.position.x).toBe(newsNorm.position.x);
  });

  it('places process stages below route rows in the same column grid', () => {
    const stamped = [
      {
        ...node('process:shared:compose', 'process', 'Compose'),
        data: {
          ...node('process:shared:compose', 'process', 'Compose').data,
          processRoute: 'narrative_compose',
          processFunction: 'compose',
        },
      },
      {
        ...node('universe', 'stage', 'Universe'),
        data: {
          ...node('universe', 'stage', 'Universe').data,
          track: 'entitle' as const,
        },
      },
    ];
    const packed = applyStripScreenGroups(stamped, []);
    const cluster = packed.find(
      (n) =>
        n.data.nodeRole === 'process_cluster' &&
        n.parentId === 'group:process',
    )!;
    const universe = packed.find((n) => n.id === 'universe')!;
    expect(universe.parentId).toBe('group:process');
    expect(universe.position.y).toBeGreaterThan(
      (cluster.position.y ?? 0) + ((cluster.style?.height as number) ?? 0) - 1,
    );
  });

  it('orders cluster steps by connection edge levels L→R', () => {
    const a = {
      ...node('process:shared:a', 'process', 'A'),
      data: {
        ...node('process:shared:a', 'process', 'A').data,
        processRoute: 'narrative_compose',
        processFunction: 'compose',
      },
    };
    const b = {
      ...node('process:shared:b', 'process', 'B'),
      data: {
        ...node('process:shared:b', 'process', 'B').data,
        processRoute: 'narrative_compose',
        processFunction: 'verify',
      },
    };
    const c = {
      ...node('process:shared:c', 'process', 'C'),
      data: {
        ...node('process:shared:c', 'process', 'C').data,
        processRoute: 'narrative_compose',
        processFunction: 'fetch',
      },
    };
    // Edges force C → B → A regardless of processFunction order.
    const packed = applyStripScreenGroups([a, b, c], [
      edge('e1', 'process:shared:c', 'process:shared:b'),
      edge('e2', 'process:shared:b', 'process:shared:a'),
    ]);
    const kids = packed
      .filter((n) => n.parentId === 'cluster:process:narrative_compose')
      .sort((x, y) => x.position.x - y.position.x);
    expect(kids.map((k) => k.id)).toEqual([
      'process:shared:c',
      'process:shared:b',
      'process:shared:a',
    ]);
  });

  it('clusters research ENGINE gather→articles on Library', () => {
    const engId = '11111111-2222-3333-4444-555555555555';
    const libId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const nodes = [
      {
        ...node(`engine:research:${engId}`, 'research_engine', 'Sector ENG'),
        data: {
          ...node(`engine:research:${engId}`, 'research_engine', 'Sector ENG').data,
          processRoute: `engine_${engId}`,
        },
      },
      {
        ...node(`process:engine:${engId}:gather`, 'process', 'Gather'),
        data: {
          ...node(`process:engine:${engId}:gather`, 'process', 'Gather').data,
          processRoute: `engine_${engId}`,
          processFunction: 'gather',
        },
      },
      {
        ...node(`process:engine:${engId}:admit`, 'process', 'Admit'),
        data: {
          ...node(`process:engine:${engId}:admit`, 'process', 'Admit').data,
          processRoute: `engine_${engId}`,
          processFunction: 'admit',
        },
      },
      {
        ...node(`articles:engine:${engId}`, 'research_articles', 'Articles'),
        data: {
          ...node(`articles:engine:${engId}`, 'research_articles', 'Articles')
            .data,
          processRoute: `engine_${engId}`,
        },
      },
      node(`lib:${libId}`, 'library_source', 'Hub'),
    ];
    const edges = [
      edge('e1', `engine:research:${engId}`, `process:engine:${engId}:gather`),
      edge(
        'e2',
        `process:engine:${engId}:gather`,
        `process:engine:${engId}:admit`,
      ),
      edge('e3', `process:engine:${engId}:admit`, `articles:engine:${engId}`),
      edge('e4', `articles:engine:${engId}`, `lib:${libId}`),
    ];
    const packed = applyStripScreenGroups(nodes, edges);
    const cluster = packed.find(
      (n) =>
        n.data.nodeRole === 'process_cluster' &&
        n.data.processRoute === `engine_${engId}`,
    );
    expect(cluster?.parentId).toBe('group:library');
    const kids = packed
      .filter((n) => n.parentId === `cluster:process:engine_${engId}`)
      .sort((a, b) => a.position.x - b.position.x);
    expect(kids[0]?.id).toBe(`engine:research:${engId}`);
    expect(kids.map((k) => k.id)).toContain(`articles:engine:${engId}`);
    expect(kids.at(-1)?.position.x).toBeGreaterThan(kids[0]!.position.x);
  });

  it('stamps stripCompact and keeps cluster children inside lane cells', () => {
    const stamped = [
      {
        ...node('process:shared:a', 'process', 'A'),
        data: {
          ...node('process:shared:a', 'process', 'A').data,
          processRoute: 'narrative_compose',
          processFunction: 'compose',
        },
      },
      {
        ...node('process:shared:b', 'process', 'B'),
        data: {
          ...node('process:shared:b', 'process', 'B').data,
          processRoute: 'narrative_compose',
          processFunction: 'verify',
        },
      },
    ];
    const packed = applyStripScreenGroups(stamped, [
      edge('e1', 'process:shared:b', 'process:shared:a'),
    ]);
    expect(packed.every((n) => n.data.stripCompact === true)).toBe(true);
    const cluster = packed.find((n) => n.data.nodeRole === 'process_cluster')!;
    const kids = packed.filter((n) => n.parentId === cluster.id);
    expect(kids.length).toBe(2);
    const cw = (cluster.style?.width as number) ?? 0;
    const ch = (cluster.style?.height as number) ?? 0;
    for (const kid of kids) {
      expect(kid.position.x + STRIP_NODE_W).toBeLessThanOrEqual(cw + 1);
      expect(kid.position.y + STRIP_NODE_H).toBeLessThanOrEqual(ch + 1);
    }
  });

  it('places Brave query API on Process, not Live ingest', () => {
    const stamped = [
      {
        ...node('live:brave_search', 'query_source', 'Brave Search'),
        data: {
          ...node('live:brave_search', 'query_source', 'Brave Search').data,
          sourceDomain: 'web_search',
          sourceClass: 'query' as const,
          operation: 'query · ready',
        },
      },
      {
        ...node('adapter:brave_search:web', 'adapter', 'Brave web adapter'),
        data: {
          ...node('adapter:brave_search:web', 'adapter', 'Brave web adapter').data,
          processRoute: 'web_search',
        },
      },
      {
        ...node('process:brave_search:fetch', 'process', 'Web search fetch'),
        data: {
          ...node('process:brave_search:fetch', 'process', 'Web search fetch').data,
          processRoute: 'web_search',
          processFunction: 'fetch',
        },
      },
      {
        ...node('live:alpaca_news', 'live_source', 'Alpaca News'),
        data: {
          ...node('live:alpaca_news', 'live_source', 'Alpaca News').data,
          sourceDomain: 'equity_news',
          sourceClass: 'stream' as const,
        },
      },
      {
        ...node('adapter:alpaca_news:headline', 'adapter', 'Alpaca news adapter'),
      },
    ];
    const packed = applyStripScreenGroups(stamped, [
      edge('e-bq', 'live:brave_search', 'adapter:brave_search:web'),
      edge('e-bf', 'adapter:brave_search:web', 'process:brave_search:fetch'),
      edge('e-an', 'live:alpaca_news', 'adapter:alpaca_news:headline'),
    ]);
    const brave = packed.find((n) => n.id === 'live:brave_search')!;
    const news = packed.find((n) => n.id === 'live:alpaca_news')!;
    expect(brave.data.stageScreenId).toBe('process');
    expect(brave.parentId === 'group:process' || brave.parentId?.startsWith('cluster:')).toBe(
      true,
    );
    expect(news.data.stageScreenId).toBe('live');
    expect(
      news.parentId === 'group:live' || news.parentId?.startsWith('cluster:'),
    ).toBe(true);
    expect(packed.find((n) => n.id === 'group:process')).toBeTruthy();
  });
});
