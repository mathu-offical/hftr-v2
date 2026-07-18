import { and, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { catalogEntries, concepts } from '@hftr/db/schema';
import { attachConceptsToLibraries } from '../libraries/attach';

const CURATED_CATALOGS = ['strategy_families', 'guardrail_packages'];
export const MAX_CONCEPTS_PER_RUN = 8;

export async function curateDeterministic(opts: {
  db: Db;
  companyId: string;
  moduleId: string;
  topicScope: string;
  now: Date;
}): Promise<number> {
  const tokens = opts.topicScope
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  const filters: SQL[] = [inArray(catalogEntries.catalog, CURATED_CATALOGS)];
  for (const token of tokens) {
    filters.push(ilike(catalogEntries.title, `%${token}%`));
  }

  const entries = await opts.db
    .select()
    .from(catalogEntries)
    .where(or(...filters))
    .orderBy(catalogEntries.catalog, catalogEntries.entryKey)
    .limit(MAX_CONCEPTS_PER_RUN);

  const upsertedTitles: string[] = [];

  for (const entry of entries) {
    const tags = [entry.catalog, ...(entry.tier ? [entry.tier] : [])];
    const body =
      `Catalog reference: "${entry.title}" from the ${entry.catalog} catalog ` +
      `(entry ${entry.entryKey}, version ${entry.catalogVersion}` +
      `${entry.tier ? `, tier ${entry.tier}` : ''}). ` +
      'Selected deterministically for this module by catalog relevance — ' +
      'not model-generated research. Full details live in the cited catalog entry.';

    await opts.db
      .insert(concepts)
      .values({
        companyId: opts.companyId,
        moduleId: opts.moduleId,
        title: entry.title,
        body,
        tags,
        sourceClass: 'deterministic_placeholder',
        sourceRef: `${entry.catalog}/${entry.entryKey}`,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body,
          tags,
          sourceRef: `${entry.catalog}/${entry.entryKey}`,
          status: 'active',
          updatedAt: opts.now,
        },
      });

    upsertedTitles.push(entry.title);
  }

  if (upsertedTitles.length > 0) {
    const conceptRows = await opts.db
      .select({ id: concepts.id })
      .from(concepts)
      .where(and(eq(concepts.moduleId, opts.moduleId), inArray(concepts.title, upsertedTitles)));

    await attachConceptsToLibraries({
      db: opts.db,
      companyId: opts.companyId,
      moduleId: opts.moduleId,
      conceptIds: conceptRows.map((r) => r.id),
      now: opts.now,
      curationStatus: 'auto_admitted',
    });
  }

  return entries.length;
}

export async function loadCatalogHints(opts: {
  db: Db;
  topicScope: string;
}): Promise<Array<{ catalog: string; entryKey: string; title: string; tier: string | null }>> {
  const tokens = opts.topicScope
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);
  const filters: SQL[] = [inArray(catalogEntries.catalog, CURATED_CATALOGS)];
  for (const token of tokens) {
    filters.push(ilike(catalogEntries.title, `%${token}%`));
  }
  const entries = await opts.db
    .select({
      catalog: catalogEntries.catalog,
      entryKey: catalogEntries.entryKey,
      title: catalogEntries.title,
      tier: catalogEntries.tier,
    })
    .from(catalogEntries)
    .where(or(...filters))
    .orderBy(catalogEntries.catalog, catalogEntries.entryKey)
    .limit(MAX_CONCEPTS_PER_RUN);
  return entries.map((e) => ({
    catalog: e.catalog,
    entryKey: e.entryKey,
    title: e.title,
    tier: e.tier,
  }));
}
