import { eq } from 'drizzle-orm';
import { requiredModuleSetupFields, type ModuleType } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { modules } from '@hftr/db/schema';
import { createSystemClock } from '@hftr/engine';
import { recordModuleSetup } from '@/lib/module-setup';

/**
 * Fan-out ENGINE master topic/sector to members that have not overridden
 * inheritance (D-028).
 */
export async function cascadeEngineMasterTopic(
  db: Db,
  companyId: string,
  engineInstanceId: string,
  masterTopicSectors: readonly string[],
): Promise<number> {
  const members = await db
    .select()
    .from(modules)
    .where(eq(modules.engineInstanceId, engineInstanceId));

  const clock = createSystemClock();
  let updated = 0;
  for (const member of members) {
    if (member.topicSectorsOverridden) continue;
    if (member.type === 'math') continue;
    if (!requiredModuleSetupFields(member.type as ModuleType).includes('topic_sector')) continue;

    const setupPatch = await recordModuleSetup(
      db,
      clock,
      companyId,
      member.id,
      member.type as ModuleType,
      (member.config ?? {}) as Record<string, unknown>,
      { topicSectors: [...masterTopicSectors] },
    );
    if (Object.keys(setupPatch).length === 0) continue;
    await db
      .update(modules)
      .set({
        ...setupPatch,
        topicSectorsOverridden: false,
        updatedAt: new Date(),
      })
      .where(eq(modules.id, member.id));
    updated += 1;
  }
  return updated;
}
