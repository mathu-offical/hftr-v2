import { describe, expect, it } from 'vitest';
import {
  instrumentsFromModuleConfig,
  neighborIds,
  resolveDirectiveTradingTarget,
  resolveInboundLibraryModules,
  resolveInboundLiveApiModules,
  resolveLinkedResearchModules,
  resolveOutboundLibraryModules,
  resolvePolicyModuleForTrading,
  resolveViaLinkedModules,
  type CompanyLinkGraph,
  type GraphEdge,
  type GraphModule,
} from './module-links';

function mod(
  id: string,
  type: string,
  status = 'active',
  config: Record<string, unknown> = {},
): GraphModule {
  return { id, type, status, config };
}

function graph(modules: GraphModule[], edges: GraphEdge[]): CompanyLinkGraph {
  return {
    edges,
    modulesById: new Map(modules.map((m) => [m.id, m])),
  };
}

describe('neighborIds', () => {
  const edges: GraphEdge[] = [
    { fromModuleId: 'r1', toModuleId: 'lib1', linkKind: 'data_feed' },
    { fromModuleId: 'lib1', toModuleId: 't1', linkKind: 'data_feed' },
    { fromModuleId: 't1', toModuleId: 'tr1', linkKind: 'directive' },
  ];

  it('filters by direction and kind', () => {
    expect(neighborIds(edges, 't1', { direction: 'in', kinds: ['data_feed'] })).toEqual(['lib1']);
    expect(neighborIds(edges, 't1', { direction: 'out', kinds: ['directive'] })).toEqual(['tr1']);
    expect(neighborIds(edges, 't1', { direction: 'either' })).toEqual(
      expect.arrayContaining(['lib1', 'tr1']),
    );
  });
});

describe('resolveLinkedResearchModules', () => {
  it('finds research via library→trend multi-hop (seeded template topology)', () => {
    const g = graph(
      [mod('r1', 'research'), mod('lib1', 'library'), mod('t1', 'trend')],
      [
        { fromModuleId: 'r1', toModuleId: 'lib1', linkKind: 'data_feed' },
        { fromModuleId: 'lib1', toModuleId: 't1', linkKind: 'data_feed' },
      ],
    );
    const research = resolveLinkedResearchModules(g, 't1');
    expect(research.map((m) => m.id)).toEqual(['r1']);
  });

  it('includes direct analyzer→research verification neighbors', () => {
    const g = graph(
      [mod('a1', 'analyzer'), mod('r1', 'research'), mod('t1', 'trend')],
      [
        { fromModuleId: 'a1', toModuleId: 'r1', linkKind: 'verification' },
        { fromModuleId: 'a1', toModuleId: 't1', linkKind: 'verification' },
      ],
    );
    // From trend: no direct research; via does not apply. From analyzer would.
    expect(resolveLinkedResearchModules(g, 't1')).toHaveLength(0);
    expect(resolveLinkedResearchModules(g, 'a1').map((m) => m.id)).toEqual(['r1']);
  });

  it('skips inactive research modules', () => {
    const g = graph(
      [mod('r1', 'research', 'draft'), mod('lib1', 'library'), mod('t1', 'trend')],
      [
        { fromModuleId: 'r1', toModuleId: 'lib1', linkKind: 'data_feed' },
        { fromModuleId: 'lib1', toModuleId: 't1', linkKind: 'data_feed' },
      ],
    );
    expect(resolveLinkedResearchModules(g, 't1')).toHaveLength(0);
  });
});

describe('resolveViaLinkedModules', () => {
  it('does not walk unrelated hops', () => {
    const g = graph(
      [mod('r1', 'research'), mod('lib1', 'library'), mod('t1', 'trend'), mod('t2', 'trend')],
      [
        { fromModuleId: 'r1', toModuleId: 'lib1', linkKind: 'data_feed' },
        { fromModuleId: 'lib1', toModuleId: 't2', linkKind: 'data_feed' },
      ],
    );
    expect(
      resolveViaLinkedModules(g, {
        fromModuleId: 't1',
        viaTypes: ['library'],
        targetTypes: ['research'],
        kinds: ['data_feed'],
        direction: 'in',
      }),
    ).toHaveLength(0);
  });
});

describe('promote / policy / inputs helpers', () => {
  it('resolves trend→trading directive target', () => {
    const g = graph(
      [mod('t1', 'trend'), mod('tr1', 'trading'), mod('tr2', 'trading')],
      [{ fromModuleId: 't1', toModuleId: 'tr1', linkKind: 'directive' }],
    );
    expect(resolveDirectiveTradingTarget(g, 't1')?.id).toBe('tr1');
  });

  it('prefers trading→policy directive over company-wide verification', () => {
    const g = graph(
      [
        mod('tr1', 'trading'),
        mod('p1', 'policy'),
        mod('p2', 'policy'),
        mod('a1', 'analyzer'),
      ],
      [
        { fromModuleId: 'tr1', toModuleId: 'p1', linkKind: 'directive' },
        { fromModuleId: 'a1', toModuleId: 'p2', linkKind: 'verification' },
      ],
    );
    expect(resolvePolicyModuleForTrading(g, 'tr1')?.id).toBe('p1');
  });

  it('resolves inbound library and live_api feeds for trend', () => {
    const g = graph(
      [
        mod('lib1', 'library'),
        mod('live1', 'live_api', 'active', { instruments: ['nvda', 'AAPL'] }),
        mod('t1', 'trend'),
      ],
      [
        { fromModuleId: 'lib1', toModuleId: 't1', linkKind: 'data_feed' },
        { fromModuleId: 'live1', toModuleId: 't1', linkKind: 'data_feed' },
      ],
    );
    expect(resolveInboundLibraryModules(g, 't1').map((m) => m.id)).toEqual(['lib1']);
    expect(resolveInboundLiveApiModules(g, 't1').map((m) => m.id)).toEqual(['live1']);
    expect(instrumentsFromModuleConfig(g.modulesById.get('live1')!.config)).toEqual([
      'NVDA',
      'AAPL',
    ]);
  });

  it('resolves research→library outbound targets', () => {
    const g = graph(
      [mod('r1', 'research'), mod('lib1', 'library'), mod('lib2', 'library')],
      [{ fromModuleId: 'r1', toModuleId: 'lib1', linkKind: 'data_feed' }],
    );
    expect(resolveOutboundLibraryModules(g, 'r1').map((m) => m.id)).toEqual(['lib1']);
  });
});
