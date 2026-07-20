/**
 * Prefer Engine Data Hub corpus cache when the module sits in an execution
 * engine family with an ensured hub (D-242). Child research engines resolve
 * via the parent execution hub. Falls back to empty — callers merge with link scans.
 */

import { inArray, eq } from 'drizzle-orm';
import type { LibraryConceptEvidenceInput } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import { concepts, libraryConcepts } from '@hftr/db/schema';
import { loadHubCorpus } from './hub-corpus-cache';
import { resolveHubLibraryIdForModule } from './data-hub';

export async function loadHubCorpusConceptEvidence(
  db: Db,
  companyId: string,
  moduleId: string,
  now = new Date(),
): Promise<LibraryConceptEvidenceInput[]> {
  const hubLibraryId = await resolveHubLibraryIdForModule(db, companyId, moduleId);
  if (!hubLibraryId) return [];

  const cache = await loadHubCorpus(db, hubLibraryId, now);
  if (!cache) return [];

  const conceptIds = [
    ...new Set(cache.slices.flatMap((s) => s.conceptRefs.map((c) => c.conceptId)).filter(Boolean)),
  ].slice(0, 48);
  if (conceptIds.length === 0) return [];

  const rows = await db
    .select({
      conceptId: concepts.id,
      title: concepts.title,
      body: concepts.body,
      libraryId: libraryConcepts.libraryId,
      curationStatus: libraryConcepts.curationStatus,
    })
    .from(concepts)
    .innerJoin(libraryConcepts, eq(libraryConcepts.conceptId, concepts.id))
    .where(inArray(concepts.id, conceptIds))
    .limit(48);

  return rows
    .filter((r) => r.curationStatus === 'accepted' || r.curationStatus === 'auto_admitted')
    .map((r) => ({
      conceptId: r.conceptId,
      title: r.title,
      body: r.body,
      libraryId: r.libraryId,
      libraryName: 'Engine Data Hub',
    }));
}
