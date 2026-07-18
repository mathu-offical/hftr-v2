import { eq } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { moduleLinks, modules } from '@hftr/db/schema';

export type GraphLinkKind = 'data_feed' | 'directive' | 'verification' | 'fund_route';

export interface GraphEdge {
  fromModuleId: string;
  toModuleId: string;
  linkKind: GraphLinkKind;
}

export interface GraphModule {
  id: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
}

export interface CompanyLinkGraph {
  edges: GraphEdge[];
  modulesById: Map<string, GraphModule>;
}

export type LinkDirection = 'out' | 'in' | 'either';

/**
 * Load all module_links + modules for a company into an in-memory graph.
 * Pipeline handlers use this so canvas edges drive data transfer, not only UI.
 */
export async function loadCompanyLinkGraph(db: Db, companyId: string): Promise<CompanyLinkGraph> {
  const [edgeRows, moduleRows] = await Promise.all([
    db
      .select({
        fromModuleId: moduleLinks.fromModuleId,
        toModuleId: moduleLinks.toModuleId,
        linkKind: moduleLinks.linkKind,
      })
      .from(moduleLinks)
      .where(eq(moduleLinks.companyId, companyId)),
    db
      .select({
        id: modules.id,
        type: modules.type,
        status: modules.status,
        config: modules.config,
      })
      .from(modules)
      .where(eq(modules.companyId, companyId)),
  ]);

  const modulesById = new Map<string, GraphModule>();
  for (const row of moduleRows) {
    modulesById.set(row.id, {
      id: row.id,
      type: row.type,
      status: row.status,
      config:
        typeof row.config === 'object' && row.config !== null && !Array.isArray(row.config)
          ? (row.config as Record<string, unknown>)
          : {},
    });
  }

  const edges: GraphEdge[] = edgeRows.map((row) => ({
    fromModuleId: row.fromModuleId,
    toModuleId: row.toModuleId,
    linkKind: row.linkKind as GraphLinkKind,
  }));

  return { edges, modulesById };
}

function kindAllowed(edge: GraphEdge, kinds: readonly GraphLinkKind[] | undefined): boolean {
  if (!kinds || kinds.length === 0) return true;
  return kinds.includes(edge.linkKind);
}

/** Neighbor module ids for one hop. */
export function neighborIds(
  edges: readonly GraphEdge[],
  moduleId: string,
  opts: {
    kinds?: readonly GraphLinkKind[];
    direction: LinkDirection;
  },
): string[] {
  const out = new Set<string>();
  for (const edge of edges) {
    if (!kindAllowed(edge, opts.kinds)) continue;
    if (
      (opts.direction === 'out' || opts.direction === 'either') &&
      edge.fromModuleId === moduleId
    ) {
      out.add(edge.toModuleId);
    }
    if ((opts.direction === 'in' || opts.direction === 'either') && edge.toModuleId === moduleId) {
      out.add(edge.fromModuleId);
    }
  }
  return [...out];
}

/**
 * Resolve modules of given types reachable in one hop (optionally filtered by status).
 */
export function resolveLinkedModules(
  graph: CompanyLinkGraph,
  opts: {
    fromModuleId: string;
    targetTypes: readonly string[];
    kinds?: readonly GraphLinkKind[];
    direction: LinkDirection;
    activeOnly?: boolean;
  },
): GraphModule[] {
  const ids = neighborIds(graph.edges, opts.fromModuleId, {
    direction: opts.direction,
    ...(opts.kinds ? { kinds: opts.kinds } : {}),
  });
  const typeSet = new Set(opts.targetTypes);
  const result: GraphModule[] = [];
  for (const id of ids) {
    const mod = graph.modulesById.get(id);
    if (!mod) continue;
    if (!typeSet.has(mod.type)) continue;
    if (opts.activeOnly && mod.status !== 'active') continue;
    result.push(mod);
  }
  return result;
}

/**
 * Two-hop path: source ←(kinds)→ viaTypes ←(kinds)→ targetTypes
 * Used for standard template topology research → library → trend.
 *
 * Direction is relative to the source module:
 * - `in`: edges point toward source (library→trend), then toward via (research→library)
 */
export function resolveViaLinkedModules(
  graph: CompanyLinkGraph,
  opts: {
    fromModuleId: string;
    viaTypes: readonly string[];
    targetTypes: readonly string[];
    kinds?: readonly GraphLinkKind[];
    /** First hop direction from source; second hop mirrors toward via nodes. */
    direction: 'in' | 'out';
    activeOnly?: boolean;
  },
): GraphModule[] {
  const viaTypeSet = new Set(opts.viaTypes);
  const targetTypeSet = new Set(opts.targetTypes);
  const viaIds = neighborIds(graph.edges, opts.fromModuleId, {
    direction: opts.direction,
    ...(opts.kinds ? { kinds: opts.kinds } : {}),
  }).filter((id) => {
    const mod = graph.modulesById.get(id);
    return mod && viaTypeSet.has(mod.type) && (!opts.activeOnly || mod.status === 'active');
  });

  const found = new Map<string, GraphModule>();
  for (const viaId of viaIds) {
    // From via node, look "upstream" relative to first hop:
    // if first hop was inbound to source, second hop is inbound to via.
    const secondDir: LinkDirection = opts.direction;
    const candidateIds = neighborIds(graph.edges, viaId, {
      direction: secondDir,
      ...(opts.kinds ? { kinds: opts.kinds } : {}),
    });
    for (const id of candidateIds) {
      if (id === opts.fromModuleId) continue;
      const mod = graph.modulesById.get(id);
      if (!mod) continue;
      if (!targetTypeSet.has(mod.type)) continue;
      if (opts.activeOnly && mod.status !== 'active') continue;
      found.set(mod.id, mod);
    }
  }
  return [...found.values()];
}

