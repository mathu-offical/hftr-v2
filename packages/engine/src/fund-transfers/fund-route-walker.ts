import { isLegalFundRoute, ModuleType, type ModuleType as ModuleTypeValue } from '@hftr/contracts';

export interface FundRouteWalkerModule {
  id: string;
  type: ModuleTypeValue;
}

export interface FundRouteWalkerLink {
  fromModuleId: string;
  toModuleId: string;
  linkKind: string;
}

export interface FundRouteHop {
  fromModuleId: string;
  toModuleId: string;
  amountCents: bigint;
}

/** Shape compatible with fund_transfers POST (module↔module hops). */
export interface FundTransferProposal {
  fromKind: 'module';
  fromModuleId: string;
  toKind: 'module';
  toModuleId: string;
  amountCents: bigint;
}

export interface FundRoutePathProposal {
  terminalModuleId: string;
  hops: FundRouteHop[];
}

export interface ProposeFundRouteTransfersInput {
  modules: readonly FundRouteWalkerModule[];
  links: readonly FundRouteWalkerLink[];
  amountCents: bigint;
  /** Defaults to the sole holding_fund module when omitted. */
  sourceModuleId?: string;
}

export type FundRouteWalkerErrorCode =
  | 'invalid_amount'
  | 'source_not_found'
  | 'source_not_holding_fund'
  | 'ambiguous_source'
  | 'no_paths';

export interface FundRouteWalkerError {
  code: FundRouteWalkerErrorCode;
  detail: string;
}

export interface ProposeFundRouteTransfersResult {
  paths: FundRoutePathProposal[];
  proposals: FundTransferProposal[];
}

export type ProposeFundRouteTransfersOutcome =
  | { ok: true; result: ProposeFundRouteTransfersResult }
  | { ok: false; error: FundRouteWalkerError };

