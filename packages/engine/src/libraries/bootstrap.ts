import { and, eq, ilike, inArray } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  catalogEntries,
  conceptLinks,
  concepts,
  libraries,
  libraryConcepts,
  modules,
} from '@hftr/db/schema';
import { createFixedClock } from '../clock';
import { ensureSystemLibrarySchedule } from '../schedules/materialize';
import { ensureAllSystemLibraries } from './ensure-system-library';
import { ensureSectorKnowledge } from './ensure-sector-knowledge';
import { SYSTEM_LIBRARY_REGISTRY } from './system-library-registry';
import {
  buildSeededConceptBody,
  collectSeededConceptTags,
  type SeededCatalogEntry,
} from './seeded-concept-body';
import {
  ensureSeededResearchTopics,
  type ConceptSeedRow,
} from './seeded-topics';

export {
  buildSeededConceptBody,
  buildSeededTopicSynopsisMd,
  collectSeededConceptTags,
  type SeededCatalogEntry,
} from './seeded-concept-body';

export {
  SEEDED_TOPIC_PROGRAM_TITLE,
  SEEDED_TOPIC_SPECS,
  SEEDED_TOPIC_TITLE,
  SEEDED_TOPIC_TITLES,
  isSeededTopicTitle,
  ensureSeededResearchTopics,
  buildSeededDirectiveSynopsisMd,
} from './seeded-topics';

const MECHANISMS_LIBRARY_NAME = 'Seeded trading mechanisms';

/** Catalog families materialized into the compile-time mechanisms library. */
export const SEED_CATALOG_NAMES = [
  'strategy_families',
  'compound_strategies',
  'recovery_ladders',
  'guardrail_packages',
  'session_constraints',
  'broker_policy_envelopes',
  'trend_lead_patterns',
  'compliance_packages',
  'event_archetypes',
  'macro_triggers',
  'sector_seeds',
] as const;

function catalogClassFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  if (typeof row.class === 'string' && row.class.trim()) return row.class;
  if (typeof row.sector === 'string' && row.sector.trim()) return row.sector;
  return null;
}

async function loadCatalogMeta(db: Db): Promise<{
  tierBySourceRef: Map<string, string | null>;
  classBySourceRef: Map<string, string | null>;
}> {
  const rows = await db
    .select({
      catalog: catalogEntries.catalog,
      entryKey: catalogEntries.entryKey,
      tier: catalogEntries.tier,
      payload: catalogEntries.payload,
    })
    .from(catalogEntries)
    .where(inArray(catalogEntries.catalog, [...SEED_CATALOG_NAMES]));
  const tierBySourceRef = new Map<string, string | null>();
  const classBySourceRef = new Map<string, string | null>();
  for (const row of rows) {
    const ref = `${row.catalog}/${row.entryKey}`;
    tierBySourceRef.set(ref, row.tier);
    classBySourceRef.set(ref, catalogClassFromPayload(row.payload));
  }
  return { tierBySourceRef, classBySourceRef };
}

async function syncSeededTopicsForResearchModule(opts: {
  db: Db;
  companyId: string;
  researchModuleId: string;
  now: Date;
}): Promise<string | null> {
  const conceptRows: ConceptSeedRow[] = await opts.db
    .select({
      id: concepts.id,
      title: concepts.title,
      sourceRef: concepts.sourceRef,
    })
    .from(concepts)
    .where(
      and(
        eq(concepts.companyId, opts.companyId),
        eq(concepts.sourceClass, 'catalog_seed'),
        eq(concepts.status, 'active'),
      ),
    );
  const { tierBySourceRef, classBySourceRef } = await loadCatalogMeta(opts.db);
  const result = await ensureSeededResearchTopics({
    db: opts.db,
    companyId: opts.companyId,
    researchModuleId: opts.researchModuleId,
    now: opts.now,
    conceptRows,
    tierBySourceRef,
    classBySourceRef,
  });
  return result.programTopicId;
}

/**
 * Refresh catalog_seed concept bodies/tags from current builders (D-079 / D-080 / D-081).
 * Also upserts any missing catalog families so expanded SEED_CATALOG_NAMES backfill.
 */
