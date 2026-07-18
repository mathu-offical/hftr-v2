export type LibraryShelfKind = 'system_curated' | 'runtime' | 'baseline_seeded';

const BASELINE_NAME = 'Seeded trading mechanisms';
const BASELINE_TOPIC_SCOPE = 'compile_time_mechanisms';

/** Catalog families seeded into the compile-time mechanisms library (bootstrap SEED_CATALOG_NAMES). */
/** Catalog folders nested under the single Baseline seeded shelf (not separate panels). */
export const SEED_CATALOG_SHELVES = [
  {
    catalog: 'strategy_families',
    shelfId: 'baseline_strategy_families',
    label: 'Strategy families',
  },
  {
    catalog: 'compound_strategies',
    shelfId: 'baseline_compound_strategies',
    label: 'Compound strategies',
  },
  {
    catalog: 'recovery_ladders',
    shelfId: 'baseline_recovery_ladders',
    label: 'Recovery ladders',
  },
  {
    catalog: 'guardrail_packages',
    shelfId: 'baseline_guardrail_packages',
    label: 'Guardrails',
  },
  {
    catalog: 'session_constraints',
    shelfId: 'baseline_session_constraints',
    label: 'Session constraints',
  },
  {
    catalog: 'broker_policy_envelopes',
    shelfId: 'baseline_broker_policy',
    label: 'Broker policy',
  },
  {
    catalog: 'trend_lead_patterns',
    shelfId: 'baseline_trend_leads',
    label: 'Trend lead patterns',
  },
  {
    catalog: 'compliance_packages',
    shelfId: 'baseline_compliance',
    label: 'Compliance packages',
  },
  {
    catalog: 'event_archetypes',
    shelfId: 'baseline_event_archetypes',
    label: 'Event archetypes',
  },
  {
    catalog: 'macro_triggers',
    shelfId: 'baseline_macro_triggers',
    label: 'Macro triggers',
  },
  {
    catalog: 'sector_seeds',
    shelfId: 'baseline_sector_knowledge',
    label: 'Sector knowledge',
  },
] as const;

export type SeedCatalogId = (typeof SEED_CATALOG_SHELVES)[number]['catalog'];

export type SeededPageRow = {
  conceptId: string;
  title: string;
  tags: string[];
};

export type SeededSubfolder = {
  /** Stable key: `tier_a` or `general`. */
  id: string;
  label: string;
  pages: SeededPageRow[];
};

export type SeededCatalogGroup = {
  catalog: SeedCatalogId | 'uncategorized';
  shelfId: string;
  label: string;
  /** When true, show Overview topic control under this shelf. */
  showOverview: boolean;
  subfolders: SeededSubfolder[];
  /** Flat pages when there is only one bucket and no tier split needed. */
  flatPages: SeededPageRow[] | null;
};

export function classifyLibraryShelf(lib: { name: string; topicScope: string }): LibraryShelfKind {
  if (lib.name === BASELINE_NAME || lib.topicScope === BASELINE_TOPIC_SCOPE) {
    return 'baseline_seeded';
  }
  if (lib.topicScope.startsWith('system:')) {
    return 'system_curated';
  }
  return 'runtime';
}

export function isBaselineSeededLibrary(lib: { name: string; topicScope: string }): boolean {
  return classifyLibraryShelf(lib) === 'baseline_seeded';
}

/** Match a library folder to its overview topic page by exact title (D-045 / D-049). */
export function findLibraryOverviewTopic(
  libraryName: string,
  topics: ReadonlyArray<{ id: string; title: string }>,
): { id: string; title: string } | null {
  const match = topics.find((t) => t.title === libraryName);
  return match ?? null;
}

/** @deprecated D-126: catalog shelves no longer have matching research topics.
 * Kept so callers keep resolving null safely; library knowledge ≠ research points.
 */
