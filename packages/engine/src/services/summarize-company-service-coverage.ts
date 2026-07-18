import { eq } from 'drizzle-orm';
import { MODULE_SERVICE_REQUIREMENTS, type ModuleType, type ServiceCapability } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { moduleServiceBindings, modules } from '@hftr/db/schema';

export type ServiceCoverageSummary = {
  moduleCount: number;
  modulesWithRequiredGaps: number;
  missingRequiredCapabilities: ServiceCapability[];
  boundCapabilityCount: number;
};

/**
 * Read-only coverage summary from persisted bindings (D-090).
 * Does not re-resolve or rewrite rows — safe for directory cards.
 */
export async function summarizeCompanyServiceCoverage(
  db: Db,
  companyId: string,
): Promise<ServiceCoverageSummary> {
  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, companyId));

  const bindings = await db
    .select({
      moduleId: moduleServiceBindings.moduleId,
      capability: moduleServiceBindings.capability,
      status: moduleServiceBindings.status,
    })
    .from(moduleServiceBindings)
    .where(eq(moduleServiceBindings.companyId, companyId));

  const boundByModule = new Map<string, Set<ServiceCapability>>();
  for (const row of bindings) {
    if (row.status !== 'bound') continue;
    const set = boundByModule.get(row.moduleId) ?? new Set<ServiceCapability>();
    set.add(row.capability as ServiceCapability);
    boundByModule.set(row.moduleId, set);
  }

  const missingRequired = new Set<ServiceCapability>();
  let modulesWithRequiredGaps = 0;
  let boundCapabilityCount = 0;

  for (const mod of companyModules) {
    const reqs = MODULE_SERVICE_REQUIREMENTS[mod.type as ModuleType];
    if (!reqs) continue;
    const bound = boundByModule.get(mod.id) ?? new Set<ServiceCapability>();
    boundCapabilityCount += bound.size;
    const gaps = reqs.required.filter((cap) => !bound.has(cap));
    if (gaps.length > 0) {
      modulesWithRequiredGaps += 1;
      for (const cap of gaps) missingRequired.add(cap);
    }
  }

  return {
    moduleCount: companyModules.length,
    modulesWithRequiredGaps,
    missingRequiredCapabilities: [...missingRequired].sort(),
    boundCapabilityCount,
  };
}