async function rematerializeCatalogSeedBodies(
  db: Db,
  companyId: string,
  now: Date,
  opts?: { ownerModuleId?: string; mechanismsLibraryId?: string },
): Promise<number> {
  const catalogRows = await db
    .select()
    .from(catalogEntries)
    .where(inArray(catalogEntries.catalog, [...SEED_CATALOG_NAMES]))
    .orderBy(catalogEntries.catalog, catalogEntries.entryKey);

  const existingSeeds = await db
    .select({
      id: concepts.id,
      body: concepts.body,
      sourceRef: concepts.sourceRef,
      moduleId: concepts.moduleId,
    })
    .from(concepts)
    .where(and(eq(concepts.companyId, companyId), eq(concepts.sourceClass, 'catalog_seed')));

  const byRef = new Map(
    existingSeeds
      .filter((row): row is typeof row & { sourceRef: string } => Boolean(row.sourceRef))
      .map((row) => [row.sourceRef, row] as const),
  );

  let ownerModuleId = opts?.ownerModuleId ?? null;
  let mechanismsLibraryId = opts?.mechanismsLibraryId ?? null;
  if (!ownerModuleId || !mechanismsLibraryId) {
    const companyModules = await db
      .select({ id: modules.id, type: modules.type, name: modules.name, config: modules.config })
      .from(modules)
      .where(eq(modules.companyId, companyId));
    ownerModuleId = ownerModuleId ?? resolveOwnerModuleId(companyModules);
    if (!mechanismsLibraryId) {
      const [mech] = await db
        .select({ id: libraries.id })
        .from(libraries)
        .where(and(eq(libraries.companyId, companyId), eq(libraries.name, MECHANISMS_LIBRARY_NAME)))
        .limit(1);
      mechanismsLibraryId = mech?.id ?? null;
    }
  }
  if (!ownerModuleId || !mechanismsLibraryId) return 0;

  let updated = 0;
  for (const entry of catalogRows) {
    const sourceRef = `${entry.catalog}/${entry.entryKey}`;
    const existing = byRef.get(sourceRef);
    const bodyEntry: SeededCatalogEntry = {
      catalog: entry.catalog,
      entryKey: entry.entryKey,
      title: entry.title,
      tier: entry.tier,
      payload: entry.payload,
    };
    const tags = collectSeededConceptTags(bodyEntry);
    const body = buildSeededConceptBody(bodyEntry);

    if (
      existing &&
      existing.body.includes('## Overview') &&
      existing.body.includes('| Field |') &&
      existing.body.includes('[[sys:')
    ) {
      continue;
    }

    await db
      .insert(concepts)
      .values({
        companyId,
        moduleId: ownerModuleId,
        title: entry.title,
        body,
        tags,
        sourceClass: 'catalog_seed',
        sourceRef,
        status: 'active',
        primaryLibraryId: mechanismsLibraryId,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body,
          tags,
          sourceClass: 'catalog_seed',
          sourceRef,
          primaryLibraryId: mechanismsLibraryId,
          status: 'active',
          updatedAt: now,
        },
      });

    const [row] = await db
      .select({ id: concepts.id })
      .from(concepts)
      .where(and(eq(concepts.moduleId, ownerModuleId), eq(concepts.title, entry.title)))
      .limit(1);
    if (row) {
      await db
        .insert(libraryConcepts)
        .values({
          libraryId: mechanismsLibraryId,
          conceptId: row.id,
          curationStatus: 'auto_admitted',
        })
        .onConflictDoUpdate({
          target: [libraryConcepts.libraryId, libraryConcepts.conceptId],
          set: { curationStatus: 'auto_admitted', updatedAt: now },
        });
    }
    updated += 1;
  }

  return updated;
}

/**
 * Representative pairs kept for link coverage in tests and curated edges.
 * Full bootstrap seeds every row in {@link SEED_CATALOG_NAMES}.
 */
export const SEED_CATALOG_TARGETS = [
  { catalog: 'strategy_families', entryKey: 'strat-001' },
  { catalog: 'strategy_families', entryKey: 'strat-003' },
  { catalog: 'strategy_families', entryKey: 'strat-004' },
  { catalog: 'strategy_families', entryKey: 'strat-006' },
  { catalog: 'compound_strategies', entryKey: 'comp-001' },
  { catalog: 'recovery_ladders', entryKey: 'rec-001' },
  { catalog: 'guardrail_packages', entryKey: 'grd-001' },
  { catalog: 'guardrail_packages', entryKey: 'grd-003' },
  { catalog: 'guardrail_packages', entryKey: 'grd-007' },
  { catalog: 'session_constraints', entryKey: 'sess-001' },
  { catalog: 'broker_policy_envelopes', entryKey: 'bpe-001' },
  { catalog: 'trend_lead_patterns', entryKey: 'lead-001' },
  { catalog: 'trend_lead_patterns', entryKey: 'lead-002' },
  { catalog: 'trend_lead_patterns', entryKey: 'lead-003' },
  { catalog: 'compliance_packages', entryKey: 'cmp-001' },
  { catalog: 'event_archetypes', entryKey: 'evt-001' },
  { catalog: 'macro_triggers', entryKey: 'macro-001' },
  { catalog: 'sector_seeds', entryKey: 'sec-001' },
] as const;

