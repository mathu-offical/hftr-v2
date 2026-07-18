import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  TIME_BEARING_MODULE_TYPES,
  composeModulePrimaryLabel,
  type ModuleType,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { moduleLinks, modules } from '@hftr/db/schema';

const TIME_WIDTH = 180;
const TIME_HEIGHT = 40;
const OWNER_HEIGHT = 168;
const ATTACHMENT_GAP = 12;

export interface TimeHubOwnerSeed {
  id: string;
  type: ModuleType;
  name: string;
  position: { x: number; y: number };
}

export interface ProvisionedTimeHub {
  id: string;
  engineInstanceId: string;
  position: { x: number; y: number };
  links: Array<{
    id: string;
    fromModuleId: string;
    toModuleId: string;
    linkKind: 'data_feed';
  }>;
}

/**
 * D-091: provision one Time hub module per engine for time-bearing members.
 * Links Master Clock → Time and Time → each time-bearing member (data_feed).
 * Idempotent when a Time module already exists for the engine.
 */
export async function provisionEngineTimeHub(
  db: Db,
  companyId: string,
  engineId: string,
  members: readonly TimeHubOwnerSeed[],
): Promise<ProvisionedTimeHub | null> {
  const bearing = members.filter((m) => TIME_BEARING_MODULE_TYPES.has(m.type));
  if (bearing.length === 0) return null;

  const [existingTime] = await db
    .select({ id: modules.id, canvasPosition: modules.canvasPosition })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.engineInstanceId, engineId),
        eq(modules.type, 'time'),
      ),
    )
    .limit(1);

  const [clock] = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'clock')))
    .limit(1);

  let timeId = existingTime?.id;
  let timePosition =
    (existingTime?.canvasPosition as { x: number; y: number } | null) ?? null;

  if (!timeId) {
    const anchor = bearing[0]!;
    timePosition = {
      x: anchor.position.x,
      y: anchor.position.y + OWNER_HEIGHT + ATTACHMENT_GAP,
    };
    timeId = randomUUID();
    const name = composeModulePrimaryLabel('Time', 'Engine hub');
    await db.insert(modules).values({
      id: timeId,
      companyId,
      type: 'time',
      name,
      generatedNameBase: 'Time',
      nameCustomized: false,
      config: { transform: 'elapsed' },
      status: 'active',
      canvasPosition: timePosition,
      engineInstanceId: engineId,
      toolOwnerModuleId: null,
    });
  }

  if (!timePosition) {
    timePosition = { x: 0, y: 0 };
  }

  const createdLinks: ProvisionedTimeHub['links'] = [];

  if (clock) {
    const [existingClockLink] = await db
      .select({ id: moduleLinks.id })
      .from(moduleLinks)
      .where(
        and(
          eq(moduleLinks.companyId, companyId),
          eq(moduleLinks.fromModuleId, clock.id),
          eq(moduleLinks.toModuleId, timeId),
          eq(moduleLinks.linkKind, 'data_feed'),
        ),
      )
      .limit(1);
    if (!existingClockLink) {
      const linkId = randomUUID();
      await db.insert(moduleLinks).values({
        id: linkId,
        companyId,
        fromModuleId: clock.id,
        toModuleId: timeId,
        linkKind: 'data_feed',
      });
      createdLinks.push({
        id: linkId,
        fromModuleId: clock.id,
        toModuleId: timeId,
        linkKind: 'data_feed',
      });
    }
  }

  const memberIds = bearing.map((m) => m.id);
  const existingMemberLinks =
    memberIds.length > 0
      ? await db
          .select({
            id: moduleLinks.id,
            toModuleId: moduleLinks.toModuleId,
          })
          .from(moduleLinks)
          .where(
            and(
              eq(moduleLinks.companyId, companyId),
              eq(moduleLinks.fromModuleId, timeId),
              eq(moduleLinks.linkKind, 'data_feed'),
              inArray(moduleLinks.toModuleId, memberIds),
            ),
          )
      : [];
  const linkedTargets = new Set(existingMemberLinks.map((l) => l.toModuleId));

  for (const member of bearing) {
    if (linkedTargets.has(member.id)) continue;
    const linkId = randomUUID();
    await db.insert(moduleLinks).values({
      id: linkId,
      companyId,
      fromModuleId: timeId,
      toModuleId: member.id,
      linkKind: 'data_feed',
    });
    createdLinks.push({
      id: linkId,
      fromModuleId: timeId,
      toModuleId: member.id,
      linkKind: 'data_feed',
    });
  }

  return {
    id: timeId,
    engineInstanceId: engineId,
    position: timePosition,
    links: createdLinks,
  };
}
