/**
 * Fund routes never enter LLM / model-bearing nodes. Capital from a fund
 * router terminates at each trading owner's dedicated Math tool; calculated
 * ValueRefs return to trading via data_feed (D-033 / number-handling).
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
