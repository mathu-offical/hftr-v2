import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { engineInstances, modules } from '@hftr/db/schema';
import {
  EngineSetupSnapshot,
  MODULE_CONFIG_SCHEMAS,
  mimicParentEngineSetup,
  mimicParentModuleConfigs,
  type ModuleType,
} from '@hftr/contracts';

export type MimicParentExecutionEnvelopeResult = {
  updatedModuleIds: string[];
  setupSnapshot: EngineSetupSnapshot;
};

/**
 * D-189: after child sim members exist, clone parent execution envelope onto the child.
 */
export async function mimicParentExecutionEnvelope(
  db: Db,
  companyId: string,
  childEngineId: string,
  parentExecutionEngineId: string,
  childMemberIds: readonly string[],
  now = new Date(),
): Promise<MimicParentExecutionEnvelopeResult | null> {
  const [parentEngine] = await db
    .select({
      setupSnapshot: engineInstances.setupSnapshot,
    })
    .from(engineInstances)
    .where(
      and(
        eq(engineInstances.companyId, companyId),
        eq(engineInstances.id, parentExecutionEngineId),
      ),
    )
    .limit(1);
  if (!parentEngine) return null;

  const [childEngine] = await db
    .select({
      setupSnapshot: engineInstances.setupSnapshot,
      masterTopicSectors: engineInstances.masterTopicSectors,
    })
    .from(engineInstances)
    .where(and(eq(engineInstances.companyId, companyId), eq(engineInstances.id, childEngineId)))
    .limit(1);
  if (!childEngine) return null;

  const memberRows =
    childMemberIds.length === 0
      ? []
      : await db
          .select({ id: modules.id, type: modules.type, config: modules.config })
          .from(modules)
          .where(
            and(
              eq(modules.companyId, companyId),
              inArray(modules.id, [...childMemberIds]),
            ),
          );

  const parentModules = await db
    .select({ type: modules.type, config: modules.config })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.engineInstanceId, parentExecutionEngineId),
      ),
    );

  const parentSnapshot = EngineSetupSnapshot.parse(parentEngine.setupSnapshot ?? {});
  const childSnapshot = EngineSetupSnapshot.parse(childEngine.setupSnapshot ?? {});
  const parentSource = {
    setupSnapshot: parentSnapshot,
    modules: parentModules.map((row) => ({
      type: row.type as ModuleType,
      config: (row.config ?? {}) as Record<string, unknown>,
    })),
  };

  const nextSetupSnapshot = mimicParentEngineSetup(parentSource, childSnapshot);
  const mimicked = mimicParentModuleConfigs(
    parentSource.modules,
    memberRows.map((row) => ({
      type: row.type as ModuleType,
      config: (row.config ?? {}) as Record<string, unknown>,
    })),
  );

  const updatedModuleIds: string[] = [];
  for (let index = 0; index < memberRows.length; index += 1) {
    const row = memberRows[index]!;
    const mimickedConfig = mimicked[index]?.config ?? (row.config ?? {});
    const schema = MODULE_CONFIG_SCHEMAS[row.type as ModuleType];
    const parsed = schema.parse(mimickedConfig);
    await db
      .update(modules)
      .set({ config: parsed, updatedAt: now })
      .where(eq(modules.id, row.id));
    updatedModuleIds.push(row.id);
  }

  await db
    .update(engineInstances)
    .set({
      setupSnapshot: nextSetupSnapshot,
      masterTopicSectors:
        nextSetupSnapshot.topicSectors.length > 0
          ? nextSetupSnapshot.topicSectors
          : childEngine.masterTopicSectors,
      updatedAt: now,
    })
    .where(eq(engineInstances.id, childEngineId));

  return { updatedModuleIds, setupSnapshot: nextSetupSnapshot };
}