const SEED_CONCEPT_LINKS: ReadonlyArray<{
  fromTitle: string;
  toTitle: string;
  relation: 'supports' | 'derived_from';
}> = [
  {
    fromTitle: 'sector_leader_to_sympathy',
    toTitle: 'opening_range_breakout',
    relation: 'supports',
  },
  {
    fromTitle: 'catalyst_cluster_readthrough',
    toTitle: 'pullback_continuation',
    relation: 'supports',
  },
  {
    fromTitle: 'event_conflict_blackout',
    toTitle: 'macro_shock_blackout_then_reentry',
    relation: 'supports',
  },
  {
    fromTitle: 'session_legality_defer',
    toTitle: 'regular_equities',
    relation: 'derived_from',
  },
  {
    fromTitle: 'liquidity_pause_and_defer',
    toTitle: 'paper_balanced_general',
    relation: 'supports',
  },
];

function parseLibraryConfig(raw: unknown): { topicScope: string; libraryClass: string | null } {
  const cfg = raw as Record<string, unknown> | null;
  return {
    topicScope: typeof cfg?.topicScope === 'string' ? cfg.topicScope : '',
    libraryClass: typeof cfg?.libraryClass === 'string' ? cfg.libraryClass : null,
  };
}

async function ensureLibraryForModule(
  db: Db,
  companyId: string,
  moduleId: string,
  name: string,
  topicScope: string,
  now: Date,
): Promise<void> {
  await db
    .insert(libraries)
    .values({
      companyId,
      moduleId,
      name,
      topicScope,
      masterLibrary: false,
      status: 'active',
    })
    .onConflictDoNothing({ target: [libraries.companyId, libraries.name] });

  const [row] = await db
    .select({ id: libraries.id, moduleId: libraries.moduleId })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.name, name)))
    .limit(1);

  if (row && row.moduleId === null) {
    await db.update(libraries).set({ moduleId, updatedAt: now }).where(eq(libraries.id, row.id));
  }
}

async function ensureMechanismsLibrary(
  db: Db,
  companyId: string,
  libraryModules: Array<{ id: string; config: unknown }>,
  now: Date,
): Promise<string> {
  const seededModule = libraryModules.find(
    (m) => parseLibraryConfig(m.config).libraryClass === 'seeded_mechanisms',
  );

  await db
    .insert(libraries)
    .values({
      companyId,
      moduleId: seededModule?.id ?? null,
      name: MECHANISMS_LIBRARY_NAME,
      topicScope: 'compile_time_mechanisms',
      masterLibrary: false,
      status: 'active',
    })
    .onConflictDoNothing({ target: [libraries.companyId, libraries.name] });

  const [row] = await db
    .select({ id: libraries.id, moduleId: libraries.moduleId })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.name, MECHANISMS_LIBRARY_NAME)))
    .limit(1);

  if (!row) {
    throw new Error('mechanisms_library_missing');
  }

  if (seededModule && row.moduleId === null) {
    await db
      .update(libraries)
      .set({ moduleId: seededModule.id, updatedAt: now })
      .where(eq(libraries.id, row.id));
  }

  return row.id;
}

async function ensureMasterLibrary(
  db: Db,
  companyId: string,
  libraryModules: Array<{ id: string; config: unknown }>,
  mechanismsLibraryId: string,
  now: Date,
): Promise<void> {
  const [existingMaster] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.masterLibrary, true)))
    .limit(1);
  if (existingMaster) return;

  const seededModule = libraryModules.find(
    (m) => parseLibraryConfig(m.config).libraryClass === 'seeded_mechanisms',
  );

  if (seededModule) {
    await db
      .update(libraries)
      .set({ masterLibrary: true, updatedAt: now })
      .where(eq(libraries.id, mechanismsLibraryId));
    return;
  }

  await db
    .update(libraries)
    .set({ masterLibrary: true, updatedAt: now })
    .where(eq(libraries.id, mechanismsLibraryId));
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

