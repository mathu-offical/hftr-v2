import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  engineInstances,
  engineUtilityLinks,
  modules,
} from '@hftr/db/schema';
import {
  engineCategoryExposesFunds,
  engineUtilityBusesForCategory,
  getEngineTemplateById,
  type EngineUtilityBus,
} from '@hftr/contracts';

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
 * D-091: bind company holding_fund to an execution engine's funds utility bus.
 * Idempotent — skips research engines and when already bound.
 */
export async function ensureEngineFundsUtilityBind(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<{ bound: boolean; linkId?: string }> {
  const [engine] = await db
    .select({ id: engineInstances.id, templateId: engineInstances.templateId })
    .from(engineInstances)
    .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)))
    .limit(1);
  if (!engine) return { bound: false };

  const template = getEngineTemplateById(engine.templateId);
  if (!template || !engineCategoryExposesFunds(template.category)) {
    return { bound: false };
  }

  const [existing] = await db
    .select({ id: engineUtilityLinks.id })
    .from(engineUtilityLinks)
    .where(
      and(
        eq(engineUtilityLinks.companyId, companyId),
        eq(engineUtilityLinks.toEngineId, engineId),
        eq(engineUtilityLinks.bus, 'funds'),
      ),
    )
    .limit(1);
  if (existing) return { bound: false, linkId: existing.id };

  const [holdingFund] = await db
    .select({ id: modules.id })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'holding_fund')))
    .limit(1);
  if (!holdingFund) return { bound: false };

  const [row] = await db
    .insert(engineUtilityLinks)
    .values({
      companyId,
      toEngineId: engineId,
      bus: 'funds',
      fromModuleId: holdingFund.id,
      fromEngineId: null,
      streamDescriptor: 'Holding fund capital envelope',
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: engineUtilityLinks.id });

  return { bound: Boolean(row), ...(row?.id ? { linkId: row.id } : {}) };
}

/**
 * D-091: seed data_out utility from the engine's terminal analyzer (research path).
 * Creates a stub stream so chrome shows an outbound port before first concat run.
 */
