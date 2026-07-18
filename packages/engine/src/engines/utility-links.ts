import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { engineInstances, engineUtilityLinks, modules } from '@hftr/db/schema';
import type { EngineUtilityBus } from '@hftr/contracts';

/**
 * D-091: auto-bind company Master Clock to an engine's clock utility bus.
 * Idempotent — skips when a clock bus link already exists.
 */
export async function ensureEngineClockUtilityBind(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<{ bound: boolean; linkId?: string }> {
  const [existing] = await db
    .select({ id: engineUtilityLinks.id })
    .from(engineUtilityLinks)
    .where(
      and(
        eq(engineUtilityLinks.companyId, companyId),
        eq(engineUtilityLinks.toEngineId, engineId),
        eq(engineUtilityLinks.bus, 'clock'),
      ),
    )
    .limit(1);
  if (existing) return { bound: false, linkId: existing.id };

  const [clock] = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'clock')))
    .limit(1);
  if (!clock) return { bound: false };

  const [row] = await db
    .insert(engineUtilityLinks)
    .values({
      companyId,
      toEngineId: engineId,
      bus: 'clock',
      fromModuleId: clock.id,
      fromEngineId: null,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: engineUtilityLinks.id });

  return { bound: Boolean(row), ...(row?.id ? { linkId: row.id } : {}) };
}

/**
 * Bind all unbound engines in a company to Master Clock.
 */
export async function ensureAllEngineClockBinds(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<number> {
  const engines = await db
    .select({ id: engineInstances.id })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));
  let bound = 0;
  for (const engine of engines) {
    const result = await ensureEngineClockUtilityBind(db, companyId, engine.id, now);
    if (result.bound) bound += 1;
  }
  return bound;
}

export type HydrateEngineResult = {
  engineId: string;
  topicProjected: number;
  focusProjected: number;
};

/**
 * Project engine utility inputs into member modules that have not overridden scope.
 * data_in from upstream engine: copy masterTopicSectors into non-overridden members.
 * clock bind: no module field write (Time hydration deferred); records presence only.
 */
export async function hydrateEngineMembersFromUtilities(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<HydrateEngineResult> {
  const [engine] = await db
    .select()
    .from(engineInstances)
    .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)))
    .limit(1);
  if (!engine) {
    return { engineId, topicProjected: 0, focusProjected: 0 };
  }

  const links = await db
    .select()
    .from(engineUtilityLinks)
    .where(
      and(eq(engineUtilityLinks.companyId, companyId), eq(engineUtilityLinks.toEngineId, engineId)),
    );

  let topicSectors = engine.masterTopicSectors ?? [];
  const dataIn = links.find((l) => l.bus === 'data_in');
  if (dataIn?.fromEngineId) {
    const [upstream] = await db
      .select({ masterTopicSectors: engineInstances.masterTopicSectors })
      .from(engineInstances)
      .where(eq(engineInstances.id, dataIn.fromEngineId))
      .limit(1);
    if (upstream?.masterTopicSectors?.length) {
      topicSectors = upstream.masterTopicSectors;
    }
  }

  const members = await db
    .select({
      id: modules.id,
      type: modules.type,
      topicSectorsOverridden: modules.topicSectorsOverridden,
      config: modules.config,
    })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.engineInstanceId, engineId)));

  let topicProjected = 0;
  let focusProjected = 0;

  for (const member of members) {
    if (member.topicSectorsOverridden) continue;
    if (
      member.type === 'research' ||
      member.type === 'librarian' ||
      member.type === 'library' ||
      member.type === 'trend' ||
      member.type === 'trading' ||
      member.type === 'live_api' ||
      member.type === 'analyzer'
    ) {
      await db
        .update(modules)
        .set({ topicSectors, updatedAt: now })
        .where(eq(modules.id, member.id));
      topicProjected += 1;

      if (
        (member.type === 'research' ||
          member.type === 'librarian' ||
          member.type === 'library' ||
          member.type === 'trend') &&
        topicSectors[0]
      ) {
        const cfg =
          member.config && typeof member.config === 'object' && !Array.isArray(member.config)
            ? { ...(member.config as Record<string, unknown>) }
            : {};
        if (member.type === 'trend') {
          if (!cfg.focus || cfg.focus === 'pending_operator_scope') {
            cfg.focus = topicSectors[0];
            await db
              .update(modules)
              .set({ config: cfg, updatedAt: now })
              .where(eq(modules.id, member.id));
            focusProjected += 1;
          }
        } else if (!cfg.topicScope || cfg.topicScope === 'pending_operator_scope') {
          cfg.topicScope = topicSectors[0];
          await db
            .update(modules)
            .set({ config: cfg, updatedAt: now })
            .where(eq(modules.id, member.id));
          focusProjected += 1;
        }
      }
    }
  }

  return { engineId, topicProjected, focusProjected };
}

export async function listEngineUtilityLinks(db: Db, companyId: string, engineId?: string) {
  if (engineId) {
    return db
      .select()
      .from(engineUtilityLinks)
      .where(
        and(
          eq(engineUtilityLinks.companyId, companyId),
          eq(engineUtilityLinks.toEngineId, engineId),
        ),
      );
  }
  return db
    .select()
    .from(engineUtilityLinks)
    .where(eq(engineUtilityLinks.companyId, companyId));
}

export type CreateUtilityLinkArgs = {
  companyId: string;
  toEngineId: string;
  bus: EngineUtilityBus;
  fromEngineId?: string | null;
  fromModuleId?: string | null;
  streamId?: string | null;
  streamDescriptor?: string | null;
};

export async function createEngineUtilityLink(db: Db, args: CreateUtilityLinkArgs, now = new Date()) {
  const [row] = await db
    .insert(engineUtilityLinks)
    .values({
      companyId: args.companyId,
      toEngineId: args.toEngineId,
      bus: args.bus,
      fromEngineId: args.fromEngineId ?? null,
      fromModuleId: args.fromModuleId ?? null,
      streamId: args.streamId ?? null,
      streamDescriptor: args.streamDescriptor ?? null,
      updatedAt: now,
    })
    .returning();
  if (args.bus === 'data_in' || args.bus === 'clock') {
    await hydrateEngineMembersFromUtilities(db, args.companyId, args.toEngineId, now);
  }
  return row;
}

/** Clear unused import warning helper for isNull if needed by callers. */
export function unboundClockEnginesQuery() {
  return isNull(engineUtilityLinks.id);
}
