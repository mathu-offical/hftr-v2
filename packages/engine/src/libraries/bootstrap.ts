import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import type { Db } from '@hftr/db';
import {
  catalogEntries,
  conceptLinks,
  concepts,
  libraries,
  libraryConcepts,
  modules,
  researchTopics,
  topicConcepts,
} from '@hftr/db/schema';
import { leakLint } from '../calc/leak-lint';

const MASTER_FALLBACK_NAME = 'Company knowledge graph';
const SEEDED_TOPIC_TITLE = 'Seeded trading mechanisms';

/** Catalog pairs seeded into company knowledge on bootstrap (compile-time mechanisms). */
export const SEED_CATALOG_TARGETS = [
  { catalog: 'strategy_families', entryKey: 'strat-001' },
  { catalog: 'strategy_families', entryKey: 'strat-003' },
  { catalog: 'strategy_families', entryKey: 'strat-004' },
  { catalog: 'strategy_families', entryKey: 'strat-006' },
  { catalog: 'guardrail_packages', entryKey: 'grd-001' },
  { catalog: 'guardrail_packages', entryKey: 'grd-003' },
  { catalog: 'guardrail_packages', entryKey: 'grd-007' },
  { catalog: 'session_constraints', entryKey: 'sess-001' },
  { catalog: 'broker_policy_envelopes', entryKey: 'bpe-001' },
  { catalog: 'trend_lead_patterns', entryKey: 'lead-001' },
  { catalog: 'trend_lead_patterns', entryKey: 'lead-002' },
  { catalog: 'trend_lead_patterns', entryKey: 'lead-003' },
] as const;

export type SeededCatalogEntry = {
  catalog: string;
  entryKey: string;
  title: string;
  tier: string | null;
};

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

function assertLeakClean(body: string): void {
  const lint = leakLint(body, []);
  if (!lint.ok) {
    throw new Error(
      `bootstrap concept body failed leakLint: ${lint.leaks.map((l) => l.path).join(', ')}`,
    );
  }
}

/** Build qualitative, leak-lint-safe concept body for a seeded catalog entry. */
export function buildSeededConceptBody(entry: SeededCatalogEntry): string {
  const catalogLabel = entry.catalog.replace(/_/g, ' ');
  const titleLabel = entry.title.replace(/_/g, ' ');
  const tierPhrase = entry.tier
    ? ` Activation tier is described qualitatively as ${entry.tier.replace(/_/g, ' ')}.`
    : '';

  const body =
    `Deterministic catalog concept from the ${catalogLabel} catalog covering ${titleLabel}. ` +
    'This placeholder summarizes a seeded compile-time mechanism for galaxy visibility — ' +
    'not model-generated research. Full authoritative details live in the cited catalog source reference.' +
    tierPhrase;

  assertLeakClean(body);
  return body;
}

function buildTopicSynopsisMd(conceptTitles: string[]): string {
  const lines = [
    '## Seeded trading mechanisms',
    '',
    'Compile-time catalog mechanisms surfaced into the company knowledge graph for operator orientation.',
    'Member concepts are deterministic placeholders linked to vendored catalog entries.',
    '',
    '### Member concepts',
    '',
    ...conceptTitles.map((title) => `- [[${title}]]`),
  ];
  const synopsisMd = lines.join('\n');
  assertLeakClean(synopsisMd);
  return synopsisMd;
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
    await db
      .update(libraries)
      .set({ moduleId, updatedAt: now })
      .where(eq(libraries.id, row.id));
  }
}

async function ensureMasterLibrary(
  db: Db,
  companyId: string,
  libraryModules: Array<{ id: string; config: unknown }>,
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
    const [bound] = await db
      .select({ id: libraries.id })
      .from(libraries)
      .where(and(eq(libraries.companyId, companyId), eq(libraries.moduleId, seededModule.id)))
      .limit(1);
    if (bound) {
      await db
        .update(libraries)
        .set({ masterLibrary: true, updatedAt: now })
        .where(eq(libraries.id, bound.id));
      return;
    }
  }

  const [firstLib] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.companyId, companyId))
    .orderBy(libraries.createdAt)
    .limit(1);

  if (firstLib) {
    await db
      .update(libraries)
      .set({ masterLibrary: true, updatedAt: now })
      .where(eq(libraries.id, firstLib.id));
    return;
  }

  await db.insert(libraries).values({
    companyId,
    moduleId: null,
    name: MASTER_FALLBACK_NAME,
    topicScope: '',
    masterLibrary: true,
    status: 'active',
  });
}

