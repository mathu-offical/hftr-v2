import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ResearchModuleConfig } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { concepts, libraries, libraryConcepts, modules } from '@hftr/db/schema';
import { loadCompanyLinkGraph, resolveOutboundLibraryModules } from '../graph/module-links';

/**
 * Attach newly persisted concepts to target libraries.
 * Preference order: research→library canvas data_feed edges → config
 * targetLibraryIds → company master library.
 * Sets `primary_library_id` to the first target when unset (D-040 nests).
 */
export async function attachConceptsToLibraries(opts: {
  db: Db;
  companyId: string;
  moduleId: string;
  conceptIds: string[];
  now: Date;
  curationStatus?: 'proposed' | 'accepted' | 'auto_admitted' | 'rejected' | 'archived';
  researchRunId?: string | null;
}): Promise<string[]> {
  if (opts.conceptIds.length === 0) return [];

  const [mod] = await opts.db
    .select({ config: modules.config })
    .from(modules)
    .where(and(eq(modules.id, opts.moduleId), eq(modules.companyId, opts.companyId)))
    .limit(1);
  if (!mod) return [];

  const targetLibraryIds = await resolveAttachLibraryIds(
    opts.db,
    opts.companyId,
    opts.moduleId,
    mod.config,
  );
  if (targetLibraryIds.length === 0) return [];

  const primaryLibraryId = targetLibraryIds[0]!;

  for (const libraryId of targetLibraryIds) {
    for (const conceptId of opts.conceptIds) {
      await opts.db
        .insert(libraryConcepts)
        .values({
          libraryId,
          conceptId,
          curationStatus: opts.curationStatus ?? 'proposed',
          researchRunId: opts.researchRunId ?? null,
        })
        .onConflictDoUpdate({
          target: [libraryConcepts.libraryId, libraryConcepts.conceptId],
          set: {
            curationStatus: opts.curationStatus ?? undefined,
            researchRunId: opts.researchRunId ?? undefined,
            updatedAt: opts.now,
          },
        });
    }
  }

  await opts.db
    .update(concepts)
    .set({
      primaryLibraryId,
      updatedAt: opts.now,
    })
    .where(
      and(
        eq(concepts.companyId, opts.companyId),
        inArray(concepts.id, opts.conceptIds),
        isNull(concepts.primaryLibraryId),
      ),
    );

  return targetLibraryIds;
}

async function resolveAttachLibraryIds(
  db: Db,
  companyId: string,
  researchModuleId: string,
  rawConfig: unknown,
): Promise<string[]> {
  const graph = await loadCompanyLinkGraph(db, companyId);
  const linkedLibraryMods = resolveOutboundLibraryModules(graph, researchModuleId);
  if (linkedLibraryMods.length > 0) {
    const moduleIds = linkedLibraryMods.map((m) => m.id);
    const linked = await db
      .select({ id: libraries.id })
      .from(libraries)
      .where(
        and(
          eq(libraries.companyId, companyId),
          eq(libraries.status, 'active'),
          inArray(libraries.moduleId, moduleIds),
        ),
      );
    if (linked.length > 0) return linked.map((r) => r.id);
  }

  const config = ResearchModuleConfig.safeParse(rawConfig);
  if (config.success && config.data.targetLibraryIds.length > 0) {
    return config.data.targetLibraryIds;
  }

  return resolveMasterLibraryId(db, companyId);
}

async function resolveMasterLibraryId(db: Db, companyId: string): Promise<string[]> {
  const rows = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.masterLibrary, true),
        eq(libraries.status, 'active'),
      ),
    )
    .limit(1);
  const master = rows[0];
  return master ? [master.id] : [];
}
