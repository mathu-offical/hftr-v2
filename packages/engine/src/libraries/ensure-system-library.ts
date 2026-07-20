import { and, eq, inArray } from 'drizzle-orm';
import type { SystemTopicScope } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { concepts, libraries, libraryConcepts, modules } from '@hftr/db/schema';
import { leakLint } from '../calc/leak-lint';
import { resolveCompanyMathModuleId } from './resolve-company-math';
import {
  getSystemLibraryEntry,
  SYSTEM_LIBRARY_REGISTRY,
  type SystemLibraryRegistryEntry,
} from './system-library-registry';

export type EnsureSystemLibraryOpts = {
  /** When true, re-upsert placeholder bodies even when the shelf has members. */
  refreshPlaceholders?: boolean;
};

function assertLeakClean(body: string): void {
  const lint = leakLint(body, []);
  if (!lint.ok) {
    throw new Error(
      `system library concept body failed leakLint: ${lint.leaks.map((l) => l.path).join(', ')}`,
    );
  }
}

function resolveOwnerModuleId(companyModules: Array<{ id: string; type: string }>): string | null {
  const research = companyModules.find((m) => m.type === 'research');
  if (research) return research.id;
  const librarian = companyModules.find((m) => m.type === 'librarian');
  if (librarian) return librarian.id;
  const library = companyModules.find((m) => m.type === 'library');
  if (library) return library.id;
  return resolveCompanyMathModuleId(companyModules);
}

async function ensureLibraryRow(
  db: Db,
  companyId: string,
  entry: SystemLibraryRegistryEntry,
): Promise<string> {
  await db
    .insert(libraries)
    .values({
      companyId,
      moduleId: null,
      name: entry.name,
      topicScope: entry.topicScope,
      masterLibrary: false,
      status: 'active',
    })
    .onConflictDoNothing({ target: [libraries.companyId, libraries.name] });

  const [row] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.name, entry.name)))
    .limit(1);

  if (!row) {
    throw new Error(`system_library_missing:${entry.topicScope}`);
  }

  return row.id;
}

async function seedPlaceholders(
  db: Db,
  companyId: string,
  libraryId: string,
  entry: SystemLibraryRegistryEntry,
  ownerModuleId: string,
  now: Date,
): Promise<void> {
  const seededTitles: string[] = [];

  for (const seed of entry.placeholderSeeds) {
    assertLeakClean(seed.body);

    await db
      .insert(concepts)
      .values({
        companyId,
        moduleId: ownerModuleId,
        title: seed.title,
        body: seed.body,
        tags: [...entry.kindTags],
        sourceClass: 'deterministic_placeholder',
        sourceRef: seed.sourceRef,
        status: 'active',
        primaryLibraryId: libraryId,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body: seed.body,
          tags: [...entry.kindTags],
          sourceClass: 'deterministic_placeholder',
          sourceRef: seed.sourceRef,
          primaryLibraryId: libraryId,
          status: 'active',
          updatedAt: now,
        },
      });

    seededTitles.push(seed.title);
  }

  const conceptRows = await db
    .select({ id: concepts.id, title: concepts.title })
    .from(concepts)
    .where(and(eq(concepts.moduleId, ownerModuleId), inArray(concepts.title, seededTitles)));

  for (const row of conceptRows) {
    await db
      .insert(libraryConcepts)
      .values({
        libraryId,
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
}

/**
 * Idempotent company-scoped system library folder from {@link SYSTEM_LIBRARY_REGISTRY}.
 */
export async function ensureSystemLibrary(
  db: Db,
  companyId: string,
  topicScope: SystemTopicScope,
  now: Date,
  opts?: EnsureSystemLibraryOpts,
): Promise<string> {
  const entry = getSystemLibraryEntry(topicScope);
  if (!entry) {
    throw new Error(`unknown_system_topic_scope:${topicScope}`);
  }

  const libraryId = await ensureLibraryRow(db, companyId, entry);

  const existingMembers = await db
    .select({ conceptId: libraryConcepts.conceptId })
    .from(libraryConcepts)
    .where(eq(libraryConcepts.libraryId, libraryId));

  const isEmpty = existingMembers.length === 0;
  const shouldSeed = isEmpty || opts?.refreshPlaceholders === true;
  if (!shouldSeed) {
    return libraryId;
  }

  const companyModules = await db
    .select({
      id: modules.id,
      type: modules.type,
      engineInstanceId: modules.engineInstanceId,
      toolOwnerModuleId: modules.toolOwnerModuleId,
      config: modules.config,
    })
    .from(modules)
    .where(eq(modules.companyId, companyId));

  const ownerModuleId = resolveOwnerModuleId(companyModules);
  if (!ownerModuleId) {
    return libraryId;
  }

  await seedPlaceholders(db, companyId, libraryId, entry, ownerModuleId, now);
  return libraryId;
}

/** Ensure all six system-curated library folders for a company. */
export async function ensureAllSystemLibraries(
  db: Db,
  companyId: string,
  now: Date,
  opts?: EnsureSystemLibraryOpts,
): Promise<string[]> {
  const libraryIds: string[] = [];
  for (const entry of SYSTEM_LIBRARY_REGISTRY) {
    const id = await ensureSystemLibrary(db, companyId, entry.topicScope, now, opts);
    libraryIds.push(id);
  }
  return libraryIds;
}
