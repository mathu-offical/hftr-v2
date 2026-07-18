import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import { concepts, libraries, libraryConcepts, modules } from '@hftr/db/schema';
import { leakLint } from '../calc/leak-lint';

export const MOVERS_LIBRARY_NAME = 'Daily movers watch';
export const MOVERS_TOPIC_SCOPE = 'system:movers';

const MOVERS_TAGS = ['system_curated', 'movers', 'daily'] as const;

export const MOVERS_PLACEHOLDER_SEEDS = [
  {
    title: 'relative_strength_leaders',
    sourceRef: 'system:movers/relative_strength_leaders',
    body: [
      '# Relative strength leaders',
      '',
      'Names showing unusual relative strength versus the broad market deserve a dedicated watch slot.',
      'Track leadership persistence, breadth of participation, and whether strength is isolated or thematic.',
      'Use this lens before promoting a mover into tactical research or trend nomination.',
    ].join('\n'),
  },
  {
    title: 'volume_expansion_watch',
    sourceRef: 'system:movers/volume_expansion_watch',
    body: [
      '# Volume expansion watch',
      '',
      'Participation expansion often precedes durable mover status when it aligns with a clear catalyst narrative.',
      'Contrast organic accumulation against one-off headline spikes; defer admission when liquidity is thin.',
      'Pair with session legality and broker policy envelopes before any downstream compile interest.',
    ].join('\n'),
  },
  {
    title: 'sector_rotation_signal',
    sourceRef: 'system:movers/sector_rotation_signal',
    body: [
      '# Sector rotation signal',
      '',
      'Leadership shifts across sectors can re-rank daily movers without a single-name story dominating.',
      'Note whether rotation is defensive, cyclical, or event-driven before linking concepts across libraries.',
      'Rotation context helps librarians sanity-check sympathy plays against the active sector tape.',
    ].join('\n'),
  },
] as const;

function assertLeakClean(body: string): void {
  const lint = leakLint(body, []);
  if (!lint.ok) {
    throw new Error(
      `system movers concept body failed leakLint: ${lint.leaks.map((l) => l.path).join(', ')}`,
    );
  }
}

for (const seed of MOVERS_PLACEHOLDER_SEEDS) {
  assertLeakClean(seed.body);
}

function resolveOwnerModuleId(
  companyModules: Array<{ id: string; type: string }>,
): string | null {
  const research = companyModules.find((m) => m.type === 'research');
  if (research) return research.id;
  const librarian = companyModules.find((m) => m.type === 'librarian');
  if (librarian) return librarian.id;
  const library = companyModules.find((m) => m.type === 'library');
  if (library) return library.id;
  const math = companyModules.find((m) => m.type === 'math');
  return math?.id ?? null;
}

async function ensureMoversLibraryRow(
  db: Db,
  companyId: string,
): Promise<string> {
  await db
    .insert(libraries)
    .values({
      companyId,
      moduleId: null,
      name: MOVERS_LIBRARY_NAME,
      topicScope: MOVERS_TOPIC_SCOPE,
      masterLibrary: false,
      status: 'active',
    })
    .onConflictDoNothing({ target: [libraries.companyId, libraries.name] });

  const [row] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.name, MOVERS_LIBRARY_NAME)))
    .limit(1);

  if (!row) {
    throw new Error('system_movers_library_missing');
  }

  return row.id;
}

export type EnsureSystemMoversLibraryOpts = {
  /** When true, re-upsert placeholder bodies (v1 cadence handler path). */
  refreshPlaceholders?: boolean;
};

/**
 * Idempotent company-scoped system:movers library. Seeds qualitative placeholder
 * concepts when the shelf is empty; optional refresh updates placeholder bodies.
 */
export async function ensureSystemMoversLibrary(
  db: Db,
  companyId: string,
  now: Date,
  opts?: EnsureSystemMoversLibraryOpts,
): Promise<string> {
  const libraryId = await ensureMoversLibraryRow(db, companyId);

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
    .select({ id: modules.id, type: modules.type })
    .from(modules)
    .where(eq(modules.companyId, companyId));

  const ownerModuleId = resolveOwnerModuleId(companyModules);
  if (!ownerModuleId) {
    return libraryId;
  }

  const seededTitles: string[] = [];

  for (const seed of MOVERS_PLACEHOLDER_SEEDS) {
    assertLeakClean(seed.body);

    await db
      .insert(concepts)
      .values({
        companyId,
        moduleId: ownerModuleId,
        title: seed.title,
        body: seed.body,
        tags: [...MOVERS_TAGS],
        sourceClass: 'deterministic_placeholder',
        sourceRef: seed.sourceRef,
        status: 'active',
        primaryLibraryId: libraryId,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body: seed.body,
          tags: [...MOVERS_TAGS],
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

  return libraryId;
}
