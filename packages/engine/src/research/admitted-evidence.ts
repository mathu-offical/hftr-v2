import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { concepts, libraries, libraryConcepts } from '@hftr/db/schema';

/**
 * Opaque refs for library concepts with accepted / auto_admitted curation.
 * Used by evidence_fit on promote (D-039) — never embeds raw financial digits.
 */
export async function loadAdmittedArtifactRefs(
  db: Db,
  companyId: string,
): Promise<{ refs: string[]; libraryConceptCount: number }> {
  const companyLibraries = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active')));

  if (companyLibraries.length === 0) {
    return { refs: [], libraryConceptCount: 0 };
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
  };
}
