import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  CANVAS_LAYOUT,
  TIME_BEARING_MODULE_TYPES,
  composeModulePrimaryLabel,
  placeEngineTimeHubPosition,
  type ModuleType,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { moduleLinks, modules } from '@hftr/db/schema';

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

function hubPositionFromMembers(members: readonly TimeHubOwnerSeed[]): { x: number; y: number } {
  // Prefer envelope under Math docks: owners use full card height + math dock when Math-required.
  const boxes = members.map((member) => ({
    x: member.position.x,
    y: member.position.y,
    width: CANVAS_LAYOUT.moduleWidth,
    height: CANVAS_LAYOUT.moduleHeight + CANVAS_LAYOUT.mathAttachmentGap + CANVAS_LAYOUT.mathToolHeight,
  }));
  return placeEngineTimeHubPosition(boxes);
}

/**
 * D-091: provision one Time hub module per engine for time-bearing members.
 * Pins to bottom-left of the member envelope. Links Master Clock → Time and
 * Time → each time-bearing member (data_feed). Idempotent for links; always
 * refreshes hub canvas position.
 */
export async function provisionEngineTimeHub(
  db: Db,
  companyId: string,
  engineId: string,
  members: readonly TimeHubOwnerSeed[],
  now = new Date(),
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

  const timePosition = hubPositionFromMembers(bearing.length > 0 ? bearing : members);
  let timeId = existingTime?.id;

  if (!timeId) {
    timeId = randomUUID();
    const name = composeModulePrimaryLabel('Time', 'Engine hub');
    await db.insert(modules).values({
      id: timeId,
      companyId,
      type: 'time',
      name,
      generatedNameBase: 'Time',
      nameCustomized: false,
      config: { transform: 'elapsed', descriptor: 'engine time hub (elapsed)' },
      status: 'active',
      canvasPosition: timePosition,
      engineInstanceId: engineId,
      toolOwnerModuleId: null,
    });
  } else {
    await db
      .update(modules)
      .set({ canvasPosition: timePosition, updatedAt: now })
      .where(eq(modules.id, timeId));
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

/**
 * Reposition every engine Time hub to bottom-left of its members (page-load heal).
 */
export async function repositionAllEngineTimeHubs(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<number> {
  const engineMembers = await db
    .select({
      id: modules.id,
      type: modules.type,
      name: modules.name,
      canvasPosition: modules.canvasPosition,
      engineInstanceId: modules.engineInstanceId,
    })
    .from(modules)
    .where(and(eq(modules.companyId, companyId)));

  const byEngine = new Map<string, typeof engineMembers>();
  for (const row of engineMembers) {
    if (!row.engineInstanceId) continue;
    const list = byEngine.get(row.engineInstanceId) ?? [];
    list.push(row);
    byEngine.set(row.engineInstanceId, list);
  }

  let updated = 0;
  for (const [engineId, rows] of byEngine) {
    const members: TimeHubOwnerSeed[] = rows
      .filter((row) => row.type !== 'time' && row.type !== 'math')
      .map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        position: (row.canvasPosition as { x: number; y: number } | null) ?? { x: 0, y: 0 },
      }));
    if (members.length === 0) continue;
    const result = await provisionEngineTimeHub(db, companyId, engineId, members, now);
    if (result) updated += 1;
  }
  return updated;
}
