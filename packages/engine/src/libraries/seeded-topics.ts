/**
 * Seeded research topics are **module-side research points** (D-086 / D-126).
 *
 * They are **not** mirrors of seeded library knowledge (catalog concepts live in the
 * Seeded trading mechanisms library nest). Per-company seeds are:
 *   1. General **current awareness** starters (regime, macro, news/events)
 *   2. **Sector research** points from `companies.sector_focuses`
 *   3. A thin **library overview** topic titled like the nest (D-045 Overview link)
 *
 * Topics organize membership and may spawn gather work — they do not own catalog shelves.
 */

import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { resolveSectorSeedTargetFromLabel } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { researchTopics, topicConcepts } from '@hftr/db/schema';
import { leakLint } from '../calc/leak-lint';

/** Library nest overview title (also the baseline library name). Not a research queue. */
export const SEEDED_TOPIC_PROGRAM_TITLE = 'Seeded trading mechanisms';
/** @deprecated Prefer SEEDED_TOPIC_PROGRAM_TITLE; kept for archive/API compatibility. */
export const SEEDED_TOPIC_TITLE = SEEDED_TOPIC_PROGRAM_TITLE;

/** Company-wide current-awareness program (D-126). */
export const CURRENT_AWARENESS_TOPIC_TITLE = 'Current awareness';

/** Dynamic sector research points from company sector focuses (D-126). */
export const SECTOR_RESEARCH_TOPIC_PREFIX = 'Sector · ';

/**
 * Legacy desk-focus prefix (D-096). Still recognized for archive/protection;
 * bootstrap prunes these in favor of Sector · topics.
 */
export const DESK_FOCUS_TOPIC_PREFIX = 'Desk focus · ';

export type SeededTopicMemberFilter = {
  catalog: string;
  /** When set, only concepts whose catalog tier matches. */
  tier?: string | null;
  /**
   * When set, match payload `class` (most catalogs) or `sector` (sector_seeds)
   * via classBySourceRef.
   */
  class?: string | null;
  /** When set, only these catalog entry keys (suffix of sourceRef). */
  entryKeys?: readonly string[];
};

export type SeededTopicSpec = {
  /** Stable operator-facing title (unique per research module). */
  title: string;
  /** When true, this is a program parent; children nest under it. */
  isProgram?: boolean;
  /** Parent directive title (program or mid-level group). */
  parentTitle?: string;
  /**
   * Optional light membership (e.g. mapped sector_seeds for a focus label).
   * Empty = synopsis-only research point — membership fills from research runs.
   */
  members: SeededTopicMemberFilter[];
  /** Short qualitative directive intent for the synopsis. */
  directive: string;
};

function directiveFor(label: string, intent: string): string {
  return `Research point: ${intent} (${label}). Module-side — seeds gather and awareness; catalog concepts stay library-side.`;
}

/**
 * Static per-company research seeds (awareness + library overview).
 * Catalog class/tier mirrors were removed in D-126 — those live only in the library nest.
 */
export const SEEDED_TOPIC_SPECS: readonly SeededTopicSpec[] = [
  {
    title: SEEDED_TOPIC_PROGRAM_TITLE,
    members: [],
    directive:
      'Library nest overview index for Seeded trading mechanisms. Not a research work queue — open this from Libraries for the catalog shelf. Research points live under Current awareness and Sector · topics.',
  },
  {
    title: CURRENT_AWARENESS_TOPIC_TITLE,
    isProgram: true,
    members: [],
    directive: directiveFor(
      CURRENT_AWARENESS_TOPIC_TITLE,
      'seed general market current awareness for the desk — regime, macro calendar, and news/event readthrough',
    ),
  },
  {
    title: 'Market regime and breadth',
    parentTitle: CURRENT_AWARENESS_TOPIC_TITLE,
    members: [],
    directive: directiveFor(
      'Market regime and breadth',
      'track regime character, sector breadth, and leadership rotation without assuming a trade',
    ),
  },
  {
    title: 'Macro and policy watch',
    parentTitle: CURRENT_AWARENESS_TOPIC_TITLE,
    members: [],
    directive: directiveFor(
      'Macro and policy watch',
      'keep a live watch on macro releases and policy posture that can reprice risk appetite',
    ),
  },
  {
    title: 'News and event readthrough',
    parentTitle: CURRENT_AWARENESS_TOPIC_TITLE,
    members: [],
    directive: directiveFor(
      'News and event readthrough',
      'seed ongoing awareness of news and corporate/event readthrough into names and sectors',
    ),
  },
];