async function resolveMechanismsLibraryId(
  db: Db,
  companyId: string,
  libraryModules: Array<{ id: string; config: unknown }>,
): Promise<string | null> {
  const seededModule = libraryModules.find(
    (m) => parseLibraryConfig(m.config).libraryClass === 'seeded_mechanisms',
  );
  if (seededModule) {
    const [bound] = await db
      .select({ id: libraries.id })
      .from(libraries)
      .where(and(eq(libraries.companyId, companyId), eq(libraries.moduleId, seededModule.id)))
      .limit(1);
    if (bound) return bound.id;
  }

  const [mechanismNamed] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), ilike(libraries.name, '%mechanism%')))
    .limit(1);
  if (mechanismNamed) return mechanismNamed.id;

  const [master] = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.masterLibrary, true)))
    .limit(1);
  return master?.id ?? null;
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
  // Every company has a Math module (D-008); use it when no research/library module exists yet.
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
}): Promise<{ librariesEnsured: number; conceptsUpserted: number; topicId: string | null }> {
  const now = opts.now ?? new Date();

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

  await ensureMasterLibrary(opts.db, opts.companyId, libraryModules, now);

  const mechanismsLibraryId = await resolveMechanismsLibraryId(
    opts.db,
    opts.companyId,
    libraryModules,
  );
  if (!mechanismsLibraryId) {
    return { librariesEnsured, conceptsUpserted: 0, topicId: null };
  }

  const ownerModuleId = resolveOwnerModuleId(companyModules);
  if (!ownerModuleId) {
    return { librariesEnsured, conceptsUpserted: 0, topicId: null };
  }

  const catalogRows = await opts.db
    .select()
    .from(catalogEntries)
    .where(
      or(
        ...SEED_CATALOG_TARGETS.map((t) =>
          and(eq(catalogEntries.catalog, t.catalog), eq(catalogEntries.entryKey, t.entryKey)),
        ),
      ),
    );

  const catalogByKey = new Map(
    catalogRows.map((row) => [`${row.catalog}/${row.entryKey}`, row] as const),
  );

  const seededTitles: string[] = [];
  let conceptsUpserted = 0;

  for (const target of SEED_CATALOG_TARGETS) {
    const entry = catalogByKey.get(`${target.catalog}/${target.entryKey}`);
    if (!entry) continue;

    const tags = [entry.catalog, entry.tier].filter((t): t is string => Boolean(t));
    const body = buildSeededConceptBody({
      catalog: entry.catalog,
      entryKey: entry.entryKey,
      title: entry.title,
      tier: entry.tier,
    });
    const sourceRef = `${entry.catalog}/${entry.entryKey}`;

    await opts.db
      .insert(concepts)
      .values({
        companyId: opts.companyId,
        moduleId: ownerModuleId,
        title: entry.title,
        body,
        tags,
        sourceClass: 'deterministic_placeholder',
        sourceRef,
        status: 'active',
        primaryLibraryId: mechanismsLibraryId,
      })
      .onConflictDoUpdate({
        target: [concepts.moduleId, concepts.title],
        set: {
          body,
          tags,
          sourceRef,
          primaryLibraryId: mechanismsLibraryId,
          status: 'active',
          updatedAt: now,
        },
      });

    seededTitles.push(entry.title);
    conceptsUpserted += 1;
  }

  if (seededTitles.length === 0) {
    return { librariesEnsured, conceptsUpserted: 0, topicId: null };
  }

  const conceptRows = await opts.db
    .select({ id: concepts.id, title: concepts.title })
    .from(concepts)
    .where(
      and(eq(concepts.moduleId, ownerModuleId), inArray(concepts.title, seededTitles)),
    );

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
        sourceClass: 'deterministic_placeholder',
      })
      .onConflictDoNothing({
        target: [conceptLinks.fromConceptId, conceptLinks.toConceptId, conceptLinks.relation],
      });
  }

  const ownerModule = companyModules.find((m) => m.id === ownerModuleId);
  if (ownerModule?.type !== 'research') {
    return { librariesEnsured, conceptsUpserted, topicId: null };
  }

  const synopsisMd = buildTopicSynopsisMd(seededTitles);

  const [existingTopic] = await opts.db
    .select({ id: researchTopics.id })
    .from(researchTopics)
    .where(
      and(
        eq(researchTopics.companyId, opts.companyId),
        eq(researchTopics.moduleId, ownerModuleId),
        eq(researchTopics.title, SEEDED_TOPIC_TITLE),
      ),
    )
    .limit(1);

  let topicId: string;
  if (existingTopic) {
    topicId = existingTopic.id;
    await opts.db
      .update(researchTopics)
      .set({ synopsisMd, status: 'active', updatedAt: now })
      .where(eq(researchTopics.id, topicId));
  } else {
    const [inserted] = await opts.db
      .insert(researchTopics)
      .values({
        companyId: opts.companyId,
        moduleId: ownerModuleId,
        title: SEEDED_TOPIC_TITLE,
        synopsisMd,
        status: 'active',
        provenance: 'deterministic_bootstrap',
      })
      .returning({ id: researchTopics.id });
    topicId = inserted!.id;
  }

  await opts.db.delete(topicConcepts).where(eq(topicConcepts.topicId, topicId));

  for (let sortOrder = 0; sortOrder < conceptIds.length; sortOrder += 1) {
    const conceptId = conceptIds[sortOrder]!;
    await opts.db.insert(topicConcepts).values({
      topicId,
      conceptId,
      sortOrder,
      role: null,
    });
  }

  return { librariesEnsured, conceptsUpserted, topicId };
}