/**
 * Idempotent company knowledge bootstrap: ensures library rows, seeds catalog
 * concepts into the mechanisms library, links concepts, and creates a hybrid topic page.
 */
export async function bootstrapCompanyKnowledge(opts: {
  db: Db;
  companyId: string;
  now?: Date;
  /** When true, skip work if catalog_seed concepts already exist. Default true. */
  skipIfSeeded?: boolean;
}): Promise<{ librariesEnsured: number; conceptsUpserted: number; topicId: string | null }> {
  const now = opts.now ?? new Date();

  await ensureAllSystemLibraries(opts.db, opts.companyId, now);

  const clock = createFixedClock(now.getTime());
  const dailyPhases = ['pre_open', 'midday', 'close', 'post_analysis'] as const;
  for (const entry of SYSTEM_LIBRARY_REGISTRY) {
    if (!entry.scheduleKind || !entry.cadenceMinutes) continue;
    // D-070: daily summaries get one schedule per session phase (distinct subject keys).
    if (entry.scheduleKind === 'library.system_daily_summaries') {
      for (const phase of dailyPhases) {
        await ensureSystemLibrarySchedule(opts.db, clock, {
          companyId: opts.companyId,
          scheduleName: `system-daily_summaries-${phase}-${opts.companyId}`,
          kind: entry.scheduleKind,
          cadenceMinutes: entry.cadenceMinutes,
          payloadTemplate: {
            companyId: opts.companyId,
            topicScope: entry.topicScope,
            phase,
          },
        });
      }
      continue;
    }
    await ensureSystemLibrarySchedule(opts.db, clock, {
      companyId: opts.companyId,
      scheduleName: `${entry.topicScope.replace(':', '-')}-${opts.companyId}`,
      kind: entry.scheduleKind,
      cadenceMinutes: entry.cadenceMinutes,
      payloadTemplate: { companyId: opts.companyId, topicScope: entry.topicScope },
    });
  }

  if (opts.skipIfSeeded !== false) {
    const [existingSeed] = await opts.db
      .select({ id: concepts.id })
      .from(concepts)
      .where(
        and(
          eq(concepts.companyId, opts.companyId),
          eq(concepts.sourceClass, 'catalog_seed'),
          ilike(concepts.sourceRef, 'strategy_families/%'),
        ),
      )
      .limit(1);
    if (existingSeed) {
      const [mechLib] = await opts.db
        .select({ id: libraries.id })
        .from(libraries)
        .where(
          and(eq(libraries.companyId, opts.companyId), eq(libraries.name, MECHANISMS_LIBRARY_NAME)),
        )
        .limit(1);
      if (mechLib) {
        // Mechanisms already seeded — rematerialize bodies, sync directive topics, sector knowledge.
        const rematerialized = await rematerializeCatalogSeedBodies(opts.db, opts.companyId, now);
        const sector = await ensureSectorKnowledge(opts.db, opts.companyId, now);
        const companyModules = await opts.db
          .select({ id: modules.id, type: modules.type })
          .from(modules)
          .where(eq(modules.companyId, opts.companyId));
        const research = companyModules.find((m) => m.type === 'research');
        let topicId: string | null = null;
        if (research) {
          topicId = await syncSeededTopicsForResearchModule({
            db: opts.db,
            companyId: opts.companyId,
            researchModuleId: research.id,
            now,
          });
        }
        return {
          librariesEnsured: 0,
          conceptsUpserted: rematerialized + sector.conceptsUpserted,
          topicId,
        };
      }
    }
  }

  const companyModules = await opts.db
    .select({ id: modules.id, type: modules.type, name: modules.name, config: modules.config })
    .from(modules)
    .where(eq(modules.companyId, opts.companyId));

  const libraryModules = companyModules.filter((m) => m.type === 'library');
  let librariesEnsured = 0;

  for (const mod of libraryModules) {
    const { topicScope } = parseLibraryConfig(mod.config);
    await ensureLibraryForModule(opts.db, opts.companyId, mod.id, mod.name, topicScope, now);
    librariesEnsured += 1;
  }

  const mechanismsLibraryId = await ensureMechanismsLibrary(
    opts.db,
    opts.companyId,
    libraryModules,
    now,
  );
  librariesEnsured += 1;

  await ensureMasterLibrary(opts.db, opts.companyId, libraryModules, mechanismsLibraryId, now);

  const ownerModuleId = resolveOwnerModuleId(companyModules);
  if (!ownerModuleId) {
    const sector = await ensureSectorKnowledge(opts.db, opts.companyId, now);
    return {
      librariesEnsured,
      conceptsUpserted: sector.conceptsUpserted,
      topicId: null,
    };
  }

  const catalogRows = await opts.db
    .select()
    .from(catalogEntries)
    .where(inArray(catalogEntries.catalog, [...SEED_CATALOG_NAMES]))
    .orderBy(catalogEntries.catalog, catalogEntries.entryKey);

  const seededMembers: Array<{ title: string; catalog: string }> = [];
  let conceptsUpserted = 0;

  for (const entry of catalogRows) {
    const bodyEntry: SeededCatalogEntry = {
      catalog: entry.catalog,
      entryKey: entry.entryKey,
      title: entry.title,
      tier: entry.tier,
      payload: entry.payload,
    };
    const tags = collectSeededConceptTags(bodyEntry);
    const body = buildSeededConceptBody(bodyEntry);
    const sourceRef = `${entry.catalog}/${entry.entryKey}`;

    await opts.db
      .insert(concepts)
      .values({
        companyId: opts.companyId,
        moduleId: ownerModuleId,
        title: entry.title,
        body,
        tags,
        sourceClass: 'catalog_seed',
        sourceRef,
        status: 'active',
        primaryLibraryId: mechanismsLibraryId,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body,
          tags,
          sourceClass: 'catalog_seed',
          sourceRef,
          primaryLibraryId: mechanismsLibraryId,
          status: 'active',
          updatedAt: now,
        },
      });

    seededMembers.push({ title: entry.title, catalog: entry.catalog });
    conceptsUpserted += 1;
  }

  if (seededMembers.length === 0) {
    const sector = await ensureSectorKnowledge(opts.db, opts.companyId, now);
    return {
      librariesEnsured,
      conceptsUpserted: sector.conceptsUpserted,
      topicId: null,
    };
  }

  const seededTitles = seededMembers.map((m) => m.title);
  const conceptRows = await opts.db
    .select({ id: concepts.id, title: concepts.title })
    .from(concepts)
    .where(and(eq(concepts.moduleId, ownerModuleId), inArray(concepts.title, seededTitles)));

  const conceptIdByTitle = new Map(conceptRows.map((r) => [r.title, r.id] as const));
  const conceptIds = seededTitles
    .map((title) => conceptIdByTitle.get(title))
    .filter((id): id is string => Boolean(id));

  for (const conceptId of conceptIds) {
    await opts.db
      .insert(libraryConcepts)
      .values({
        libraryId: mechanismsLibraryId,
        conceptId,
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

  for (const link of SEED_CONCEPT_LINKS) {
    const fromId = conceptIdByTitle.get(link.fromTitle);
    const toId = conceptIdByTitle.get(link.toTitle);
    if (!fromId || !toId) continue;

    await opts.db
      .insert(conceptLinks)
      .values({
        companyId: opts.companyId,
        fromConceptId: fromId,
        toConceptId: toId,
        relation: link.relation,
        weightBand: 'typical',
        sourceClass: 'catalog_seed',
      })
      .onConflictDoNothing({
        target: [conceptLinks.fromConceptId, conceptLinks.toConceptId, conceptLinks.relation],
      });
  }

  const ownerModule = companyModules.find((m) => m.id === ownerModuleId);
  if (ownerModule?.type !== 'research') {
    const sector = await ensureSectorKnowledge(opts.db, opts.companyId, now);
    return {
      librariesEnsured,
      conceptsUpserted: conceptsUpserted + sector.conceptsUpserted,
      topicId: null,
    };
  }

  // Sector knowledge first so sector_seeds concepts exist for the Sector knowledge topic.
  const sector = await ensureSectorKnowledge(opts.db, opts.companyId, now);
  const topicId = await syncSeededTopicsForResearchModule({
    db: opts.db,
    companyId: opts.companyId,
    researchModuleId: ownerModuleId,
    now,
  });

  return {
    librariesEnsured,
    conceptsUpserted: conceptsUpserted + sector.conceptsUpserted,
    topicId,
  };
}