export async function ensureEngineAnalyzerDataOut(
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
        eq(engineUtilityLinks.bus, 'data_out'),
      ),
    )
    .limit(1);
  if (existing) return { bound: false, linkId: existing.id };

  const [analyzer] = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(
      and(
        eq(modules.companyId, companyId),
        eq(modules.engineInstanceId, engineId),
        eq(modules.type, 'analyzer'),
      ),
    )
    .limit(1);
  if (!analyzer) return { bound: false };

  const streamId = `eng_stream_${analyzer.id.replace(/-/g, '').slice(0, 16)}`;
  const [row] = await db
    .insert(engineUtilityLinks)
    .values({
      companyId,
      toEngineId: engineId,
      bus: 'data_out',
      fromModuleId: analyzer.id,
      fromEngineId: null,
      streamId,
      streamDescriptor: 'Research concat · pending',
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

/**
 * Full motherboard bind pass: clock + funds + analyzer data_out + inter-engine
 * data streams + hydrate.
 */
export async function ensureEngineMotherboardUtilities(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<{
  clockBound: boolean;
  fundsBound: boolean;
  dataOutBound: boolean;
  interEngineLinked: number;
  topicProjected: number;
  focusProjected: number;
}> {
  const clock = await ensureEngineClockUtilityBind(db, companyId, engineId, now);
  const funds = await ensureEngineFundsUtilityBind(db, companyId, engineId, now);
  const dataOut = await ensureEngineAnalyzerDataOut(db, companyId, engineId, now);
  const inter = await ensureInterEngineDataStreamLinks(db, companyId, engineId, now);
  const hydrate = await hydrateEngineMembersFromUtilities(db, companyId, engineId, now);
  return {
    clockBound: clock.bound,
    fundsBound: funds.bound,
    dataOutBound: dataOut.bound,
    interEngineLinked: inter.linked,
    topicProjected: hydrate.topicProjected,
    focusProjected: hydrate.focusProjected,
  };
}

/**
 * D-091: when an engine is added, wire established data_out peers ↔ data_in.
 * - New engine with data_in ← every other engine that already publishes data_out
 * - New engine with data_out → every other engine that exposes data_in
 * Idempotent; skips self and existing pairs.
 */
export async function ensureInterEngineDataStreamLinks(
  db: Db,
  companyId: string,
  engineId: string,
  now = new Date(),
): Promise<{ linked: number }> {
  const [engine] = await db
    .select({ id: engineInstances.id, templateId: engineInstances.templateId })
    .from(engineInstances)
    .where(and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, companyId)))
    .limit(1);
  if (!engine) return { linked: 0 };

  const template = getEngineTemplateById(engine.templateId);
  const buses = engineUtilityBusesForCategory(template?.category ?? 'research');
  const peers = await db
    .select({ id: engineInstances.id, templateId: engineInstances.templateId })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));

  const existing = await db
    .select()
    .from(engineUtilityLinks)
    .where(eq(engineUtilityLinks.companyId, companyId));

  const hasPair = (fromEngineId: string, toEngineId: string) =>
    existing.some(
      (row) =>
        row.bus === 'data_in' &&
        row.toEngineId === toEngineId &&
        row.fromEngineId === fromEngineId,
    );

  const dataOutByEngine = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    if (row.bus === 'data_out' && row.toEngineId) {
      dataOutByEngine.set(row.toEngineId, row);
    }
  }

  let linked = 0;

  if (buses.includes('data_in')) {
    for (const peer of peers) {
      if (peer.id === engineId) continue;
      const upstreamOut = dataOutByEngine.get(peer.id);
      if (!upstreamOut) continue;
      if (hasPair(peer.id, engineId)) continue;
      const [row] = await db
        .insert(engineUtilityLinks)
        .values({
          companyId,
          toEngineId: engineId,
          bus: 'data_in',
          fromEngineId: peer.id,
          fromModuleId: null,
          streamId: upstreamOut.streamId,
          streamDescriptor: upstreamOut.streamDescriptor ?? 'Engine stream',
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        linked += 1;
        existing.push(row);
      }
    }
  }

  if (buses.includes('data_out')) {
    const ourOut = dataOutByEngine.get(engineId);
    if (ourOut) {
      for (const peer of peers) {
        if (peer.id === engineId) continue;
        const peerTemplate = getEngineTemplateById(peer.templateId);
        const peerBuses = engineUtilityBusesForCategory(peerTemplate?.category ?? 'research');
        if (!peerBuses.includes('data_in')) continue;
        if (hasPair(engineId, peer.id)) continue;
        const [row] = await db
          .insert(engineUtilityLinks)
          .values({
            companyId,
            toEngineId: peer.id,
            bus: 'data_in',
            fromEngineId: engineId,
            fromModuleId: null,
            streamId: ourOut.streamId,
            streamDescriptor: ourOut.streamDescriptor ?? 'Engine stream',
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (row) {
          linked += 1;
          existing.push(row);
          await hydrateEngineMembersFromUtilities(db, companyId, peer.id, now);
        }
      }
    }
  }

  return { linked };
}

/** Idempotent repair: wire data streams for every engine in the company. */
export async function ensureAllInterEngineDataStreamLinks(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<number> {
  const engines = await db
    .select({ id: engineInstances.id })
    .from(engineInstances)
    .where(eq(engineInstances.companyId, companyId));
  let total = 0;
  for (const engine of engines) {
    const result = await ensureInterEngineDataStreamLinks(db, companyId, engine.id, now);
    total += result.linked;
  }
  return total;
}

export type HydrateEngineResult = {
  engineId: string;
  topicProjected: number;
  focusProjected: number;
};

/**
 * Project engine utility inputs into member modules that have not overridden scope.
 * data_in from upstream engine: copy masterTopicSectors into non-overridden members.
 * clock bind: no module field write (Time hub provisioned separately); records presence only.
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
      .select({
        masterTopicSectors: engineInstances.masterTopicSectors,
      })
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

export async function createEngineUtilityLink(
  db: Db,
  args: CreateUtilityLinkArgs,
  now = new Date(),
) {
  // When wiring data_in from an upstream engine, copy stream metadata from its data_out.
  let streamId = args.streamId ?? null;
  let streamDescriptor = args.streamDescriptor ?? null;
  if (args.bus === 'data_in' && args.fromEngineId && !streamId) {
    const [upstreamOut] = await db
      .select({
        streamId: engineUtilityLinks.streamId,
        streamDescriptor: engineUtilityLinks.streamDescriptor,
      })
      .from(engineUtilityLinks)
      .where(
        and(
          eq(engineUtilityLinks.companyId, args.companyId),
          eq(engineUtilityLinks.toEngineId, args.fromEngineId),
          eq(engineUtilityLinks.bus, 'data_out'),
        ),
      )
      .limit(1);
    if (upstreamOut) {
      streamId = upstreamOut.streamId;
      streamDescriptor = upstreamOut.streamDescriptor ?? streamDescriptor;
    }
  }

  const [row] = await db
    .insert(engineUtilityLinks)
    .values({
      companyId: args.companyId,
      toEngineId: args.toEngineId,
      bus: args.bus,
      fromEngineId: args.fromEngineId ?? null,
      fromModuleId: args.fromModuleId ?? null,
      streamId,
      streamDescriptor,
      updatedAt: now,
    })
    .returning();
  if (args.bus === 'data_in' || args.bus === 'clock' || args.bus === 'funds') {
    await hydrateEngineMembersFromUtilities(db, args.companyId, args.toEngineId, now);
  }
  return row;
}

export async function deleteEngineUtilityLink(
  db: Db,
  companyId: string,
  linkId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(engineUtilityLinks)
    .where(and(eq(engineUtilityLinks.id, linkId), eq(engineUtilityLinks.companyId, companyId)))
    .returning({ id: engineUtilityLinks.id });
  return deleted.length > 0;
}

/** Clear unused import warning helper for isNull if needed by callers. */
export function unboundClockEnginesQuery() {
  return isNull(engineUtilityLinks.id);
}