function moduleTypeLabel(type: ModuleTypeValue): string {
  switch (type) {
    case 'research':
    case 'librarian':
    case 'library':
    case 'live_api':
    case 'trend':
    case 'trading':
    case 'policy':
    case 'generator':
    case 'simulator':
    case 'analyzer':
    case 'holding_fund':
    case 'fund_router':
    case 'math':
    case 'display':
    case 'clock':
    case 'time':
      return type;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function participatesInFundRouteGraph(type: ModuleTypeValue): boolean {
  switch (type) {
    case 'holding_fund':
    case 'fund_router':
    case 'math':
      return true;
    case 'research':
    case 'librarian':
    case 'library':
    case 'live_api':
    case 'trend':
    case 'trading':
    case 'policy':
    case 'generator':
    case 'simulator':
    case 'analyzer':
    case 'display':
    case 'clock':
    case 'time':
      return false;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function parseModuleType(raw: string): ModuleTypeValue | null {
  const parsed = ModuleType.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function resolveSourceModuleId(
  modules: readonly FundRouteWalkerModule[],
  sourceModuleId: string | undefined,
): { ok: true; sourceModuleId: string } | { ok: false; error: FundRouteWalkerError } {
  if (sourceModuleId) {
    const source = modules.find((module) => module.id === sourceModuleId);
    if (!source) {
      return {
        ok: false,
        error: { code: 'source_not_found', detail: `source module ${sourceModuleId} not found` },
      };
    }
    if (source.type !== 'holding_fund') {
      return {
        ok: false,
        error: {
          code: 'source_not_holding_fund',
          detail: `source module type ${moduleTypeLabel(source.type)} is not holding_fund`,
        },
      };
    }
    return { ok: true, sourceModuleId };
  }

  const holdingFunds = modules.filter((module) => module.type === 'holding_fund');
  if (holdingFunds.length === 1) {
    return { ok: true, sourceModuleId: holdingFunds[0]!.id };
  }
  if (holdingFunds.length === 0) {
    return {
      ok: false,
      error: { code: 'source_not_found', detail: 'no holding_fund module in graph' },
    };
  }
  return {
    ok: false,
    error: {
      code: 'ambiguous_source',
      detail: 'multiple holding_fund modules; pass sourceModuleId',
    },
  };
}

function buildFundRouteAdjacency(
  modules: readonly FundRouteWalkerModule[],
  links: readonly FundRouteWalkerLink[],
): Map<string, string[]> {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const adjacency = new Map<string, string[]>();

  for (const link of links) {
    if (link.linkKind !== 'fund_route') continue;

    const from = modulesById.get(link.fromModuleId);
    const to = modulesById.get(link.toModuleId);
    if (!from || !to) continue;
    if (!participatesInFundRouteGraph(from.type) || !participatesInFundRouteGraph(to.type)) {
      continue;
    }
    if (!isLegalFundRoute(from.type, to.type)) continue;

    const neighbors = adjacency.get(from.id) ?? [];
    neighbors.push(to.id);
    adjacency.set(from.id, neighbors);
  }

  return adjacency;
}

function inboundFundRouterIds(
  modules: readonly FundRouteWalkerModule[],
  links: readonly FundRouteWalkerLink[],
): Set<string> {
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const terminals = new Set<string>();

  for (const link of links) {
    if (link.linkKind !== 'fund_route') continue;
    const from = modulesById.get(link.fromModuleId);
    const to = modulesById.get(link.toModuleId);
    if (!from || !to) continue;
    if (from.type === 'fund_router' && to.type === 'math') {
      terminals.add(to.id);
    }
  }

  return terminals;
}

function hopProposal(
  fromModuleId: string,
  toModuleId: string,
  amountCents: bigint,
): FundTransferProposal {
  return {
    fromKind: 'module',
    fromModuleId,
    toKind: 'module',
    toModuleId,
    amountCents,
  };
}

function collectPaths(
  adjacency: Map<string, string[]>,
  terminalModuleIds: ReadonlySet<string>,
  sourceModuleId: string,
  amountCents: bigint,
): FundRoutePathProposal[] {
  const paths: FundRoutePathProposal[] = [];

  function dfs(currentId: string, visited: Set<string>, hopIds: string[]): void {
    if (terminalModuleIds.has(currentId) && hopIds.length > 0) {
      const hops: FundRouteHop[] = [];
      for (let index = 0; index < hopIds.length; index += 2) {
        hops.push({
          fromModuleId: hopIds[index]!,
          toModuleId: hopIds[index + 1]!,
          amountCents,
        });
      }
      paths.push({ terminalModuleId: currentId, hops });
      return;
    }

    const neighbors = adjacency.get(currentId) ?? [];
    for (const nextId of neighbors) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      hopIds.push(currentId, nextId);
      dfs(nextId, visited, hopIds);
      hopIds.pop();
      hopIds.pop();
      visited.delete(nextId);
    }
  }

  dfs(sourceModuleId, new Set([sourceModuleId]), []);
  return paths;
}

/**
 * Walk legal fund_route edges from a holding fund through Math and fund routers
 * to terminal trading-owner Math modules. Returns hop proposals only — no ledger writes.
 */
export function proposeFundRouteTransfers(
  input: ProposeFundRouteTransfersInput,
): ProposeFundRouteTransfersOutcome {
  if (input.amountCents <= 0n) {
    return {
      ok: false,
      error: { code: 'invalid_amount', detail: 'amountCents must be positive' },
    };
  }

  const modules: FundRouteWalkerModule[] = [];
  for (const module of input.modules) {
    const type = typeof module.type === 'string' ? parseModuleType(module.type) : module.type;
    if (!type) continue;
    modules.push({ id: module.id, type });
  }

  const source = resolveSourceModuleId(modules, input.sourceModuleId);
  if (!source.ok) return source;

  const adjacency = buildFundRouteAdjacency(modules, input.links);
  const terminalModuleIds = inboundFundRouterIds(modules, input.links);
  if (terminalModuleIds.size === 0) {
    return {
      ok: false,
      error: {
        code: 'no_paths',
        detail: 'no fund_router → math terminal fund_route links in graph',
      },
    };
  }

  const paths = collectPaths(
    adjacency,
    terminalModuleIds,
    source.sourceModuleId,
    input.amountCents,
  );
  if (paths.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no_paths',
        detail: 'no connected fund_route path from holding_fund to terminal math',
      },
    };
  }

  const proposals = paths.flatMap((path) =>
    path.hops.map((hop) => hopProposal(hop.fromModuleId, hop.toModuleId, hop.amountCents)),
  );

  return { ok: true, result: { paths, proposals } };
}