export const SEED_CATALOG_DIRECTIVE_TOPIC: Record<string, string> = {
  strategy_families: 'Strategy families',
  compound_strategies: 'Compound strategies',
  recovery_ladders: 'Recovery ladders',
  guardrail_packages: 'Guardrails',
  session_constraints: 'Session constraints',
  broker_policy_envelopes: 'Broker policy',
  trend_lead_patterns: 'Trend lead patterns',
  sector_seeds: 'Sector knowledge',
  compliance_packages: 'Compliance packages',
  event_archetypes: 'Event archetypes',
  macro_triggers: 'Macro triggers',
};

export function findCatalogDirectiveTopic(
  catalog: string,
  topics: ReadonlyArray<{ id: string; title: string }>,
): { id: string; title: string } | null {
  const title = SEED_CATALOG_DIRECTIVE_TOPIC[catalog];
  if (!title) return null;
  const match = topics.find((t) => t.title === title);
  return match ?? null;
}

/**
 * Compact label for chips / hulls. Module-derived library names often include
 * arrow chains (`A ← B → C`); keep the head segment and truncate.
 */
export function shortLibraryLabel(name: string, maxLen = 28): string {
  const head = name.split(/\s*[←→]\s*/)[0]?.trim() || name;
  if (head.length <= maxLen) return head;
  return `${head.slice(0, Math.max(1, maxLen - 1))}…`;
}

export function humanizeConceptTitle(title: string): string {
  return title.replace(/_/g, ' ');
}