/**
 * Research modules that should receive auto-curate from a source module (D-039).
 * Direct data_feed/verification neighbors, plus research→library→trend multi-hop.
 */
export function resolveLinkedResearchModules(
  graph: CompanyLinkGraph,
  sourceModuleId: string,
): GraphModule[] {
  const kinds = ['data_feed', 'verification'] as const;
  const direct = resolveLinkedModules(graph, {
    fromModuleId: sourceModuleId,
    targetTypes: ['research'],
    kinds,
    direction: 'either',
    activeOnly: true,
  });

  // Template path: research -data_feed→ library -data_feed→ trend
  const viaLibrary = resolveViaLinkedModules(graph, {
    fromModuleId: sourceModuleId,
    viaTypes: ['library'],
    targetTypes: ['research'],
    kinds: ['data_feed'],
    direction: 'in',
    activeOnly: true,
  });

  const byId = new Map<string, GraphModule>();
  for (const mod of [...direct, ...viaLibrary]) byId.set(mod.id, mod);
  return [...byId.values()];
}

/** Default trading target from trend→trading directive edges. */
export function resolveDirectiveTradingTarget(
  graph: CompanyLinkGraph,
  trendModuleId: string,
): GraphModule | null {
  const trading = resolveLinkedModules(graph, {
    fromModuleId: trendModuleId,
    targetTypes: ['trading'],
    kinds: ['directive'],
    direction: 'out',
    activeOnly: false,
  });
  return trading[0] ?? null;
}

/**
 * Policy module bound to a trading desk: prefer trading→policy directive,
 * then analyzer→policy / any verification neighbor of trading, then company-wide.
 */
export function resolvePolicyModuleForTrading(
  graph: CompanyLinkGraph,
  tradingModuleId: string | null,
): GraphModule | null {
  if (tradingModuleId) {
    const viaDirective = resolveLinkedModules(graph, {
      fromModuleId: tradingModuleId,
      targetTypes: ['policy'],
      kinds: ['directive'],
      direction: 'out',
      activeOnly: false,
    });
    if (viaDirective[0]) return viaDirective[0];

    const viaVerification = resolveLinkedModules(graph, {
      fromModuleId: tradingModuleId,
      targetTypes: ['policy'],
      kinds: ['verification'],
      direction: 'either',
      activeOnly: false,
    });
    if (viaVerification[0]) return viaVerification[0];
  }

  for (const mod of graph.modulesById.values()) {
    if (mod.type !== 'policy') continue;
    const touching = graph.edges.some(
      (e) =>
        e.linkKind === 'verification' && (e.fromModuleId === mod.id || e.toModuleId === mod.id),
    );
    if (touching) return mod;
  }
  return null;
}

/** Library modules feeding a trend (library→trend data_feed). */
export function resolveInboundLibraryModules(
  graph: CompanyLinkGraph,
  trendModuleId: string,
): GraphModule[] {
  return resolveLinkedModules(graph, {
    fromModuleId: trendModuleId,
    targetTypes: ['library'],
    kinds: ['data_feed'],
    direction: 'in',
    activeOnly: false,
  });
}

/** Live API modules feeding a trend (live_api→trend data_feed). */
export function resolveInboundLiveApiModules(
  graph: CompanyLinkGraph,
  trendModuleId: string,
): GraphModule[] {
  return resolveLinkedModules(graph, {
    fromModuleId: trendModuleId,
    targetTypes: ['live_api'],
    kinds: ['data_feed'],
    direction: 'in',
    activeOnly: false,
  });
}

/** Library modules that a research module feeds (research→library data_feed). */
export function resolveOutboundLibraryModules(
  graph: CompanyLinkGraph,
  researchModuleId: string,
): GraphModule[] {
  return resolveLinkedModules(graph, {
    fromModuleId: researchModuleId,
    targetTypes: ['library'],
    kinds: ['data_feed'],
    direction: 'out',
    activeOnly: false,
  });
}

/** Extract uppercase instrument symbols from live_api / trend module config. */
export function instrumentsFromModuleConfig(config: Record<string, unknown>): string[] {
  const raw = config.instruments ?? config.symbols;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const sym = item.trim().toUpperCase();
    if (sym.length >= 1 && sym.length <= 12 && /^[A-Z.]+$/.test(sym)) out.push(sym);
  }
  return out;
}
