import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { concepts, libraries, libraryConcepts } from '@hftr/db/schema';

export interface LoadAdmittedArtifactRefsOpts {
  /** When set, only these library row ids are consulted (scoped by canvas links). */
  libraryIds?: string[];
  /**
   * When set (including empty), resolve libraries bound to these canvas library
   * module ids. Empty array = no libraries in scope (do not fall back to company-wide).
   * When omitted entirely, all active company libraries are consulted.
   */
  libraryModuleIds?: string[];
}

/**
 * Opaque refs for library concepts with accepted / auto_admitted curation.
 * Used by evidence_fit on promote (D-039 / D-090) — never embeds raw financial digits.
 * Prefer link-scoped libraries when the trend has inbound library→trend edges.
 */
export async function loadAdmittedArtifactRefs(
  db: Db,
  companyId: string,
  opts?: LoadAdmittedArtifactRefsOpts,
): Promise<{ refs: string[]; libraryConceptCount: number; libraryIds: string[]; scoped: boolean }> {
  // Explicit empty module scope → cold path (no company-wide scan).
  if (opts?.libraryModuleIds !== undefined && opts.libraryModuleIds.length === 0) {
    return { refs: [], libraryConceptCount: 0, libraryIds: [], scoped: true };
  }
  if (opts?.libraryIds !== undefined && opts.libraryIds.length === 0) {
    return { refs: [], libraryConceptCount: 0, libraryIds: [], scoped: true };
  }

  let companyLibraries = await db
    .select({ id: libraries.id, moduleId: libraries.moduleId })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active')));

  let scoped = false;
  if (opts?.libraryIds && opts.libraryIds.length > 0) {
    const allow = new Set(opts.libraryIds);
    companyLibraries = companyLibraries.filter((l) => allow.has(l.id));
    scoped = true;
  } else if (opts?.libraryModuleIds && opts.libraryModuleIds.length > 0) {
    const allowMods = new Set(opts.libraryModuleIds);
    companyLibraries = companyLibraries.filter(
      (l) => l.moduleId !== null && allowMods.has(l.moduleId),
    );
    scoped = true;
  }

  if (companyLibraries.length === 0) {
    return { refs: [], libraryConceptCount: 0, libraryIds: [], scoped };
  }

  const libraryIds = companyLibraries.map((l) => l.id);
  const rows = await db
    .select({
      conceptId: libraryConcepts.conceptId,
      curationStatus: libraryConcepts.curationStatus,
      title: concepts.title,
    })
    .from(libraryConcepts)
    .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
    .where(inArray(libraryConcepts.libraryId, libraryIds))
    .limit(200);

  const admitted = rows.filter(
    (r) => r.curationStatus === 'accepted' || r.curationStatus === 'auto_admitted',
  );

  return {
    refs: admitted.map((r) => `concept:${r.conceptId}`),
    libraryConceptCount: rows.length,
    libraryIds,
    scoped,
  };
}