/**
 * One research point per company sector focus (plus optional light sector_seeds membership
 * when the label maps to a vendored sector key). No catalog combination children.
 */
export function buildSectorResearchTopicSpecs(
  sectorFocuses: readonly string[],
): SeededTopicSpec[] {
  const specs: SeededTopicSpec[] = [];
  const seenLabels = new Set<string>();

  for (const raw of sectorFocuses) {
    const label = raw.trim();
    if (!label || seenLabels.has(label)) continue;
    seenLabels.add(label);

    const target = resolveSectorSeedTargetFromLabel(label);
    const title = `${SECTOR_RESEARCH_TOPIC_PREFIX}${label}`;
    specs.push({
      title,
      members: target ? [{ catalog: 'sector_seeds', class: target.sectorKey }] : [],
      directive: directiveFor(
        title,
        `initial sector research for company focus "${label}" — landscape, catalysts, and flow awareness`,
      ),
    });
  }

  return specs;
}

/**
 * @deprecated Prefer `buildSectorResearchTopicSpecs` (D-126). Legacy D-096 name retained
 * for imports; behavior is sector research points (not catalog combination trees).
 */
export function buildDeskFocusTopicSpecs(
  sectorFocuses: readonly string[],
): SeededTopicSpec[] {
  return buildSectorResearchTopicSpecs(sectorFocuses);
}

/** Full seeded topic set for a company (awareness + library overview + sector points). */
export function buildSeededTopicSpecsForCompany(
  sectorFocuses: readonly string[] = [],
): SeededTopicSpec[] {
  return [...SEEDED_TOPIC_SPECS, ...buildSectorResearchTopicSpecs(sectorFocuses)];
}

export const SEEDED_TOPIC_TITLES: ReadonlySet<string> = new Set(
  SEEDED_TOPIC_SPECS.map((s) => s.title),
);

/**
 * Top-level research roots operators should see first (excludes library overview).
 * @deprecated Name kept for D-096 callers; values are awareness roots, not catalog domains.
 */
export const SEEDED_TOPIC_CATALOG_ROOT_TITLES: readonly string[] = SEEDED_TOPIC_SPECS.filter(
  (s) => !s.parentTitle && s.title !== SEEDED_TOPIC_PROGRAM_TITLE,
).map((s) => s.title);

export function isSeededTopicTitle(title: string): boolean {
  return (
    SEEDED_TOPIC_TITLES.has(title) ||
    title.startsWith(SECTOR_RESEARCH_TOPIC_PREFIX) ||
    title.startsWith(DESK_FOCUS_TOPIC_PREFIX)
  );
}

export function protectedSeededTopicTitles(
  sectorFocuses: readonly string[] = [],
): ReadonlySet<string> {
  return new Set(buildSeededTopicSpecsForCompany(sectorFocuses).map((s) => s.title));
}

