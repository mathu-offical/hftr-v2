/**
 * Seeded research topics are **module-side directives** (D-086).
 * They live on a research module, organize concept membership, and may spawn
 * further articles/libraries — they are not library containers.
 * Concepts / tags / trends / functions remain library-side.
 */

import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { resolveSectorSeedTargetFromLabel } from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { researchTopics, topicConcepts } from '@hftr/db/schema';
import { leakLint } from '../calc/leak-lint';

export const SEEDED_TOPIC_PROGRAM_TITLE = 'Seeded trading mechanisms';
/** @deprecated Prefer SEEDED_TOPIC_PROGRAM_TITLE; kept for archive/API compatibility. */
export const SEEDED_TOPIC_TITLE = SEEDED_TOPIC_PROGRAM_TITLE;

/** Dynamic company desk-focus directives (sector + catalog combinations). */
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
  /** When true, this is the program parent; children nest under it. */
  isProgram?: boolean;
  /** Parent directive title (program or mid-level group). */
  parentTitle?: string;
  /**
   * Concept membership filter. Empty = synopsis-only group/program directive
   * (points at child topics; does not own every concept).
   */
  members: SeededTopicMemberFilter[];
  /** Short qualitative directive intent for the synopsis. */
  directive: string;
};

/** Operator-facing label: underscores → spaces, capitalize first word only. */
function humanizeSnake(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim();
  if (!spaced) return spaced;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function directiveFor(label: string, intent: string): string {
  return `Directive: ${intent} (${label}). Module-side work program — may spawn articles or specialty libraries; catalog concepts stay library-side.`;
}

function groupSpec(title: string, intent: string): SeededTopicSpec {
  return {
    title,
    members: [],
    directive: directiveFor(title, intent),
  };
}

function classLeaf(
  parentTitle: string,
  catalog: string,
  classKey: string,
  titlePrefix: string,
  intent: string,
): SeededTopicSpec {
  const label = humanizeSnake(classKey);
  return {
    title: `${titlePrefix} — ${label}`,
    parentTitle,
    members: [{ catalog, class: classKey }],
    directive: directiveFor(`${titlePrefix} / ${label}`, intent),
  };
}

function tierLeaf(tier: 'tier_a' | 'tier_b' | 'tier_c', intent: string): SeededTopicSpec {
  const letter = tier.slice(-1).toUpperCase();
  return {
    title: `Strategy families — Tier ${letter}`,
    parentTitle: 'Strategy families',
    members: [{ catalog: 'strategy_families', tier }],
    directive: directiveFor(`Strategy families Tier ${letter}`, intent),
  };
}

function sectorLeaf(sector: string): SeededTopicSpec {
  const label = humanizeSnake(sector);
  return {
    title: `Sector — ${label}`,
    parentTitle: 'Sector knowledge',
    members: [{ catalog: 'sector_seeds', class: sector }],
    directive: directiveFor(`Sector ${label}`, 'deepen sector behavior seeds into desk research and optional specialty libraries'),
  };
}

/** Strategy family mechanism classes from seeded-strategy-catalog.json. */
export const STRATEGY_FAMILY_CLASSES = [
  'opening_auction_and_opening_range',
  'intraday_trend_and_momentum',
  'intraday_reversion_and_repricing',
  'quote_and_microstructure',
  'relative_value_and_spread',
  'event_and_news_overlay',
  'session_and_venue_specific',
  'volatility_and_risk_overlay',
] as const;

export const GUARDRAIL_CLASSES = [
  'catalyst_conflict_guardrail',
  'macro_and_policy_guardrail',
  'liquidity_and_spread_guardrail',
  'order_workflow_recovery',
  'relative_value_and_sympathy_guardrail',
  'inventory_and_adverse_selection_guardrail',
  'session_and_order_form_guardrail',
  'account_and_live_mode_guardrail',
] as const;

export const COMPLIANCE_CLASSES = [
  'launch_boundary',
  'retention_and_override',
  'session_and_order_legality',
  'transport_and_policy_cap',
  'traceability_and_reporting',
  'jurisdiction_and_product_scope',
  'access_and_approval',
  'regulatory_reform_tracking',
] as const;

export const EVENT_ARCHETYPE_CLASSES = [
  'earnings',
  'guidance',
  'filing',
  'regulatory',
  'product',
  'strategic_transaction',
  'management_change',
] as const;

export const MACRO_TRIGGER_CLASSES = [
  'macro_policy',
  'macro_data_release',
  'market_regime',
  'geopolitical',
  'geopolitical_policy',
  'regulatory_geopolitical',
  'geopolitical_operational',
  'regulatory',
  'policy_regime',
] as const;

export const TREND_LEAD_CLASSES = [
  'sector_breadth_and_leadership',
  'event_and_supply_chain_readthrough',
  'macro_repricing_and_reentry',
  'microstructure_and_level_recovery',
  'session_transition_and_discovery',
  'defensive_regime_rotation',
  'policy_and_supply_chain_repricing',
  'crypto_policy_and_proxy_rotation',
  'rates_sensitive_cross_sector_rotation',
  'regime_and_breadth_confirmation',
  'event_impact_transmission',
] as const;

export const SECTOR_SEED_KEYS = [
  'technology',
  'communication_services',
  'consumer_discretionary',
  'consumer_staples',
  'financials',
  'health_care',
  'industrials',
  'energy',
  'materials',
  'utilities',
  'real_estate',
  'crypto_equities_and_proxies',
] as const;

/**
 * Catalog-backed seeded directives as **separate top-level roots** (D-096).
 * "Seeded trading mechanisms" remains an overview index (library nest name), not a
 * mega-parent that hides every other directive. Mid-level groups own class/tier leaves.
 */
export const SEEDED_TOPIC_SPECS: readonly SeededTopicSpec[] = [
  {
    title: SEEDED_TOPIC_PROGRAM_TITLE,
    isProgram: true,
    members: [],
    directive:
      'Overview index for compile-time trading mechanisms. Peer top-level topics are the actual research-module work programs (strategy, guardrails, sectors, desk focuses). Concepts stay library-side under the Seeded trading mechanisms nest.',
  },

  // —— Strategy families (class + activation tier) ——
  groupSpec(
    'Strategy families',
    'organize strategy-family mechanisms by class and activation tier',
  ),
  ...STRATEGY_FAMILY_CLASSES.map((c) =>
    classLeaf(
      'Strategy families',
      'strategy_families',
      c,
      'Strategy class',
      'curate and operationalize this strategy-family class',
    ),
  ),
  tierLeaf(
    'tier_a',
    'curate high-activation Tier A strategy family mechanisms for desk research and librarian scoring',
  ),
  tierLeaf(
    'tier_b',
    'curate Tier B strategy family mechanisms — broader set for opportunistic research and validation',
  ),
  tierLeaf(
    'tier_c',
    'curate Tier C strategy family mechanisms — lower activation / specialty paths',
  ),

  // —— Small catalogs (top-level leaves) ——
  {
    title: 'Compound strategies',
    members: [{ catalog: 'compound_strategies' }],
    directive: directiveFor(
      'Compound strategies',
      'bind multi-mechanism compound strategy patterns into readable articles and library membership',
    ),
  },
  {
    title: 'Recovery ladders',
    members: [{ catalog: 'recovery_ladders' }],
    directive: directiveFor(
      'Recovery ladders',
      'document recovery ladder templates as qualitative operating articles for verification and dispatch framing',
    ),
  },
  {
    title: 'Session constraints',
    members: [{ catalog: 'session_constraints' }],
    directive: directiveFor(
      'Session constraints',
      'session legality and window constraints as curated knowledge for research and policy overlap',
    ),
  },
  {
    title: 'Broker policy',
    members: [{ catalog: 'broker_policy_envelopes' }],
    directive: directiveFor(
      'Broker policy',
      'broker policy envelopes as qualitative articles for venue-aware research scope',
    ),
  },

  // —— Guardrails by class ——
  groupSpec('Guardrails', 'keep guardrail packages visible as class-scoped research directives'),
  ...GUARDRAIL_CLASSES.map((c) =>
    classLeaf(
      'Guardrails',
      'guardrail_packages',
      c,
      'Guardrail',
      'document and cross-link this guardrail class from research focus',
    ),
  ),

  // —— Trend lead patterns by class ——
  groupSpec(
    'Trend lead patterns',
    'organize trend-lead vocabulary for research→trend handoff',
  ),
  ...TREND_LEAD_CLASSES.map((c) =>
    classLeaf(
      'Trend lead patterns',
      'trend_lead_patterns',
      c,
      'Trend lead',
      'curate this trend-lead pattern class for librarian relevance and handoff',
    ),
  ),

  // —— Compliance by class ——
  groupSpec(
    'Compliance packages',
    'organize compliance policy packages for policy-aware research',
  ),
  ...COMPLIANCE_CLASSES.map((c) =>
    classLeaf(
      'Compliance packages',
      'compliance_packages',
      c,
      'Compliance',
      'baseline articles for this compliance class',
    ),
  ),

  // —— Event archetypes by class ——
  groupSpec(
    'Event archetypes',
    'frame corporate and calendar event research by archetype class',
  ),
  ...EVENT_ARCHETYPE_CLASSES.map((c) =>
    classLeaf(
      'Event archetypes',
      'event_archetypes',
      c,
      'Event',
      'research framing for this company-event archetype class',
    ),
  ),

  // —— Macro triggers by class ——
  groupSpec(
    'Macro triggers',
    'organize macro and geopolitical triggers for blackout and reentry vocabulary',
  ),
  ...MACRO_TRIGGER_CLASSES.map((c) =>
    classLeaf(
      'Macro triggers',
      'macro_triggers',
      c,
      'Macro',
      'curate this macro/geopolitical trigger class',
    ),
  ),

  // —— Sectors (full catalog atlas; company focuses get separate Desk focus topics) ——
  groupSpec(
    'Sector knowledge',
    'admit sector behavior seeds; deepen into specialty libraries when needed',
  ),
  ...SECTOR_SEED_KEYS.map((s) => sectorLeaf(s)),
];

/** Catalog domains combined into each company desk-focus directive. */
const DESK_FOCUS_COMBINATION_CATALOGS = [
  { suffix: 'Strategies', catalog: 'strategy_families', intent: 'strategy-family mechanisms' },
  { suffix: 'Trend leads', catalog: 'trend_lead_patterns', intent: 'trend-lead patterns' },
  { suffix: 'Guardrails', catalog: 'guardrail_packages', intent: 'guardrail packages' },
  { suffix: 'Events', catalog: 'event_archetypes', intent: 'event archetypes' },
] as const;

/**
 * Company sector-focus directives: one top-level desk topic per focus, plus
 * combination children that OR sector_seeds with a catalog domain (D-096).
 */
export function buildDeskFocusTopicSpecs(
  sectorFocuses: readonly string[],
): SeededTopicSpec[] {
  const specs: SeededTopicSpec[] = [];
  const seenLabels = new Set<string>();

  for (const raw of sectorFocuses) {
    const label = raw.trim();
    if (!label || seenLabels.has(label)) continue;
    const target = resolveSectorSeedTargetFromLabel(label);
    if (!target) continue;
    seenLabels.add(label);

    const focusTitle = `${DESK_FOCUS_TOPIC_PREFIX}${label}`;
    specs.push({
      title: focusTitle,
      members: [{ catalog: 'sector_seeds', class: target.sectorKey }],
      directive: directiveFor(
        focusTitle,
        `primary desk research for company sector focus "${label}" — sector seeds plus combination child directives`,
      ),
    });

    for (const combo of DESK_FOCUS_COMBINATION_CATALOGS) {
      const title = `${focusTitle} · ${combo.suffix}`;
      specs.push({
        title,
        parentTitle: focusTitle,
        members: [
          { catalog: 'sector_seeds', class: target.sectorKey },
          { catalog: combo.catalog },
        ],
        directive: directiveFor(
          title,
          `combine ${label} sector seeds with seeded ${combo.intent} for desk research`,
        ),
      });
    }
  }

  return specs;
}

/** Full seeded topic set for a company (static catalog roots + desk focuses). */
export function buildSeededTopicSpecsForCompany(
  sectorFocuses: readonly string[] = [],
): SeededTopicSpec[] {
  return [...SEEDED_TOPIC_SPECS, ...buildDeskFocusTopicSpecs(sectorFocuses)];
}

export const SEEDED_TOPIC_TITLES: ReadonlySet<string> = new Set(
  SEEDED_TOPIC_SPECS.map((s) => s.title),
);

/** Top-level catalog roots excluding the mechanisms overview index. */
export const SEEDED_TOPIC_CATALOG_ROOT_TITLES: readonly string[] = SEEDED_TOPIC_SPECS.filter(
  (s) => !s.parentTitle && s.title !== SEEDED_TOPIC_PROGRAM_TITLE,
).map((s) => s.title);

export function isSeededTopicTitle(title: string): boolean {
  return SEEDED_TOPIC_TITLES.has(title) || title.startsWith(DESK_FOCUS_TOPIC_PREFIX);
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
  const lines = [
    `# ${opts.title}`,
    '',
    '> Research-module directive (module-side). Concepts and tags remain library-side.',
    '',
    opts.directive,
    '',
    '## Scope',
    '',
    '- Owns ordered concept membership for focus and Page reading.',
    '- May spawn additional research articles or specialty libraries during agent work.',
    '- Does not replace the Seeded trading mechanisms library nest.',
  ];

  if (opts.childTitles && opts.childTitles.length > 0) {
    lines.push('', opts.isProgram ? '## Peer directives' : '## Child directives', '');
    for (const child of opts.childTitles) {
      lines.push(`- [[${child}]]`);
    }
  }

  if (opts.memberTitles && opts.memberTitles.length > 0) {
    lines.push('', '## Member concepts', '');
    for (const title of opts.memberTitles) {
      lines.push(`- [[${title}]]`);
    }
  } else if (!opts.isProgram && !(opts.childTitles && opts.childTitles.length > 0)) {
    lines.push('', '## Member concepts', '', '_No matching catalog articles yet._');
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
 * Upsert the full seeded topic forest for one research module and rebuild memberships.
 * Catalog domains are separate top-level roots; company sector focuses add Desk focus
 * combination topics (D-096).
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
  /** Company sector focuses (create wizard labels) → Desk focus topics. */
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
    const childTitles = spec.isProgram
      ? peerRootTitles
      : directChildTitles(spec.title, specs);
    const synopsisMd = buildSeededDirectiveSynopsisMd({
      title: spec.title,
      directive: spec.directive,
      ...(spec.isProgram ? { isProgram: true as const } : {}),
      ...(childTitles.length > 0 ? { childTitles } : {}),
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
 * Remove obsolete bootstrap topics (e.g. prior title/humanize variants) that are
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
  // Clear parent pointers from any remaining children before delete.
  await opts.db
    .update(researchTopics)
    .set({ parentTopicId: null })
    .where(inArray(researchTopics.parentTopicId, ids));
  await opts.db.delete(researchTopics).where(inArray(researchTopics.id, ids));
  return ids.length;
}
