/**
 * Prefer Engine Data Hub corpus cache when the module sits in an execution engine
 * with an ensured hub (D-242). Falls back to empty — callers merge with link scans.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { LibraryConceptEvidenceInput } from '@hftr/adapters';
import type { Db } from '@hftr/db';
import { concepts, libraries, libraryConcepts, modules } from '@hftr/db/schema';
import { loadHubCorpus } from './hub-corpus-cache';

export async function loadHubCorpusConceptEvidence(
  db: Db,
  companyId: string,
  moduleId: string,
  now = new Date(),
): Promise<LibraryConceptEvidenceInput[]> {
  const [mod] = await db
    .select({ engineInstanceId: modules.engineInstanceId })
    .from(modules)
    .where(and(eq(modules.id, moduleId), eq(modules.companyId, companyId)))
    .limit(1);
  if (!mod?.engineInstanceId) return [];

  const [hubLib] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.isEngineDataHub, true),
        eq(libraries.ownerEngineInstanceId, mod.engineInstanceId),
      ),
    )
    .limit(1);
  if (!hubLib) return [];

  const cache = await loadHubCorpus(db, hubLib.id, now);
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
