/**
 * Fund routes never enter LLM / model-bearing nodes. Capital path (D-229):
 * holding_fund → fund_router (optional implicit fund_path Math hop) →
 * trading owner desk_execution Math; calculated ValueRefs return to trading via
 * data_feed (D-033 / D-038 / number-handling).
 */

/** Resolve template `'math'` endpoints to the engine's fund_path helper Math. */
export function resolveFundPathMathId(
  modules: ReadonlyArray<{ id: string; type: string }>,
  dedicatedMathByOwner: ReadonlyMap<string, string>,
): string | null {
  const routers = modules
    .filter((module) => module.type === 'fund_router')
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const router of routers) {
    const mathId = dedicatedMathByOwner.get(router.id);
    if (mathId) return mathId;
  }
  return null;
}

/**
 * Legacy heal: rewrite holding↔company-hub↔router fund_route hops onto each
 * fund_router's dedicated fund_path Math (D-221) or direct holding→router (D-229).
 */
export function planFundPathMathLinkRewires(args: {
  modules: ReadonlyArray<{
    id: string;
    type: string;
    toolOwnerModuleId: string | null;
  }>;
  links: ReadonlyArray<{
    id: string;
    fromModuleId: string;
    toModuleId: string;
    linkKind: string;
  }>;
}): Array<{ linkId: string; fromModuleId: string; toModuleId: string }> {
  const typeById = new Map(args.modules.map((module) => [module.id, module.type]));
  const fundPathByRouter = new Map<string, string>();
  for (const module of args.modules) {
    if (module.type !== 'math' || !module.toolOwnerModuleId) continue;
    if (typeById.get(module.toolOwnerModuleId) !== 'fund_router') continue;
    fundPathByRouter.set(module.toolOwnerModuleId, module.id);
  }

  const rewires: Array<{ linkId: string; fromModuleId: string; toModuleId: string }> = [];
  for (const [routerId, fundMathId] of fundPathByRouter) {
    for (const link of args.links) {
      if (link.linkKind !== 'fund_route') continue;
      const fromType = typeById.get(link.fromModuleId);
      const toType = typeById.get(link.toModuleId);
      if (fromType === 'holding_fund' && toType === 'math' && link.toModuleId !== fundMathId) {
        rewires.push({
          linkId: link.id,
          fromModuleId: link.fromModuleId,
          toModuleId: fundMathId,
        });
        continue;
      }
      if (
        toType === 'fund_router' &&
        link.toModuleId === routerId &&
        fromType === 'math' &&
        link.fromModuleId !== fundMathId
      ) {
        rewires.push({
          linkId: link.id,
          fromModuleId: fundMathId,
          toModuleId: routerId,
        });
      }
    }
  }
  return rewires;
}

/**
 * Capital from a fund router terminates at each trading owner's dedicated
 * Math tool; calculated ValueRefs return to trading via data_feed.
 */
export function fundRouterToTradingMathLinks(
  companyId: string,
  modules: ReadonlyArray<{ id: string; type: string }>,
  dedicatedMathByOwner: ReadonlyMap<string, string>,
): Array<{
  companyId: string;
  fromModuleId: string;
  toModuleId: string;
  linkKind: 'fund_route';
}> {
  const routers = modules
    .filter((module) => module.type === 'fund_router')
    .sort((a, b) => a.id.localeCompare(b.id));
  const tradings = modules
    .filter((module) => module.type === 'trading')
    .sort((a, b) => a.id.localeCompare(b.id));
  const links: Array<{
    companyId: string;
    fromModuleId: string;
    toModuleId: string;
    linkKind: 'fund_route';
  }> = [];

  for (const trading of tradings) {
    const mathId = dedicatedMathByOwner.get(trading.id);
    if (!mathId) continue;
    for (const router of routers) {
      links.push({
        companyId,
        fromModuleId: router.id,
        toModuleId: mathId,
        linkKind: 'fund_route',
      });
    }
  }

  return links;
}
