import { ilike, inArray, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { catalogEntries, concepts } from '@hftr/db/schema';
import { registerHandler } from './registry';

const CuratePayload = z.object({
  companyId: z.string().uuid(),
  moduleId: z.string().uuid(),
  topicScope: z.string().max(200).default(''),
});

const CURATED_CATALOGS = ['strategy_families', 'guardrail_packages'];
const MAX_CONCEPTS_PER_RUN = 8;

/**
 * Deterministic research curation placeholder (RESEARCH queue). Selects
 * catalog entries relevant to the module's topic scope and upserts them as
 * concepts. No model is involved: bodies are composed from catalog fields
 * only (no invented claims), sourceClass is honestly labeled
 * `deterministic_placeholder`, and sourceRef cites the catalog entry. A real
 * research-tier model call replaces this selection without schema changes.
 */
registerHandler('research.curate', async ({ db, clock, job }) => {
  const payload = CuratePayload.parse(job.payload);
  const now = new Date(clock.nowMs());

  const tokens = payload.topicScope
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  const filters: SQL[] = [inArray(catalogEntries.catalog, CURATED_CATALOGS)];
  for (const token of tokens) {
    filters.push(ilike(catalogEntries.title, `%${token}%`));
  }

  const entries = await db
    .select()
    .from(catalogEntries)
    .where(or(...filters))
    .orderBy(catalogEntries.catalog, catalogEntries.entryKey)
    .limit(MAX_CONCEPTS_PER_RUN);

  for (const entry of entries) {
    const tags = [entry.catalog, ...(entry.tier ? [entry.tier] : [])];
    const body =
      `Catalog reference: "${entry.title}" from the ${entry.catalog} catalog ` +
      `(entry ${entry.entryKey}, version ${entry.catalogVersion}` +
      `${entry.tier ? `, tier ${entry.tier}` : ''}). ` +
      'Selected deterministically for this module by catalog relevance — ' +
      'not model-generated research. Full details live in the cited catalog entry.';

    await db
      .insert(concepts)
      .values({
        companyId: payload.companyId,
        moduleId: payload.moduleId,
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
          updatedAt: now,
        },
      });
  }
});
