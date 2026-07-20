import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  concepts,
  engineInstances,
  engineUtilityLinks,
  libraries,
  libraryConcepts,
  moduleLinks,
  modules,
} from '@hftr/db/schema';
import {
  AnalyzerModuleConfig,
  type AnalyzerEmitMode,
  isEngineDataHubConfig,
  SimulationEngineBinding,
} from '@hftr/contracts';
import { registerHandler } from './registry';
import { ingestHubTopicCandidate } from '../engines/data-hub-topic-feed';
import { invalidateCompanyHubCaches } from '../engines/hub-corpus-cache';
import { z } from 'zod';

const ConcatPayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  engineId: z.string().uuid().optional(),
});

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Model-free analyzer concat (D-091): merge inbound linked concepts into one
 * qualitative package, then emit per emitMode (library write and/or engine data_out).
 */
registerHandler('analyzer.concat', async ({ db, clock, job }) => {
  const payload = ConcatPayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const [analyzer] = await db
    .select()
    .from(modules)
    .where(
      and(
        eq(modules.id, payload.moduleId),
        eq(modules.companyId, payload.companyId),
        eq(modules.type, 'analyzer'),
      ),
    )
    .limit(1);
  if (!analyzer) {
    throw new Error('analyzer_module_not_found');
  }

  const config = AnalyzerModuleConfig.parse(analyzer.config ?? {});
  const emitMode: AnalyzerEmitMode = config.emitMode;

  const inbound = await db
    .select({
      fromModuleId: moduleLinks.fromModuleId,
      fromType: modules.type,
      fromName: modules.name,
    })
    .from(moduleLinks)
    .innerJoin(modules, eq(modules.id, moduleLinks.fromModuleId))
    .where(
      and(
        eq(moduleLinks.companyId, payload.companyId),
        eq(moduleLinks.toModuleId, payload.moduleId),
        eq(moduleLinks.linkKind, 'data_feed'),
      ),
    );

  const libraryModuleIds = inbound.filter((r) => r.fromType === 'library').map((r) => r.fromModuleId);
  const sourceLabels = [
    ...new Set(
      inbound.map((r) => {
        if (r.fromType === 'live_api') return humanizeToken(r.fromName.split('·')[0]?.trim() || 'Live');
        if (r.fromType === 'research') return 'Research';
        if (r.fromType === 'librarian') return 'Librarian';
        if (r.fromType === 'library') return 'Library';
        if (r.fromType === 'trend') return 'Trend';
        return humanizeToken(r.fromType);
      }),
    ),
  ].sort((a, b) => a.localeCompare(b));

  let conceptRows: Array<{ conceptId: string; title: string }> = [];
  if (libraryModuleIds.length > 0) {
    const libRows = await db
      .select({ id: libraries.id })
      .from(libraries)
      .where(
        and(
          eq(libraries.companyId, payload.companyId),
          inArray(libraries.moduleId, libraryModuleIds),
        ),
      );
    const libraryIds = libRows.map((r) => r.id);
    if (libraryIds.length > 0) {
      conceptRows = await db
        .select({
          conceptId: libraryConcepts.conceptId,
          title: concepts.title,
        })
        .from(libraryConcepts)
        .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
        .where(inArray(libraryConcepts.libraryId, libraryIds))
        .limit(40);
    }
  }

  const packageDescriptor =
    config.streamDescriptor?.trim() ||
    (sourceLabels.length > 0
      ? `Concat · ${sourceLabels.join(' + ')}`
      : 'Concat · (no inbound sources)');

  const streamId = `eng_stream_${payload.moduleId.replace(/-/g, '').slice(0, 16)}`;

  // Publish / refresh engine data_out utility when analyzer is an engine member.
  const engineId = payload.engineId ?? analyzer.engineInstanceId;
  if (engineId && (emitMode === 'to_desk_stream' || emitMode === 'to_library')) {
    const existingOut = await db
      .select({ id: engineUtilityLinks.id })
      .from(engineUtilityLinks)
      .where(
        and(
          eq(engineUtilityLinks.companyId, payload.companyId),
          eq(engineUtilityLinks.toEngineId, engineId),
          eq(engineUtilityLinks.bus, 'data_out'),
          eq(engineUtilityLinks.fromModuleId, payload.moduleId),
        ),
      )
      .limit(1);
    if (existingOut[0]) {
      await db
        .update(engineUtilityLinks)
        .set({
          streamId,
          streamDescriptor: packageDescriptor,
          updatedAt: now,
        })
        .where(eq(engineUtilityLinks.id, existingOut[0].id));
    } else {
      await db.insert(engineUtilityLinks).values({
        companyId: payload.companyId,
        toEngineId: engineId,
        bus: 'data_out',
        fromModuleId: payload.moduleId,
        fromEngineId: null,
        streamId,
        streamDescriptor: packageDescriptor,
        updatedAt: now,
      });
    }
  }

  if (emitMode === 'to_library' && conceptRows.length > 0) {
    let targetLibraryId: string | null = null;
    if (config.targetLibraryModuleId) {
      const [lib] = await db
        .select({ id: libraries.id })
        .from(libraries)
        .where(
          and(
            eq(libraries.companyId, payload.companyId),
            eq(libraries.moduleId, config.targetLibraryModuleId),
          ),
        )
        .limit(1);
      targetLibraryId = lib?.id ?? null;
    }
    if (!targetLibraryId && libraryModuleIds[0]) {
      const [lib] = await db
        .select({ id: libraries.id })
        .from(libraries)
        .where(
          and(
            eq(libraries.companyId, payload.companyId),
            eq(libraries.moduleId, libraryModuleIds[0]),
          ),
        )
        .limit(1);
      targetLibraryId = lib?.id ?? null;
    }
    if (targetLibraryId) {
      for (const row of conceptRows.slice(0, 20)) {
        await db
          .insert(libraryConcepts)
          .values({
            libraryId: targetLibraryId,
            conceptId: row.conceptId,
            curationStatus: 'auto_admitted',
          })
          .onConflictDoNothing();
      }
    }
  }

  // D-216: analyzed hub feeds auto-push topic candidates onto the Engine Data Hub.
  if (config.hubFeedClass === 'analyzed') {
    let hubModuleId: string | null = config.targetLibraryModuleId ?? null;
    if (hubModuleId) {
      const [hubMod] = await db
        .select({ id: modules.id, config: modules.config })
        .from(modules)
        .where(and(eq(modules.id, hubModuleId), eq(modules.companyId, payload.companyId)))
        .limit(1);
      if (!hubMod || !isEngineDataHubConfig((hubMod.config ?? {}) as Record<string, unknown>)) {
        hubModuleId = null;
      }
    }
    if (!hubModuleId && engineId) {
      let ownerEngineId = engineId;
      const [eng] = await db
        .select({ setupSnapshot: engineInstances.setupSnapshot })
        .from(engineInstances)
        .where(
          and(eq(engineInstances.id, engineId), eq(engineInstances.companyId, payload.companyId)),
        )
        .limit(1);
      const snap = (eng?.setupSnapshot ?? {}) as Record<string, unknown>;
      const binding = SimulationEngineBinding.safeParse(snap.simulationBinding);
      if (binding.success && binding.data.parentExecutionEngineId) {
        ownerEngineId = binding.data.parentExecutionEngineId;
      }
      const [hubLib] = await db
        .select({ moduleId: libraries.moduleId })
        .from(libraries)
        .where(
          and(
            eq(libraries.companyId, payload.companyId),
            eq(libraries.isEngineDataHub, true),
            eq(libraries.ownerEngineInstanceId, ownerEngineId),
          ),
        )
        .limit(1);
      if (hubLib?.moduleId) hubModuleId = hubLib.moduleId;
    }
    if (hubModuleId) {
      await ingestHubTopicCandidate(
        db,
        {
          companyId: payload.companyId,
          hubModuleId,
          title: packageDescriptor.slice(0, 200),
          provenance: `analyzer.concat:${config.hubShelfOrigin ?? 'sim_training'}`,
          feedClass: 'analyzed',
        },
        now,
      );
      await invalidateCompanyHubCaches(db, payload.companyId, now);
    }
  }

  // Persist concat summary on analyzer config (qualitative only).
  const nextConfig = {
    ...config,
    streamDescriptor: packageDescriptor,
    lastConcatAt: now.toISOString(),
    lastConcatConceptCount: conceptRows.length,
    lastConcatSources: sourceLabels,
  };
  await db
    .update(modules)
    .set({ config: nextConfig, updatedAt: now })
    .where(eq(modules.id, payload.moduleId));
});
