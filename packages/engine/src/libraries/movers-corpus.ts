import { and, eq, inArray, ne } from 'drizzle-orm';
import { concepts, libraries, libraryConcepts } from '@hftr/db/schema';
import type { ensureSystemLibrary } from './ensure-system-library';

type Db = Parameters<typeof ensureSystemLibrary>[0];

const CORPUS_CAP = 48;

/**
 * Bounded library corpus for Jaccard fit — movers lenses + sector pages +
 * admitted runtime concepts. Excludes noisy model_generated from deterministic lane.
 */
export async function loadMoversLibraryCorpus(
  db: Db,
  companyId: string,
  libraryIds: string[],
): Promise<{ texts: string[]; titles: string[] }> {
  if (libraryIds.length === 0) {
    return { texts: [], titles: [] };
  }

  const rows = await db
    .select({
      title: concepts.title,
      body: concepts.body,
      sourceClass: concepts.sourceClass,
    })
    .from(libraryConcepts)
    .innerJoin(concepts, eq(concepts.id, libraryConcepts.conceptId))
    .where(
      and(
        inArray(libraryConcepts.libraryId, libraryIds),
        eq(concepts.companyId, companyId),
        eq(concepts.status, 'active'),
        ne(concepts.sourceClass, 'model_generated'),
        inArray(libraryConcepts.curationStatus, ['accepted', 'auto_admitted']),
      ),
    )
    .limit(CORPUS_CAP);

  const texts: string[] = [];
  const titles: string[] = [];
  for (const row of rows) {
    titles.push(row.title);
    texts.push(`${row.title}\n${row.body}`.slice(0, 2000));
  }
  return { texts, titles };
}

export async function listCompanyLibraryIds(
  db: Db,
  companyId: string,
  topicScopes: string[],
): Promise<string[]> {
  const rows = await db
    .select({ id: libraries.id, topicScope: libraries.topicScope })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active')));

  const wanted = new Set(topicScopes.map((t) => t.toLowerCase()));
  return rows
    .filter((r) => wanted.size === 0 || wanted.has(r.topicScope.toLowerCase()))
    .map((r) => r.id);
}
