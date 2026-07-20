import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
  ENGINE_DATA_HUB_TOPIC_SCOPE,
  HubCorpusCache,
  LibraryModuleConfig,
  mergeEngineDataHubCompoundConfig,
  type EngineDataHubCompoundConfig,
  type HubCorpusConceptRef,
  type HubCorpusSlice,
  type HubEngineLocal,
  type HubSymlink,
} from '@hftr/contracts';
import type { Db } from '@hftr/db';
import {
  concepts,
  libraries,
  libraryConcepts,
  marketHubSynthesisRuns,
  modules,
} from '@hftr/db/schema';

export const HUB_CORPUS_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CONCEPTS_PER_SLICE = 48;
const BODY_SLICE_MAX = 400;

export type HubModuleContext = {
  companyId: string;
  hubLibraryId: string;
  hubModuleId: string;
  config: Record<string, unknown>;
};

function bodySlice(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_SLICE_MAX) return trimmed;
  return trimmed.slice(0, BODY_SLICE_MAX);
}

function conceptDigest(conceptId: string, title: string | undefined, slice: string): string {
  return createHash('sha256')
    .update([conceptId, title ?? '', slice].join('|'), 'utf8')
    .digest('hex')
    .slice(0, 32);
}

export function isHubCorpusCacheFresh(
  cache: HubCorpusCache | null | undefined,
  now = new Date(),
): boolean {
  if (!cache) return false;
  const expiresAt = Date.parse(cache.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now.getTime();
}

export function assembleHubModuleConfig(
  prior: Record<string, unknown>,
  patch: {
    ownerEngineInstanceId: string;
    nestedModuleIds: string[];
    symlinks?: HubSymlink[];
    engineLocal?: HubEngineLocal[];
    corpusCache?: HubCorpusCache | null;
  },
): Record<string, unknown> {
  const priorPartial: Partial<EngineDataHubCompoundConfig> = {};
  if (Array.isArray(prior.shelves)) {
    priorPartial.shelves = prior.shelves as EngineDataHubCompoundConfig['shelves'];
  }
  if (Array.isArray(prior.shelfOutputs)) {
    priorPartial.shelfOutputs = prior.shelfOutputs as EngineDataHubCompoundConfig['shelfOutputs'];
  }
  if (prior.topicFeed && typeof prior.topicFeed === 'object') {
    priorPartial.topicFeed = prior.topicFeed as EngineDataHubCompoundConfig['topicFeed'];
  }
  const compound = mergeEngineDataHubCompoundConfig(priorPartial);
  const parsed = LibraryModuleConfig.safeParse(prior);

  const symlinks = patch.symlinks ?? (parsed.success ? parsed.data.symlinks : undefined);
  const engineLocal = patch.engineLocal ?? (parsed.success ? parsed.data.engineLocal : undefined);
  const corpusCache =
    patch.corpusCache !== undefined
      ? patch.corpusCache
      : parsed.success
        ? parsed.data.corpusCache
        : undefined;

  const next: Record<string, unknown> = {
    topicScope: ENGINE_DATA_HUB_TOPIC_SCOPE,
    masterLibrary: false,
    libraryClass: 'engine_data_hub',
    engineDataHub: true,
    ownerEngineInstanceId: patch.ownerEngineInstanceId,
    nestedModuleIds: patch.nestedModuleIds,
    shelves: compound.shelves,
    shelfOutputs: compound.shelfOutputs,
    topicFeed: compound.topicFeed,
  };
  if (symlinks && symlinks.length > 0) next.symlinks = symlinks;
  if (engineLocal && engineLocal.length > 0) next.engineLocal = engineLocal;
  if (corpusCache !== undefined) next.corpusCache = corpusCache;
  return next;
}

export async function loadHubModuleContext(
  db: Db,
  hubLibraryId: string,
): Promise<HubModuleContext | null> {
  const [hubLib] = await db
    .select({
      id: libraries.id,
      companyId: libraries.companyId,
      moduleId: libraries.moduleId,
    })
    .from(libraries)
    .where(and(eq(libraries.id, hubLibraryId), eq(libraries.isEngineDataHub, true)))
    .limit(1);
  if (!hubLib?.moduleId) return null;

  const [hubMod] = await db
    .select({ id: modules.id, config: modules.config })
    .from(modules)
    .where(eq(modules.id, hubLib.moduleId))
    .limit(1);
  if (!hubMod) return null;

  return {
    companyId: hubLib.companyId,
    hubLibraryId: hubLib.id,
    hubModuleId: hubMod.id,
    config: (hubMod.config ?? {}) as Record<string, unknown>,
  };
}

async function queryConceptRefs(
  db: Db,
  libraryId: string,
): Promise<HubCorpusConceptRef[]> {
  const rows = await db
    .select({
      conceptId: concepts.id,
      title: concepts.title,
      body: concepts.body,
      curationStatus: libraryConcepts.curationStatus,
      updatedAt: concepts.updatedAt,
    })
    .from(libraryConcepts)
    .innerJoin(concepts, eq(libraryConcepts.conceptId, concepts.id))
    .where(
      and(eq(libraryConcepts.libraryId, libraryId), eq(concepts.status, 'active')),
    )
    .orderBy(desc(concepts.updatedAt))
    .limit(MAX_CONCEPTS_PER_SLICE);

  return rows.map((row) => {
    const slice = bodySlice(row.body);
    return {
      conceptId: row.conceptId,
      title: row.title,
      curationStatus: row.curationStatus,
      bodySlice: slice,
      digest: conceptDigest(row.conceptId, row.title, slice),
    };
  });
}

async function resolvePostureRevision(db: Db, companyId: string): Promise<string | undefined> {
  const [run] = await db
    .select({
      id: marketHubSynthesisRuns.id,
      updatedAt: marketHubSynthesisRuns.updatedAt,
    })
    .from(marketHubSynthesisRuns)
    .where(eq(marketHubSynthesisRuns.companyId, companyId))
    .orderBy(desc(marketHubSynthesisRuns.updatedAt))
    .limit(1);
  if (!run) return undefined;
  return `${run.id}:${run.updatedAt.toISOString()}`;
}

function buildDigestIndex(slices: HubCorpusSlice[]): HubCorpusCache['digestIndex'] {
  const index: HubCorpusCache['digestIndex'] = {};
  for (const slice of slices) {
    for (const ref of slice.conceptRefs) {
      if (!ref.digest) continue;
      index[ref.digest] = {
        conceptId: ref.conceptId,
        sourceKind: slice.source,
      };
    }
  }
  return index;
}

function computeHubRevision(slices: HubCorpusSlice[]): string {
  const payload = slices
    .map(
      (slice) =>
        `${slice.refLibraryId}:${slice.conceptRefs.map((ref) => ref.digest ?? ref.conceptId).join(',')}`,
    )
    .join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

/**
 * D-242: rebuild hub-local corpus cache from symlink targets + engineLocal nests.
 * Read-through only — never inserts library_concepts into symlink targets.
 */
export async function refreshHubCorpusCache(
  db: Db,
  companyId: string,
  hubLibraryId: string,
  now = new Date(),
): Promise<HubCorpusCache | null> {
  const ctx = await loadHubModuleContext(db, hubLibraryId);
  if (!ctx || ctx.companyId !== companyId) return null;

  const parsed = LibraryModuleConfig.safeParse(ctx.config);
  const symlinks = parsed.success ? (parsed.data.symlinks ?? []) : [];
  const engineLocal = parsed.success ? (parsed.data.engineLocal ?? []) : [];

  const slices: HubCorpusSlice[] = [];

  for (const link of symlinks) {
    const conceptRefs = await queryConceptRefs(db, link.refLibraryId);
    slices.push({
      shelf: link.shelf ?? { origin: 'policy_returns', stream: 'system_normalized' },
      source: 'symlink',
      refLibraryId: link.refLibraryId,
      conceptRefs,
      sealRefs: [],
    });
  }

  for (const local of engineLocal) {
    const conceptRefs = await queryConceptRefs(db, local.libraryId);
    slices.push({
      shelf: { origin: local.origin, stream: local.stream },
      source: 'engine_local',
      refLibraryId: local.libraryId,
      conceptRefs,
      sealRefs: [],
    });
  }

  const postureRevision = await resolvePostureRevision(db, companyId);
  const expiresAt = new Date(now.getTime() + HUB_CORPUS_TTL_MS);
  const cache = HubCorpusCache.parse({
    schemaVersion: 1,
    hubLibraryId,
    hubRevision: computeHubRevision(slices),
    postureRevision,
    refreshedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    slices,
    digestIndex: buildDigestIndex(slices),
  });

  const ownerEngineInstanceId =
    typeof ctx.config.ownerEngineInstanceId === 'string'
      ? ctx.config.ownerEngineInstanceId
      : '';
  const nestedModuleIds = Array.isArray(ctx.config.nestedModuleIds)
    ? (ctx.config.nestedModuleIds as string[])
    : [];

  if (!ownerEngineInstanceId) return cache;

  await db
    .update(modules)
    .set({
      config: assembleHubModuleConfig(ctx.config, {
        ownerEngineInstanceId,
        nestedModuleIds,
        symlinks,
        engineLocal,
        corpusCache: cache,
      }),
      updatedAt: now,
    })
    .where(eq(modules.id, ctx.hubModuleId));

  return cache;
}

/** Returns fresh cache from module config or rebuilds when stale/missing. */
export async function loadHubCorpus(
  db: Db,
  hubLibraryId: string,
  now = new Date(),
): Promise<HubCorpusCache | null> {
  const ctx = await loadHubModuleContext(db, hubLibraryId);
  if (!ctx) return null;

  const parsed = LibraryModuleConfig.safeParse(ctx.config);
  const cache = parsed.success ? parsed.data.corpusCache : null;
  if (cache && isHubCorpusCacheFresh(cache, now)) {
    return HubCorpusCache.parse(cache);
  }

  return refreshHubCorpusCache(db, ctx.companyId, hubLibraryId, now);
}

/** D-242: refresh corpus caches for every execution hub in a company. */
export async function invalidateCompanyHubCaches(
  db: Db,
  companyId: string,
  now = new Date(),
): Promise<number> {
  const hubs = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(and(eq(libraries.companyId, companyId), eq(libraries.isEngineDataHub, true)));

  let refreshed = 0;
  for (const hub of hubs) {
    const cache = await refreshHubCorpusCache(db, companyId, hub.id, now);
    if (cache) refreshed += 1;
  }
  return refreshed;
}
