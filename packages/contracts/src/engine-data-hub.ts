import { z } from 'zod';

/**
 * D-216: Engine Data Hub compound shelf taxonomy.
 * Origin role first, then stream nature within each origin.
 * All shelves remain under one hub module; source = owning execution engine.
 */

export const HubShelfOrigin = z.enum([
  'research_in',
  'exec_runtime',
  'sim_training',
  'policy_returns',
]);
export type HubShelfOrigin = z.infer<typeof HubShelfOrigin>;

export const HubShelfStream = z.enum([
  'semantic',
  'numeric_capital',
  'system_normalized',
]);
export type HubShelfStream = z.infer<typeof HubShelfStream>;

export const HubShelfKey = z.object({
  origin: HubShelfOrigin,
  stream: HubShelfStream,
});
export type HubShelfKey = z.infer<typeof HubShelfKey>;

/** Motherboard bus for per-shelf outs (streamId encodes the shelf). */
export const HubShelfOutputBus = z.literal('data_out');
export type HubShelfOutputBus = z.infer<typeof HubShelfOutputBus>;

export const HubShelfOutput = z.object({
  origin: HubShelfOrigin,
  stream: HubShelfStream,
  bus: HubShelfOutputBus.default('data_out'),
  enabled: z.boolean().default(false),
  streamId: z.string().min(1).max(80).optional(),
  streamDescriptor: z.string().max(200).optional(),
});
export type HubShelfOutput = z.infer<typeof HubShelfOutput>;

export const HubTopicFeedConfig = z.object({
  /** Auto-create / refresh engine-scoped topics from qualifying ingest (default on). */
  enabled: z.boolean().default(true),
});
export type HubTopicFeedConfig = z.infer<typeof HubTopicFeedConfig>;

export const HubShelfSlot = z.object({
  origin: HubShelfOrigin,
  stream: HubShelfStream,
  /** Operator label override; default derived from origin+stream. */
  label: z.string().min(1).max(80).optional(),
});
export type HubShelfSlot = z.infer<typeof HubShelfSlot>;

export const EngineDataHubCompoundConfig = z.object({
  shelves: z.array(HubShelfSlot).max(24).default([]),
  shelfOutputs: z.array(HubShelfOutput).max(24).default([]),
  topicFeed: HubTopicFeedConfig.default({ enabled: true }),
});
export type EngineDataHubCompoundConfig = z.infer<typeof EngineDataHubCompoundConfig>;

/** Analyzer → hub feed class (D-216). Direct write-through vs analyzed + topic candidates. */
export const AnalyzerHubFeedClass = z.enum(['direct', 'analyzed']);
export type AnalyzerHubFeedClass = z.infer<typeof AnalyzerHubFeedClass>;

export const HUB_SHELF_ORIGINS = HubShelfOrigin.options;
export const HUB_SHELF_STREAMS = HubShelfStream.options;

export function hubShelfStreamId(origin: HubShelfOrigin, stream: HubShelfStream): string {
  return `shelf:${origin}:${stream}`;
}

export function hubShelfDefaultLabel(origin: HubShelfOrigin, stream: HubShelfStream): string {
  const originLabel: Record<HubShelfOrigin, string> = {
    research_in: 'Research-in',
    exec_runtime: 'Exec-runtime',
    sim_training: 'Sim-training',
    policy_returns: 'Policy-returns',
  };
  const streamLabel: Record<HubShelfStream, string> = {
    semantic: 'Semantic',
    numeric_capital: 'Numeric/Capital',
    system_normalized: 'System',
  };
  return `${originLabel[origin]} · ${streamLabel[stream]}`;
}

/** Full 4×3 shelf matrix for a new Engine Data Hub. */
export function defaultHubShelfSlots(): HubShelfSlot[] {
  const slots: HubShelfSlot[] = [];
  for (const origin of HUB_SHELF_ORIGINS) {
    for (const stream of HUB_SHELF_STREAMS) {
      slots.push({
        origin,
        stream,
        label: hubShelfDefaultLabel(origin, stream),
      });
    }
  }
  return slots;
}

/** Default shelf outs: all disabled (combined hub→exec data_in remains primary). */
export function defaultHubShelfOutputs(): HubShelfOutput[] {
  return defaultHubShelfSlots().map((slot) => ({
    origin: slot.origin,
    stream: slot.stream,
    bus: 'data_out' as const,
    enabled: false,
    streamId: hubShelfStreamId(slot.origin, slot.stream),
    streamDescriptor: slot.label ?? hubShelfDefaultLabel(slot.origin, slot.stream),
  }));
}

export function defaultEngineDataHubCompoundConfig(): EngineDataHubCompoundConfig {
  return {
    shelves: defaultHubShelfSlots(),
    shelfOutputs: defaultHubShelfOutputs(),
    topicFeed: { enabled: true },
  };
}

/** D-239: Read-through symlink into posture/baseline libraries (no concept duplication). */
export const HubSymlinkRole = z.enum([
  'posture_system',
  'baseline_mechanisms',
  'company_master',
]);
export type HubSymlinkRole = z.infer<typeof HubSymlinkRole>;

export const HubSymlink = z.object({
  refLibraryId: z.string().uuid(),
  role: HubSymlinkRole,
  topicScope: z.string().max(80).optional(),
  shelf: HubShelfKey.optional(),
  access: z.literal('read_through').default('read_through'),
});
export type HubSymlink = z.infer<typeof HubSymlink>;