export function humanizeSeedTag(tag: string): string {
  if (tag.startsWith('tier_')) {
    return `Tier ${tag.slice('tier_'.length).toUpperCase()}`;
  }
  if (tag.startsWith('sector_') && tag !== 'sector_seeds') {
    return tag
      .slice('sector_'.length)
      .split('_')
      .map((part) => (part.length ? part[0]!.toUpperCase() + part.slice(1) : part))
      .join(' ');
  }
  return tag
    .split('_')
    .map((part) => (part.length ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(' ');
}

/** Primary seed catalog tag on a page, if any. */
export function seedCatalogForPage(tags: readonly string[]): SeedCatalogId | null {
  for (const def of SEED_CATALOG_SHELVES) {
    if (tags.includes(def.catalog)) return def.catalog;
  }
  return null;
}

/** Tier tag (`tier_a` …) when present. */
export function seedTierForPage(tags: readonly string[]): string | null {
  const tier = tags.find((t) => t.startsWith('tier_'));
  return tier ?? null;
}

/** Sector folder tag (`sector_technology` …) for Sector knowledge subfolders. */
export function seedSectorFolderForPage(tags: readonly string[]): string | null {
  const sector = tags.find((t) => t.startsWith('sector_') && t !== 'sector_seeds');
  return sector ?? null;
}

/**
 * Group seeded mechanism pages into catalog folders (under one Baseline shelf)
 * with optional tier subfolders. Overview attaches to the first folder with pages.
 */
export function groupSeededPagesIntoCatalogShelves(
  pages: readonly SeededPageRow[],
): SeededCatalogGroup[] {
  const byCatalog = new Map<SeedCatalogId, SeededPageRow[]>();
  for (const def of SEED_CATALOG_SHELVES) {
    byCatalog.set(def.catalog, []);
  }

  const uncategorized: SeededPageRow[] = [];
  for (const page of pages) {
    const catalog = seedCatalogForPage(page.tags);
    if (!catalog) {
      uncategorized.push(page);
      continue;
    }
    byCatalog.get(catalog)!.push(page);
  }

  const groups: SeededCatalogGroup[] = [];
  for (const def of SEED_CATALOG_SHELVES) {
    const catalogPages = [...(byCatalog.get(def.catalog) ?? [])].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    const { subfolders, flatPages } =
      def.catalog === 'sector_seeds'
        ? splitPagesIntoSectorFolders(catalogPages)
        : splitPagesIntoTier(catalogPages);
    groups.push({
      catalog: def.catalog,
      shelfId: def.shelfId,
      label: def.label,
      showOverview: false,
      subfolders,
      flatPages,
    });
  }

  if (uncategorized.length > 0) {
    const sorted = [...uncategorized].sort((a, b) => a.title.localeCompare(b.title));
    const { subfolders, flatPages } = splitPagesIntoTier(sorted);
    groups.push({
      catalog: 'uncategorized',
      shelfId: 'baseline_uncategorized',
      label: 'Other seeded',
      showOverview: false,
      subfolders,
      flatPages,
    });
  }

  const firstWithContent = groups.find((g) => pageCountInGroup(g) > 0) ?? groups[0] ?? null;
  if (firstWithContent) firstWithContent.showOverview = true;

  return groups;
}

function pageCountInGroup(group: SeededCatalogGroup): number {
  if (group.flatPages) return group.flatPages.length;
  return group.subfolders.reduce((n, s) => n + s.pages.length, 0);
}

function splitPagesIntoTier(pages: SeededPageRow[]): {
  subfolders: SeededSubfolder[];
  flatPages: SeededPageRow[] | null;
} {
  if (pages.length === 0) {
    return { subfolders: [], flatPages: [] };
  }

  const byTier = new Map<string | null, SeededPageRow[]>();
  for (const page of pages) {
    const tier = seedTierForPage(page.tags);
    const list = byTier.get(tier) ?? [];
    list.push(page);
    byTier.set(tier, list);
  }

  // One bucket only → flat list (no subfolder chrome).
  if (byTier.size <= 1) {
    return { subfolders: [], flatPages: pages };
  }

  const tierKeys = [...byTier.keys()].filter((k): k is string => k !== null).sort();
  const subfolders: SeededSubfolder[] = [];
  for (const tier of tierKeys) {
    subfolders.push({
      id: tier,
      label: humanizeSeedTag(tier),
      pages: byTier.get(tier) ?? [],
    });
  }
  if (byTier.has(null)) {
    subfolders.push({
      id: 'general',
      label: 'General',
      pages: byTier.get(null) ?? [],
    });
  }

  return { subfolders, flatPages: null };
}

/** Sector knowledge: one subfolder per coarse sector (`sector_technology`, …). */
function splitPagesIntoSectorFolders(pages: SeededPageRow[]): {
  subfolders: SeededSubfolder[];
  flatPages: SeededPageRow[] | null;
} {
  if (pages.length === 0) {
    return { subfolders: [], flatPages: [] };
  }

  const bySector = new Map<string | null, SeededPageRow[]>();
  for (const page of pages) {
    const sector = seedSectorFolderForPage(page.tags);
    const list = bySector.get(sector) ?? [];
    list.push(page);
    bySector.set(sector, list);
  }

  if (bySector.size <= 1) {
    return { subfolders: [], flatPages: pages };
  }

  const sectorKeys = [...bySector.keys()].filter((k): k is string => k !== null).sort();
  const subfolders: SeededSubfolder[] = [];
  for (const sector of sectorKeys) {
    subfolders.push({
      id: sector,
      label: humanizeSeedTag(sector),
      pages: (bySector.get(sector) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    });
  }
  if (bySector.has(null)) {
    subfolders.push({
      id: 'general',
      label: 'General',
      pages: bySector.get(null) ?? [],
    });
  }

  return { subfolders, flatPages: null };
}

export const LIBRARY_SHELF_LABELS: Record<LibraryShelfKind, string> = {
  system_curated: 'System curated (runtime)',
  runtime: 'Runtime (user / engine)',
  baseline_seeded: 'Baseline seeded',
};

/** Non-baseline shelves keep the original three-way order; baseline is replaced by catalog shelves. */
export const LIBRARY_SHELF_ORDER: LibraryShelfKind[] = [
  'system_curated',
  'runtime',
  'baseline_seeded',
];

export const BASELINE_SEEDED_LIBRARY_NAME = BASELINE_NAME;