function assertLeakClean(text: string): void {
  const lint = leakLint(text, []);
  if (!lint.ok) {
    throw new Error(
      `seeded topic synopsis failed leakLint: ${lint.leaks.map((l) => l.path).join(', ')}`,
    );
  }
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

export function buildSeededDirectiveSynopsisMd(opts: {
  title: string;
  directive: string;
  isProgram?: boolean;
  childTitles?: readonly string[];
  memberTitles?: readonly string[];
}): string {
  const isLibraryOverview = opts.title === SEEDED_TOPIC_PROGRAM_TITLE;
  const lines = [
    `# ${opts.title}`,
    '',
    isLibraryOverview
      ? '> Library nest overview (not a research queue). Catalog concepts stay on the Seeded trading mechanisms shelf.'
      : '> Research-module point (module-side). Seeds sector and current awareness — distinct from seeded library knowledge.',
    '',
    opts.directive,
    '',
    '## Scope',
    '',
  ];

  if (isLibraryOverview) {
    lines.push(
      '- Links the Libraries dock Overview control to the catalog nest.',
      '- Does not enqueue research; use Current awareness and Sector · topics for gather work.',
    );
  } else {
    lines.push(
      '- Initial research point for desk awareness / sector focus.',
      '- May spawn gather runs, articles, or specialty libraries during agent work.',
      '- Does not mirror catalog shelves (strategy families, guardrails, etc. stay library-side).',
    );
  }

  if (opts.childTitles && opts.childTitles.length > 0) {
    lines.push('', opts.isProgram ? '## Child research points' : '## Related points', '');
    for (const child of opts.childTitles) {
      lines.push(`- [[${child}]]`);
    }
  }

  if (opts.memberTitles && opts.memberTitles.length > 0) {
    lines.push('', '## Starting concepts', '');
    for (const title of opts.memberTitles) {
      lines.push(`- [[${title}]]`);
    }
  } else if (
    !opts.isProgram &&
    !(opts.childTitles && opts.childTitles.length > 0) &&
    !isLibraryOverview
  ) {
    lines.push(
      '',
      '## Starting concepts',
      '',
      '_Membership fills as research runs admit concepts._',
    );
  }

  const synopsisMd = lines.join('\n');
  assertLeakClean(synopsisMd);
  return synopsisMd;
}

export type ConceptSeedRow = {
  id: string;
  title: string;
  sourceRef: string | null;
  /** From catalog_entries.tier when joined; optional for filter. */
  tier?: string | null;
};

function sourceRefCatalog(sourceRef: string | null): string | null {
  if (!sourceRef) return null;
  const slash = sourceRef.indexOf('/');
  if (slash <= 0) return null;
  return sourceRef.slice(0, slash);
}

function sourceRefEntryKey(sourceRef: string | null): string | null {
  if (!sourceRef) return null;
  const slash = sourceRef.indexOf('/');
  if (slash < 0 || slash === sourceRef.length - 1) return null;
  return sourceRef.slice(slash + 1);
}

export function matchSeededTopicMembers(
  spec: SeededTopicSpec,
  conceptRows: readonly ConceptSeedRow[],
  tierBySourceRef?: ReadonlyMap<string, string | null>,
  classBySourceRef?: ReadonlyMap<string, string | null>,
): ConceptSeedRow[] {
  if (spec.members.length === 0) return [];
  const out: ConceptSeedRow[] = [];
  for (const row of conceptRows) {
    const catalog = sourceRefCatalog(row.sourceRef);
    if (!catalog) continue;
    for (const filter of spec.members) {
      if (filter.catalog !== catalog) continue;
      if (filter.tier !== undefined && filter.tier !== null) {
        const tier =
          row.tier ??
          (row.sourceRef ? (tierBySourceRef?.get(row.sourceRef) ?? null) : null) ??
          null;
        if (tier !== filter.tier) continue;
      }
      if (filter.class !== undefined && filter.class !== null) {
        const cls = row.sourceRef ? (classBySourceRef?.get(row.sourceRef) ?? null) : null;
        if (cls !== filter.class) continue;
      }
      if (filter.entryKeys && filter.entryKeys.length > 0) {
        const key = sourceRefEntryKey(row.sourceRef);
        if (!key || !filter.entryKeys.includes(key)) continue;
      }
      out.push(row);
      break;
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function specDepth(spec: SeededTopicSpec, byTitle: ReadonlyMap<string, SeededTopicSpec>): number {
  let depth = 0;
  let parent = spec.parentTitle;
  const seen = new Set<string>();
  while (parent) {
    if (seen.has(parent)) break;
    seen.add(parent);
    depth += 1;
    parent = byTitle.get(parent)?.parentTitle;
  }
  return depth;
}

function directChildTitles(
  parentTitle: string,
  specs: readonly SeededTopicSpec[],
): string[] {
  return specs.filter((s) => s.parentTitle === parentTitle).map((s) => s.title);
}

/**
 * Upsert the seeded research-topic forest for one research module and rebuild memberships.
 * Awareness + sector points + library overview (D-126). Prunes obsolete catalog-mirror
 * bootstrap topics from D-096.
 */
export async function ensureSeededResearchTopics(opts: {
  db: Db;
  companyId: string;
  researchModuleId: string;
  now: Date;
  /** All catalog_seed concepts for the company (id/title/sourceRef). */
  conceptRows: ConceptSeedRow[];
  /** Map sourceRef → catalog tier. */
  tierBySourceRef: ReadonlyMap<string, string | null>;
  /** Map sourceRef → payload class or sector. */
  classBySourceRef?: ReadonlyMap<string, string | null>;
  /** Company sector focuses (create wizard labels) → Sector · research points. */
  sectorFocuses?: readonly string[];
}): Promise<{ topicIds: string[]; programTopicId: string | null }> {
  const specs = buildSeededTopicSpecsForCompany(opts.sectorFocuses ?? []);
  const byTitle = new Map(specs.map((s) => [s.title, s]));
  const ordered = [...specs].sort(
    (a, b) => specDepth(a, byTitle) - specDepth(b, byTitle) || a.title.localeCompare(b.title),
  );

  const peerRootTitles = specs
    .filter((s) => !s.parentTitle && s.title !== SEEDED_TOPIC_PROGRAM_TITLE)
    .map((s) => s.title)
    .sort((a, b) => a.localeCompare(b));

  const topicIdByTitle = new Map<string, string>();
  const classMap = opts.classBySourceRef ?? new Map<string, string | null>();

  for (const spec of ordered) {
    const members = matchSeededTopicMembers(
      spec,
      opts.conceptRows,
      opts.tierBySourceRef,
      classMap,
    );
    const childTitles = directChildTitles(spec.title, specs);
    // Library overview lists peer research roots for navigation.
    const synopsisChildTitles =
      spec.title === SEEDED_TOPIC_PROGRAM_TITLE ? peerRootTitles : childTitles;
    const synopsisMd = buildSeededDirectiveSynopsisMd({
      title: spec.title,
      directive: spec.directive,
      ...(spec.isProgram ? { isProgram: true as const } : {}),
      ...(synopsisChildTitles.length > 0 ? { childTitles: synopsisChildTitles } : {}),
      memberTitles: members.map((m) => m.title),
    });

    let parentTopicId: string | null = null;
    if (spec.parentTitle) {
      parentTopicId = topicIdByTitle.get(spec.parentTitle) ?? null;
    }

    const [existing] = await opts.db
      .select({ id: researchTopics.id })
      .from(researchTopics)
      .where(
        and(
          eq(researchTopics.companyId, opts.companyId),
          eq(researchTopics.moduleId, opts.researchModuleId),
          eq(researchTopics.title, spec.title),
        ),
      )
      .limit(1);

    let topicId: string;
    if (existing) {
      topicId = existing.id;
      await opts.db
        .update(researchTopics)
        .set({
          synopsisMd,
          status: 'active',
          parentTopicId,
          provenance: 'deterministic_bootstrap',
          updatedAt: opts.now,
        })
        .where(eq(researchTopics.id, topicId));
    } else {
      const [inserted] = await opts.db
        .insert(researchTopics)
        .values({
          companyId: opts.companyId,
          moduleId: opts.researchModuleId,
          parentTopicId,
          title: spec.title,
          synopsisMd,
          status: 'active',
          provenance: 'deterministic_bootstrap',
        })
        .returning({ id: researchTopics.id });
      topicId = inserted!.id;
    }

    topicIdByTitle.set(spec.title, topicId);

    const uniqueMembers = [
      ...new Map(members.map((m) => [m.id, m] as const)).values(),
    ];
    await opts.db.delete(topicConcepts).where(eq(topicConcepts.topicId, topicId));
    if (uniqueMembers.length > 0) {
      await opts.db
        .insert(topicConcepts)
        .values(
          uniqueMembers.map((member, sortOrder) => ({
            topicId,
            conceptId: member.id,
            sortOrder,
            role: humanize(sourceRefCatalog(member.sourceRef) ?? 'member'),
          })),
        )
        .onConflictDoNothing({
          target: [topicConcepts.topicId, topicConcepts.conceptId],
        });
    }
  }

  await pruneObsoleteSeededTopics({
    db: opts.db,
    companyId: opts.companyId,
    researchModuleId: opts.researchModuleId,
    sectorFocuses: opts.sectorFocuses ?? [],
  });

  return {
    topicIds: [...topicIdByTitle.values()],
    programTopicId: topicIdByTitle.get(SEEDED_TOPIC_PROGRAM_TITLE) ?? null,
  };
}

/**
 * Remove obsolete bootstrap topics (catalog mirrors, legacy Desk focus trees) that are
 * no longer in the company seeded title set. Keeps operator-created topics.
 */
export async function pruneObsoleteSeededTopics(opts: {
  db: Db;
  companyId: string;
  researchModuleId: string;
  sectorFocuses?: readonly string[];
}): Promise<number> {
  const protectedTitles = [
    ...protectedSeededTopicTitles(opts.sectorFocuses ?? []),
  ];
  const obsolete = await opts.db
    .select({ id: researchTopics.id })
    .from(researchTopics)
    .where(
      and(
        eq(researchTopics.companyId, opts.companyId),
        eq(researchTopics.moduleId, opts.researchModuleId),
        eq(researchTopics.provenance, 'deterministic_bootstrap'),
        notInArray(researchTopics.title, protectedTitles),
      ),
    );
  if (obsolete.length === 0) return 0;
  const ids = obsolete.map((r) => r.id);
  await opts.db.delete(topicConcepts).where(inArray(topicConcepts.topicId, ids));
  await opts.db
    .update(researchTopics)
    .set({ parentTopicId: null })
    .where(inArray(researchTopics.parentTopicId, ids));
  await opts.db.delete(researchTopics).where(inArray(researchTopics.id, ids));
  return ids.length;
}
