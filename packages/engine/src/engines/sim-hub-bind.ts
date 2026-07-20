import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { engineInstances, modules } from '@hftr/db/schema';
import {
  AnalyzerModuleConfig,
  SimulationEngineBinding,
} from '@hftr/contracts';

export type BindSimAnalyzersToHubResult = {
  updatedModuleIds: string[];
};

/**
 * D-216: stamp child sim analyzers (hubFeedClass direct|analyzed) with parent hub targets.
 * Direct (`to_library`) gets targetLibraryModuleId; analyzed also gets it for topic-feed resolve.
 */
export async function bindSimAnalyzersToHub(
  db: Db,
  companyId: string,
  parentExecutionEngineId: string,
  hubModuleId: string,
  now = new Date(),
): Promise<BindSimAnalyzersToHubResult> {
  const peers = await db
    .select({
      id: engineInstances.id,
      setupSnapshot: engineInstances.setupSnapshot,
    })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));

  const childSimIds: string[] = [];
  for (const peer of peers) {
    const snap = (peer.setupSnapshot ?? {}) as Record<string, unknown>;
    const binding = SimulationEngineBinding.safeParse(snap.simulationBinding);
    if (!binding.success) continue;
    if (binding.data.parentExecutionEngineId !== parentExecutionEngineId) continue;
    if (binding.data.role === 'adhoc') continue;
    childSimIds.push(peer.id);
  }

  if (childSimIds.length === 0) {
    return { updatedModuleIds: [] };
  }

  const rows = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.type, 'analyzer'),
        inArray(modules.engineInstanceId, childSimIds),
      ),
    );

  const updatedModuleIds: string[] = [];
  for (const row of rows) {
    const cfg = { ...((row.config ?? {}) as Record<string, unknown>) };
    const parsed = AnalyzerModuleConfig.safeParse(cfg);
    if (!parsed.success || !parsed.data.hubFeedClass) continue;
    if (parsed.data.targetLibraryModuleId === hubModuleId) continue;
    cfg.targetLibraryModuleId = hubModuleId;
    await db
      .update(modules)
      .set({ config: cfg, updatedAt: now })
      .where(eq(modules.id, row.id));
    updatedModuleIds.push(row.id);
  }

  return { updatedModuleIds };
}