export const HubEngineLocalBinding = z.enum(['nest', 'hydrate_target']);
export type HubEngineLocalBinding = z.infer<typeof HubEngineLocalBinding>;

export const HubEngineLocalOwner = z.enum([
  'inline_spine',
  'child_research',
  'sim_feedback',
  'engine_owned',
]);
export type HubEngineLocalOwner = z.infer<typeof HubEngineLocalOwner>;

export const HubEngineLocal = z.object({
  libraryId: z.string().uuid(),
  moduleId: z.string().uuid(),
  origin: HubShelfOrigin.default('research_in'),
  stream: HubShelfStream.default('semantic'),
  binding: HubEngineLocalBinding.default('nest'),
  owner: HubEngineLocalOwner.default('engine_owned'),
});
export type HubEngineLocal = z.infer<typeof HubEngineLocal>;

/** D-242: Hub-local corpus cache — refs/digests/slices, not duplicate concepts. */
export const HubCorpusConceptRef = z.object({
  conceptId: z.string().uuid(),
  title: z.string().max(200).optional(),
  curationStatus: z.string().max(40).optional(),
  bodySlice: z.string().max(400).optional(),
  digest: z.string().max(128).optional(),
});
export type HubCorpusConceptRef = z.infer<typeof HubCorpusConceptRef>;

export const HubCorpusSealRef = z.object({
  sealId: z.string().min(1),
  kind: z.string().min(1),
  subjectKey: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});
export type HubCorpusSealRef = z.infer<typeof HubCorpusSealRef>;

export const HubCorpusSlice = z.object({
  shelf: HubShelfKey,
  source: z.enum(['symlink', 'engine_local']),
  refLibraryId: z.string().uuid(),
  conceptRefs: z.array(HubCorpusConceptRef).max(48).default([]),
  sealRefs: z.array(HubCorpusSealRef).max(16).default([]),
});
export type HubCorpusSlice = z.infer<typeof HubCorpusSlice>;

export const HubCorpusCache = z.object({
  schemaVersion: z.literal(1),
  hubLibraryId: z.string().uuid(),
  hubRevision: z.string().min(1),
  postureRevision: z.string().min(1).optional(),
  refreshedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  slices: z.array(HubCorpusSlice).max(48).default([]),
  digestIndex: z.record(z.string(), z.object({
    conceptId: z.string().uuid().optional(),
    sealId: z.string().optional(),
    sourceKind: z.string().optional(),
  })).default({}),
});
export type HubCorpusCache = z.infer<typeof HubCorpusCache>;

/** D-239: Full Engine Data Hub group config (compound shelves + membership). */
export const EngineDataHubGroup = z.object({
  hubLibraryId: z.string().uuid().optional(),
  hubModuleId: z.string().uuid().optional(),
  ownerEngineInstanceId: z.string().uuid().optional(),
  compound: EngineDataHubCompoundConfig.default(defaultEngineDataHubCompoundConfig()),
  symlinks: z.array(HubSymlink).max(32).default([]),
  engineLocal: z.array(HubEngineLocal).max(64).default([]),
  hydrateTargetLibraryIds: z.array(z.string().uuid()).max(32).default([]),
  corpusCache: HubCorpusCache.nullable().optional(),
});
export type EngineDataHubGroup = z.infer<typeof EngineDataHubGroup>;

export function emptyEngineDataHubGroup(
  ownerEngineInstanceId?: string,
): EngineDataHubGroup {
  return {
    ownerEngineInstanceId,
    compound: defaultEngineDataHubCompoundConfig(),
    symlinks: [],
    engineLocal: [],
    hydrateTargetLibraryIds: [],
    corpusCache: null,
  };
}

/**
 * Idempotent merge: keep operator-enabled outs and custom labels; fill missing slots.
 */
export function mergeEngineDataHubCompoundConfig(
  existing: Partial<EngineDataHubCompoundConfig> | null | undefined,
): EngineDataHubCompoundConfig {
  const defaults = defaultEngineDataHubCompoundConfig();
  if (!existing) return defaults;

  const shelfKey = (o: HubShelfOrigin, s: HubShelfStream) => `${o}|${s}`;
  const priorShelves = new Map(
    (existing.shelves ?? []).map((slot) => [shelfKey(slot.origin, slot.stream), slot]),
  );
  const shelves = defaults.shelves.map((slot) => {
    const prior = priorShelves.get(shelfKey(slot.origin, slot.stream));
    if (!prior) return slot;
    return {
      ...slot,
      label: prior.label?.trim() ? prior.label : slot.label,
    };
  });

  const priorOuts = new Map(
    (existing.shelfOutputs ?? []).map((out) => [shelfKey(out.origin, out.stream), out]),
  );
  const shelfOutputs = defaults.shelfOutputs.map((out) => {
    const prior = priorOuts.get(shelfKey(out.origin, out.stream));
    if (!prior) return out;
    return {
      ...out,
      enabled: prior.enabled,
      streamId: prior.streamId?.trim() ? prior.streamId : out.streamId,
      streamDescriptor: prior.streamDescriptor?.trim()
        ? prior.streamDescriptor
        : out.streamDescriptor,
      bus: 'data_out' as const,
    };
  });

  const topicFeed = {
    enabled: existing.topicFeed?.enabled ?? defaults.topicFeed.enabled,
  };

  return { shelves, shelfOutputs, topicFeed };
}
