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
  type MarketHubModelStageOp,
  type ResearchSourceAvailability,
  type ResearchSourceDescriptor,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import { libraries, libraryConcepts, modules } from '@hftr/db/schema';
import {
  buildLibraryProcessingFlows,
  buildLiveProcessingFlows,
  buildProcessStepsFromFlows,
  buildSharedCompoundProcessSteps,
} from '@/lib/market-hub-processing-flows';

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
    return { operation: 'hydrate · sealed', amount: `${boundLabel} · contrib` };
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
        status,
        authMode: descriptor.authMode,
        canvasBoundCount,
        contributed,
        operation,
        amount,
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
    return {
      id: row.id,
      name: row.name.slice(0, 120),
      topicScope: row.topicScope.slice(0, 80),
      shelf,
      conceptCount,
      admittedCount,
      operation: libraryOperation(shelf),
      amount: `${admittedCount} adm / ${conceptCount} concepts`,
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
      operation: 'seal stock',
      amount: `${moversItemCount} items`,
    },
    {
      stageId: 'sector',
      operation: 'seal news',
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

  return {
    liveSources,
    librarySources,
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
