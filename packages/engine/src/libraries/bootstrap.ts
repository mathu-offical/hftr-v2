import { and, eq, ilike, inArray } from 'drizzle-orm';
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

const MECHANISMS_LIBRARY_NAME = 'Seeded trading mechanisms';
const SEEDED_TOPIC_TITLE = 'Seeded trading mechanisms';

/** Catalog families materialized into the compile-time mechanisms library. */
export const SEED_CATALOG_NAMES = [
  'strategy_families',
  'guardrail_packages',
  'session_constraints',
  'broker_policy_envelopes',
  'trend_lead_patterns',
] as const;

/**
 * Representative pairs kept for link coverage in tests and curated edges.
 * Full bootstrap seeds every row in {@link SEED_CATALOG_NAMES}.
 */
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
  payload?: unknown;
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

function humanize(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

/** Drop strings that would fail leak lint (raw digits / clock patterns). */
function isLeakSafeText(value: string): boolean {
  return leakLint(value, []).ok;
}

/** Operator-facing label; strips digit runs when needed so bodies stay leak-clean. */
function leakSafeLabel(value: string): string {
  const human = humanize(value);
  if (isLeakSafeText(human)) return human;
  const stripped = human.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > 0 ? stripped : 'catalog mechanism';
}

function asStringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = leakSafeLabel(item);
    if (!text || !isLeakSafeText(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function pushSection(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) return;
  lines.push('', `## ${heading}`, ...items.map((item) => `- ${item}`));
}

/**
 * Build operator-readable concept body from vendored catalog payload fields.
 * Qualitative only — no raw financial numbers or clock literals (leak-lint clean).
 */
export function buildSeededConceptBody(entry: SeededCatalogEntry): string {
  const payload =
    entry.payload && typeof entry.payload === 'object' && !Array.isArray(entry.payload)
      ? (entry.payload as Record<string, unknown>)
      : {};

  const titleLabel = leakSafeLabel(entry.title);
  const catalogLabel = leakSafeLabel(entry.catalog);
  const lines: string[] = [`# ${titleLabel}`, '', `Seeded from the ${catalogLabel} catalog.`];

  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  if (summary && isLeakSafeText(summary)) {
    lines.push('', summary);
  }

  const mechanismClass =
    typeof payload.class === 'string'
      ? payload.class
      : typeof payload.assetClass === 'string'
        ? payload.assetClass
        : null;
  if (mechanismClass && isLeakSafeText(leakSafeLabel(mechanismClass))) {
    lines.push('', `Mechanism class: ${leakSafeLabel(mechanismClass)}.`);
  }

  if (entry.tier && isLeakSafeText(leakSafeLabel(entry.tier))) {
    lines.push(`Activation tier: ${leakSafeLabel(entry.tier)}.`);
  }

  const horizon = typeof payload.horizon === 'string' ? leakSafeLabel(payload.horizon) : '';
  if (horizon && isLeakSafeText(horizon)) {
    lines.push(`Horizon: ${horizon}.`);
  }

  pushSection(lines, 'Sessions', asStringList(payload.sessions));
  pushSection(lines, 'Regime tags', asStringList(payload.regimeTags));
  pushSection(lines, 'Primary triggers', asStringList(payload.primaryTriggers));
  pushSection(lines, 'Failure codes', asStringList(payload.failureCodes));
  pushSection(lines, 'Recovery ladder', asStringList(payload.recoveryLadder));
  pushSection(lines, 'Bound strategies', asStringList(payload.boundStrategies));
  pushSection(lines, 'Inputs', asStringList(payload.inputs));
  pushSection(lines, 'Confirmation signals', asStringList(payload.confirmationSignals));
  pushSection(lines, 'Suppress when', asStringList(payload.suppressWhen));
  pushSection(lines, 'Preferred families', asStringList(payload.preferredFamilies));
  pushSection(lines, 'Routing scope', asStringList(payload.routingScope));
  pushSection(lines, 'Order workflows', asStringList(payload.orderWorkflowCompatibility));
  pushSection(lines, 'Modes', asStringList(payload.modes));
  pushSection(lines, 'Failure handling', asStringList(payload.failureHandling));
  pushSection(lines, 'Platform guardrails', asStringList(payload.platformGuardrails));
  pushSection(lines, 'Special rules', asStringList(payload.specialRules, 5));
  pushSection(lines, 'Verification signals', asStringList(payload.verificationSignals));
  pushSection(lines, 'Operator visibility', asStringList(payload.operatorVisibility));

  const handoff =
    payload.trendLeadBindings &&
    typeof payload.trendLeadBindings === 'object' &&
    !Array.isArray(payload.trendLeadBindings)
      ? (payload.trendLeadBindings as Record<string, unknown>).handoffExpectation
      : null;
  if (typeof handoff === 'string' && isLeakSafeText(handoff)) {
    lines.push('', '## Handoff expectation', handoff);
  }

  const outcome =
    typeof payload.deterministicOutcome === 'string'
      ? leakSafeLabel(payload.deterministicOutcome)
      : '';
  if (outcome && isLeakSafeText(outcome)) {
    lines.push('', `Deterministic outcome: ${outcome}.`);
  }

  const body = lines.join('\n').trim();
  assertLeakClean(body);
  return body;
}

function buildTopicSynopsisMd(conceptTitles: string[]): string {
  const lines = [
    '## Seeded trading mechanisms',
    '',
    'Compile-time baseline of stock trading mechanisms from vendored catalogs.',
    'Each member is a readable catalog concept (strategies, guardrails, sessions, broker policy, trend leads) admitted into the company knowledge graph.',
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
          and(
            eq(libraries.companyId, opts.companyId),
            eq(libraries.name, MECHANISMS_LIBRARY_NAME),
          ),
        )
        .limit(1);
      if (mechLib) {
        return { librariesEnsured: 0, conceptsUpserted: 0, topicId: null };
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

  await ensureMasterLibrary(
    opts.db,
    opts.companyId,
    libraryModules,
    mechanismsLibraryId,
    now,
  );

  const ownerModuleId = resolveOwnerModuleId(companyModules);
  if (!ownerModuleId) {
    return { librariesEnsured, conceptsUpserted: 0, topicId: null };
  }

  const catalogRows = await opts.db
    .select()
    .from(catalogEntries)
    .where(inArray(catalogEntries.catalog, [...SEED_CATALOG_NAMES]))
    .orderBy(catalogEntries.catalog, catalogEntries.entryKey);

  const seededTitles: string[] = [];
  let conceptsUpserted = 0;

  for (const entry of catalogRows) {
    const tags = [entry.catalog, entry.tier].filter((t): t is string => Boolean(t));
    const body = buildSeededConceptBody({
      catalog: entry.catalog,
      entryKey: entry.entryKey,
      title: entry.title,
      tier: entry.tier,
      payload: entry.payload,
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
        sourceClass: 'catalog_seed',
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
