import { and, count, eq, inArray } from 'drizzle-orm';
import {
  RESEARCH_SOURCE_REGISTRY,
  ResearchSourceKind,
  SystemTopicScope,
  liveDataSourceLabel,
  resolveLiveApiSourceKind,
  resolveLiveDataSourceStatus,
  type MarketHubModelHydration,
  type MarketHubModelLibrarySource,
  type MarketHubModelLiveSource,
  type MarketHubModelResearchEngine,
  type MarketHubModelScopedModule,
  type MarketHubModelStageOp,
  type ResearchSourceAvailability,
  type ResearchSourceDescriptor,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  engineInstances,
  libraries,
  libraryConcepts,
  modules,
  researchTopics,
} from '@hftr/db/schema';
import {
  buildLibraryProcessingFlows,
  buildLiveProcessingFlows,
  buildProcessStepsFromFlows,
  buildSharedCompoundProcessSteps,
} from '@/lib/market-hub-processing-flows';
import { classifyLiveApiSource } from '@/lib/market-hub-live-source-class';
import {
  humanizePostureToken,
  scopedModuleOperation,
  stageScreenForScopedModuleType,
  subtypeChipForModuleConfig,
} from '@/lib/market-posture-scoped-modules';

const INTERNAL_SOURCE_KINDS = new Set<string>(['catalog', 'library', 'operator']);

const SYSTEM_SCOPES = new Set<string>(Object.values(SystemTopicScope).map((s) => s.toLowerCase()));

function isSourceReady(
  descriptor: ResearchSourceDescriptor,
  available: ResearchSourceAvailability,
): boolean {
  switch (descriptor.authMode) {
    case 'none':
      return true;
    case 'research_key':
      return descriptor.keyProvider
        ? available.researchKeys.includes(descriptor.keyProvider)
        : false;
    case 'broker_paper':
      return available.hasAlpacaPaper;
    default: {
      const _exhaustive: never = descriptor.authMode;
      return _exhaustive;
    }
  }
}

function liveOperation(opts: {
  status: MarketHubModelLiveSource['status'];
  contributed: boolean;
  canvasBoundCount: number;
}): { operation: string; amount: string } {
  const bound = opts.canvasBoundCount;
  const boundLabel = `${bound} canvas`;
  if (opts.status === 'stub' || opts.status === 'researched') {
    return {
      operation: opts.status === 'stub' ? 'stub idle' : 'researched idle',
      amount: boundLabel,
    };
  }
  if (opts.status === 'missing_key') {
    return { operation: 'need key', amount: boundLabel };
  }
  if (opts.contributed) {
    return { operation: 'hydrate · on board', amount: `${boundLabel} · contrib` };
  }
  if (bound > 0) {
    return { operation: 'hydrate ready', amount: boundLabel };
  }
  return { operation: 'ready · unbound', amount: '0 canvas' };
}

function libraryShelf(opts: {
  topicScope: string;
  isEngineDataHub: boolean;
  masterLibrary: boolean;
}): MarketHubModelLibrarySource['shelf'] {
  if (opts.isEngineDataHub) return 'engine_hub';
  if (SYSTEM_SCOPES.has(opts.topicScope.toLowerCase())) return 'system';
  if (opts.masterLibrary) return 'baseline';
  return 'company';
}

function libraryOperation(shelf: MarketHubModelLibrarySource['shelf']): string {
  switch (shelf) {
    case 'system':
      return 'system corpus';
    case 'engine_hub':
      return 'hub hydrate';
    case 'baseline':
      return 'baseline shelf';
    case 'company':
      return 'library feed';
    default: {
      const _exhaustive: never = shelf;
      return _exhaustive;
    }
  }
}

/**
 * Project live hydrators + library shelves for the synthesis Model graph (D-147).
 * Amounts are counts/status only — never LLM-emitted dollars.
 */
