import { and, eq, inArray } from 'drizzle-orm';
import { collectSectorSeedTargets, sectorFolderTag } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  catalogEntries,
  companies,
  concepts,
  libraries,
  libraryConcepts,
  modules,
} from '@hftr/db/schema';
const MECHANISMS_LIBRARY_NAME = 'Seeded trading mechanisms';

/** Lazy import avoids circular dependency with bootstrap → ensureSectorKnowledge. */
async function loadSeededBodyHelpers(): Promise<{
  buildSeededConceptBody: typeof import('./seeded-concept-body').buildSeededConceptBody;
  collectSeededConceptTags: typeof import('./seeded-concept-body').collectSeededConceptTags;
}> {
  const mod = await import('./seeded-concept-body');
  return {
    buildSeededConceptBody: mod.buildSeededConceptBody,
    collectSeededConceptTags: mod.collectSeededConceptTags,
  };
}

function resolveOwnerModuleId(companyModules: Array<{ id: string; type: string }>): string | null {
  const research = companyModules.find((m) => m.type === 'research');
  if (research) return research.id;
  const librarian = companyModules.find((m) => m.type === 'librarian');
  if (librarian) return librarian.id;
  const library = companyModules.find((m) => m.type === 'library');
  if (library) return library.id;
  const math = companyModules.find((m) => m.type === 'math');
  return math?.id ?? null;
}

type SubsectorProfile = {
  id?: string;
  name?: string;
  behaviorProfile?: string;
  trendDrivers?: string[];
  leadPatterns?: string[];
  preferredStrategies?: string[];
};

/**
 * Materialize vendored `sector_seeds` pages for the company's sector focuses into
 * the baseline Seeded trading mechanisms library (Baseline → Sector knowledge).
 * Idempotent upsert; adding focuses later seeds additional pages without wiping old ones.
 */
export async function ensureSectorKnowledge(
  db: Db,
  companyId: string,
  now: Date,
  opts?: { sectorFocuses?: readonly string[] },
): Promise<{ conceptsUpserted: number }> {
  let focuses = opts?.sectorFocuses ? [...opts.sectorFocuses] : null;
  if (!focuses) {
    const [company] = await db
      .select({ sectorFocuses: companies.sectorFocuses })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    focuses = company?.sectorFocuses ?? [];
  }

  if (focuses.length === 0) {
    return { conceptsUpserted: 0 };
  }

  const { sectorKeys, subsectorKeysBySector } = collectSectorSeedTargets(focuses);
  if (sectorKeys.length === 0) {
    return { conceptsUpserted: 0 };
  }

  const [mechLib] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.name, MECHANISMS_LIBRARY_NAME)))
    .limit(1);
  if (!mechLib) {
    return { conceptsUpserted: 0 };
  }

  const companyModules = await db
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, companyId));
  const ownerModuleId = resolveOwnerModuleId(companyModules);
  if (!ownerModuleId) {
    return { conceptsUpserted: 0 };
  }

  const catalogRows = await db
    .select()
    .from(catalogEntries)
    .where(eq(catalogEntries.catalog, 'sector_seeds'));

  const matched = catalogRows.filter((row) => {
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const sectorKey =
      typeof payload.sector === 'string'
        ? payload.sector
        : row.title.toLowerCase().replace(/\s+/g, '_');
    return sectorKeys.includes(sectorKey);
  });

  if (matched.length === 0) {
    return { conceptsUpserted: 0 };
  }

  const seededTitles: string[] = [];
  let conceptsUpserted = 0;

  for (const entry of matched) {
    const payload =
      entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
        ? (entry.payload as Record<string, unknown>)
        : {};
    const sectorKey =
      typeof payload.sector === 'string'
        ? payload.sector
        : entry.title.toLowerCase().replace(/\s+/g, '_');
    const folderTag = sectorFolderTag(sectorKey);
    const title = `sector_${sectorKey}`;
    const { buildSeededConceptBody, collectSeededConceptTags } = await loadSeededBodyHelpers();
    const bodyEntry = {
      catalog: 'sector_seeds' as const,
      entryKey: entry.entryKey,
      title: sectorKey,
      tier: null,
      payload: entry.payload,
    };
    const tags = [...collectSeededConceptTags(bodyEntry), folderTag, 'baseline_sector'];
    const body = buildSeededConceptBody(bodyEntry);
    const sourceRef = `sector_seeds/${entry.entryKey}`;

    await db
      .insert(concepts)
      .values({
        companyId,
        moduleId: ownerModuleId,
        title,
        body,
        tags,
        sourceClass: 'catalog_seed',
        sourceRef,
        status: 'active',
        primaryLibraryId: mechLib.id,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body,
          tags,
          sourceClass: 'catalog_seed',
          sourceRef,
          primaryLibraryId: mechLib.id,
          status: 'active',
          updatedAt: now,
        },
      });

    seededTitles.push(title);
    conceptsUpserted += 1;

    const wantedSubs = subsectorKeysBySector.get(sectorKey);
    const profiles = Array.isArray(payload.subsectorProfiles)
      ? (payload.subsectorProfiles as SubsectorProfile[])
      : [];

    for (const profile of profiles) {
      const name = typeof profile.name === 'string' ? profile.name : '';
      if (!name) continue;
      // When specific subsectors were selected, seed those; otherwise seed all profiles.
      if (wantedSubs && wantedSubs.size > 0 && !wantedSubs.has(name)) continue;

      const subTitle = `subsector_${name}`;
      const subEntry = {
        catalog: 'sector_seeds' as const,
        entryKey: `${entry.entryKey}/${name}`,
        title: name,
        tier: null,
        payload: {
          summary: profile.behaviorProfile ?? '',
          trendDrivers: profile.trendDrivers,
          leadGatheringPatterns: profile.leadPatterns,
          preferredFamilies: profile.preferredStrategies,
          sector: sectorKey,
        },
      };
      const subTags = [
        ...collectSeededConceptTags(subEntry),
        folderTag,
        `subsector_${name}`,
        'baseline_sector',
      ];
      const subBody = buildSeededConceptBody(subEntry);
      const subRef = `sector_seeds/${entry.entryKey}/${name}`;

      await db
        .insert(concepts)
        .values({
          companyId,
          moduleId: ownerModuleId,
          title: subTitle,
          body: subBody,
          tags: subTags,
          sourceClass: 'catalog_seed',
          sourceRef: subRef,
          status: 'active',
          primaryLibraryId: mechLib.id,
        })
        .onConflictDoUpdate({
          target: [concepts.moduleId, concepts.title],
          set: {
            body: subBody,
            tags: subTags,
            sourceClass: 'catalog_seed',
            sourceRef: subRef,
            primaryLibraryId: mechLib.id,
            status: 'active',
            updatedAt: now,
          },
        });

      seededTitles.push(subTitle);
      conceptsUpserted += 1;
    }
  }

  if (seededTitles.length === 0) {
    return { conceptsUpserted: 0 };
  }

  const conceptRows = await db
    .select({ id: concepts.id, title: concepts.title })
    .from(concepts)
    .where(and(eq(concepts.moduleId, ownerModuleId), inArray(concepts.title, seededTitles)));

  for (const row of conceptRows) {
    await db
      .insert(libraryConcepts)
      .values({
        libraryId: mechLib.id,
        conceptId: row.id,
        curationStatus: 'auto_admitted',
      })
      .onConflictDoUpdate({
        target: [libraryConcepts.libraryId, libraryConcepts.conceptId],
        set: {
          curationStatus: 'auto_admitted',
          updatedAt: now,
        },
      });
  }

  return { conceptsUpserted };
}