export async function projectMarketHubModelHydration(opts: {
  db: Db;
  companyId: string;
  availability: ResearchSourceAvailability;
  contributedKinds: string[];
  usedLiveMarks: number;
  syntheticMarks: number;
  moversItemCount: number;
  newsItemCount: number;
  watchlistCount: number;
  positionCount: number;
  /** Hub GET clock — Model refresh pulse (D-160). */
  asOfIso: string;
  sealStamps?: {
    moversVerifiedAt: string | null;
    moversExpiresAt: string | null;
    newsVerifiedAt: string | null;
    newsExpiresAt: string | null;
    dailyExpiresAt: string | null;
  };
}): Promise<MarketHubModelHydration> {
  const {
    db,
    companyId,
    availability,
    contributedKinds,
    usedLiveMarks,
    syntheticMarks,
    moversItemCount,
    newsItemCount,
    watchlistCount,
    positionCount,
  } = opts;

  const contributedSet = new Set(contributedKinds);
  const liveApiRows = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'live_api')));

  const modulesByKind = new Map<string, string[]>();
  for (const row of liveApiRows) {
    const kind = resolveLiveApiSourceKind(row.config);
    if (!kind) continue;
    const existing = modulesByKind.get(kind) ?? [];
    existing.push(row.id);
    modulesByKind.set(kind, existing);
  }

  const liveSources: MarketHubModelLiveSource[] = ResearchSourceKind.options
    .filter((kind) => !INTERNAL_SOURCE_KINDS.has(kind))
    .map((kind) => {
      const descriptor = RESEARCH_SOURCE_REGISTRY[kind];
      const ready = isSourceReady(descriptor, availability);
      const status = resolveLiveDataSourceStatus(descriptor, ready);
      const canvasBoundCount = modulesByKind.get(kind)?.length ?? 0;
      const contributed = contributedSet.has(kind);
      const { operation, amount } = liveOperation({
        status,
        contributed,
        canvasBoundCount,
      });
      return {
        kind,
        label: liveDataSourceLabel(kind),
        domain: descriptor.domain,
        sourceClass: classifyLiveApiSource({
          kind,
          domain: descriptor.domain,
        }),
        status,
        authMode: descriptor.authMode,
        canvasBoundCount,
        contributed,
        operation,
        amount,
        moduleType: 'live_api' as const,
        subtypeChip: humanizePostureToken(kind).slice(0, 60),
      };
    });

  const libRows = await db
    .select({
      id: libraries.id,
      name: libraries.name,
      topicScope: libraries.topicScope,
      isEngineDataHub: libraries.isEngineDataHub,
      masterLibrary: libraries.masterLibrary,
    })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.status, 'active')))
    .limit(64);

  const libIds = libRows.map((r) => r.id);
  const conceptTotals = new Map<string, number>();
  const admittedTotals = new Map<string, number>();
  if (libIds.length > 0) {
    const totals = await db
      .select({
        libraryId: libraryConcepts.libraryId,
        n: count(),
      })
      .from(libraryConcepts)
      .where(inArray(libraryConcepts.libraryId, libIds))
      .groupBy(libraryConcepts.libraryId);
    for (const row of totals) {
      conceptTotals.set(row.libraryId, Number(row.n));
    }
    const admitted = await db
      .select({
        libraryId: libraryConcepts.libraryId,
        n: count(),
      })
      .from(libraryConcepts)
      .where(
        and(
          inArray(libraryConcepts.libraryId, libIds),
          inArray(libraryConcepts.curationStatus, ['accepted', 'auto_admitted']),
        ),
      )
      .groupBy(libraryConcepts.libraryId);
    for (const row of admitted) {
      admittedTotals.set(row.libraryId, Number(row.n));
    }
  }

  const librarySources: MarketHubModelLibrarySource[] = libRows.map((row) => {
    const shelf = libraryShelf(row);
    const conceptCount = conceptTotals.get(row.id) ?? 0;
    const admittedCount = admittedTotals.get(row.id) ?? 0;
    const shelfChip = humanizePostureToken(shelf);
    return {
      id: row.id,
      name: row.name.slice(0, 120),
      topicScope: row.topicScope.slice(0, 80),
      shelf,
      conceptCount,
      admittedCount,
      operation: libraryOperation(shelf),
      amount: `${admittedCount} adm / ${conceptCount} concepts`,
      moduleType: 'library' as const,
      subtypeChip: shelfChip.slice(0, 60),
      libraryClass: null,
    };
  });

  const liveReady = liveSources.filter(
    (s) => s.status === 'ready' || s.status === 'public',
  ).length;
  const admittedConcepts = librarySources.reduce((n, l) => n + l.admittedCount, 0);

  const stageOps: MarketHubModelStageOp[] = [
    {
      stageId: 'providers',
      operation: 'entitle lanes',
      amount: `${liveReady}/${liveSources.length} ready`,
    },
    {
      stageId: 'gather',
      operation: 'pull evidence',
      amount: `${contributedKinds.length} sealed · ${admittedConcepts} lenses`,
    },
    {
      stageId: 'thresholds',
      operation: 'LLM presets',
      amount: 'ints only',
    },
    {
      stageId: 'defaults',
      operation: 'fail-closed',
      amount: 'typical band',
    },
    {
      stageId: 'universe',
      operation: 'build set',
      amount: `${moversItemCount + watchlistCount + positionCount} seeds`,
    },
    {
      stageId: 'rs',
      operation: 'score marks',
      amount: `${usedLiveMarks} live · ${syntheticMarks} synth`,
    },
    {
      stageId: 'rank',
      operation: 'compound rank',
      amount: `${moversItemCount} board`,
    },
    {
      stageId: 'verify',
      operation: 'promote gates',
      amount: `${watchlistCount} watch`,
    },
    {
      stageId: 'seal_movers',
      operation: 'board movers',
      amount: `${moversItemCount} items`,
    },
    {
      stageId: 'sector',
      operation: 'board news',
      amount: `${newsItemCount} items`,
    },
    {
      stageId: 'daily',
      operation: 'phase rollup',
      amount: 'calendar',
    },
    {
      stageId: 'narrative',
      operation: 'book↔tape',
      amount: `${positionCount} held`,
    },
    {
      stageId: 'hub_ready',
      operation: 'project hub',
      amount: `${liveSources.length}+${librarySources.length} src`,
    },
  ];

  const processingFlows = [
    ...buildLiveProcessingFlows(liveSources),
    ...librarySources.flatMap((lib) =>
      buildLibraryProcessingFlows({
        libraryId: lib.id,
        name: lib.name,
        admittedCount: lib.admittedCount,
        shelf: lib.shelf,
      }),
    ),
  ].slice(0, 64);

  const processSteps = [
    ...buildProcessStepsFromFlows(processingFlows),
    ...buildSharedCompoundProcessSteps({
      liveReady,
      liveTotal: liveSources.length,
      moversItemCount,
      newsItemCount,
      watchlistCount,
      positionCount,
      admittedConcepts,
      usedLiveMarks,
      syntheticMarks,
    }),
  ].slice(0, 128);

  // Research modules → library articles (D-214 / D-223). One row per research
  // module (desk specialty vs filings vs niche) — same type, different config.
  const researchModRows = await db
    .select({
      id: modules.id,
      name: modules.name,
      status: modules.status,
      config: modules.config,
      engineInstanceId: modules.engineInstanceId,
    })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'research')))
    .limit(32);

  const engineIds = [
    ...new Set(
      researchModRows
        .map((r) => r.engineInstanceId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const engineLabelById = new Map<string, string>();
  if (engineIds.length > 0) {
    const engRows = await db
      .select({ id: engineInstances.id, label: engineInstances.label })
      .from(engineInstances)
      .where(inArray(engineInstances.id, engineIds));
    for (const row of engRows) {
      engineLabelById.set(row.id, row.label);
    }
  }

  const liveApiByEngine = new Map<string, string[]>();
  const liveApiAll = await db
    .select({
      id: modules.id,
      config: modules.config,
      engineInstanceId: modules.engineInstanceId,
    })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), eq(modules.type, 'live_api')))
    .limit(128);
  for (const row of liveApiAll) {
    const kind = resolveLiveApiSourceKind(row.config);
    if (!kind || !row.engineInstanceId) continue;
    const list = liveApiByEngine.get(row.engineInstanceId) ?? [];
    if (!list.includes(kind)) list.push(kind);
    liveApiByEngine.set(row.engineInstanceId, list);
  }

  const topicCounts = new Map<string, number>();
  const researchModuleIds = researchModRows.map((r) => r.id);
  if (researchModuleIds.length > 0) {
    const topicRows = await db
      .select({
        moduleId: researchTopics.moduleId,
        n: count(),
      })
      .from(researchTopics)
      .where(
        and(
          inArray(researchTopics.moduleId, researchModuleIds),
          eq(researchTopics.status, 'active'),
        ),
      )
      .groupBy(researchTopics.moduleId);
    for (const row of topicRows) {
      topicCounts.set(row.moduleId, Number(row.n));
    }
  }

  const hubLibByOwner = new Map<string, string>();
  const hubOwnerRows = await db
    .select({
      id: libraries.id,
      ownerEngineInstanceId: libraries.ownerEngineInstanceId,
    })
    .from(libraries)
    .where(
      and(
        eq(libraries.companyId, companyId),
        eq(libraries.status, 'active'),
        eq(libraries.isEngineDataHub, true),
      ),
    )
    .limit(64);
  for (const row of hubOwnerRows) {
    if (row.ownerEngineInstanceId) {
      hubLibByOwner.set(row.ownerEngineInstanceId, row.id);
    }
  }

  const researchEngines: MarketHubModelResearchEngine[] = [];
  for (const mod of researchModRows) {
    const cfg = (mod.config ?? {}) as Record<string, unknown>;
    const fromConfig = Array.isArray(cfg.targetLibraryIds)
      ? (cfg.targetLibraryIds as string[]).filter((id) => typeof id === 'string')
      : [];
    const hubLib = mod.engineInstanceId
      ? hubLibByOwner.get(mod.engineInstanceId)
      : undefined;
    const boundLibraryIds = [
      ...new Set([...fromConfig, ...(hubLib ? [hubLib] : [])]),
    ].slice(0, 16);
    const liveKinds =
      (mod.engineInstanceId
        ? liveApiByEngine.get(mod.engineInstanceId)
        : undefined) ??
      liveSources
        .filter((s) => s.contributed || s.status === 'ready' || s.status === 'public')
        .map((s) => s.kind)
        .slice(0, 16);
    const topics = topicCounts.get(mod.id) ?? 0;
    const researchSubtype =
      typeof cfg.researchSubtype === 'string' ? cfg.researchSubtype : null;
    const subtypeChip = subtypeChipForModuleConfig('research', cfg);
    const engLabel = mod.engineInstanceId
      ? engineLabelById.get(mod.engineInstanceId)
      : undefined;
    const label = (mod.name || engLabel || 'Research').slice(0, 120);
    const status =
      mod.status === 'active' ||
      mod.status === 'paused' ||
      mod.status === 'error' ||
      mod.status === 'draft'
        ? mod.status
        : 'draft';
    researchEngines.push({
      id: mod.id,
      label,
      status,
      moduleType: 'research',
      researchSubtype,
      subtypeChip,
      engineInstanceId: mod.engineInstanceId ?? null,
      boundLibraryIds,
      liveSourceKinds: liveKinds.slice(0, 32),
      topicCount: topics,
      articleCount: topics,
      operation: researchSubtype
        ? `${researchSubtype.replace(/_/g, ' ')} → articles`
        : 'live → articles',
      amount: `${topics} articles · ${boundLibraryIds.length} libs`,
    });
  }

  // Other canvas modules for section chrome (D-223) — librarian, trend, desks, …
  const SCOPED_TYPES = [
    'librarian',
    'trend',
    'trading',
    'analyzer',
    'policy',
    'fund_router',
    'simulator',
    'generator',
    'math',
    'clock',
    'time',
    'display',
  ] as const;
  const scopedModRows = await db
    .select({
      id: modules.id,
      name: modules.name,
      type: modules.type,
      status: modules.status,
      config: modules.config,
      engineInstanceId: modules.engineInstanceId,
    })
    .from(modules)
    .where(and(eq(modules.companyId, companyId), inArray(modules.type, [...SCOPED_TYPES])))
    .limit(64);

  const scopedModules: MarketHubModelScopedModule[] = [];
  for (const mod of scopedModRows) {
    const screen = stageScreenForScopedModuleType(mod.type);
    if (!screen) continue;
    const cfg =
      mod.config && typeof mod.config === 'object' && !Array.isArray(mod.config)
        ? (mod.config as Record<string, unknown>)
        : {};
    const status =
      mod.status === 'active' ||
      mod.status === 'paused' ||
      mod.status === 'error' ||
      mod.status === 'draft'
        ? mod.status
        : 'draft';
    scopedModules.push({
      id: mod.id,
      name: mod.name.slice(0, 120),
      moduleType: mod.type,
      subtypeChip: subtypeChipForModuleConfig(mod.type, cfg),
      engineInstanceId: mod.engineInstanceId ?? null,
      stageScreenId: screen,
      operation: scopedModuleOperation(mod.type),
      amount: status,
      status,
    });
  }

  return {
    liveSources,
    librarySources,
    researchEngines: researchEngines.slice(0, 32),
    scopedModules: scopedModules.slice(0, 64),
    capitalSources: [],
    processingFlows,
    processSteps,
    stageOps,
    totals: {
      liveReady,
      liveTotal: liveSources.length,
      libraryCount: librarySources.length,
      admittedConcepts,
      contributedKinds: contributedKinds.length,
      usedLiveMarks,
      syntheticMarks,
    },
    asOfIso: opts.asOfIso,
    livePatchedAt: null,
    sealStamps: opts.sealStamps ?? {
      moversVerifiedAt: null,
      moversExpiresAt: null,
      newsVerifiedAt: null,
      newsExpiresAt: null,
      dailyExpiresAt: null,
    },
    panelSurfaces: [],
  };
}
