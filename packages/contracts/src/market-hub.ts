import { z } from 'zod';
import { MarketHubAwarenessAnalysis } from './market-awareness-links';
import { MarketHubAnalyzePhase } from './market-hub-analyze-phase';
import { QualitativeBand } from './system-libraries';
import { SystemNormalizedViewItem } from './verified-normalize';

/**
 * Market posture hub projection (D-081 / D-085 / D-101 / D-120 / D-131).
 * Day quant dashboard + holdings inventory: equity/movers/reports/charts,
 * recommendations (watchlists / trends / pipeline), synthesis Model,
 * positions + capitalSources for the left rail.
 */

export const MarketHubMoversItem = SystemNormalizedViewItem;
export type MarketHubMoversItem = z.infer<typeof MarketHubMoversItem>;

export const MarketHubEngineChip = z.object({
  id: z.string().uuid(),
  label: z.string().max(120),
});
export type MarketHubEngineChip = z.infer<typeof MarketHubEngineChip>;

/**
 * Lightweight provenance chip for a metric / board (D-155).
 * `class` must say how the source verifies: api | library | system | setting.
 */
export const MarketHubSourceChipClass = z.enum(['api', 'library', 'system', 'setting']);
export type MarketHubSourceChipClass = z.infer<typeof MarketHubSourceChipClass>;

export const MarketHubSourceChip = z.object({
  id: z.string().max(40),
  label: z.string().max(40),
  class: MarketHubSourceChipClass,
});
export type MarketHubSourceChip = z.infer<typeof MarketHubSourceChip>;

/**
 * Universal symbol visualization payload (D-109).
 * Seeded by baseline market-awareness (synthetic quote walk + qualitative bands).
 * Held rows set heldVsCost; non-held leave it null so relevance cues may apply.
 */
export const MarketHubSparkPoint = z.object({
  t: z.string().datetime(),
  valueCents: z.string(),
});
export type MarketHubSparkPoint = z.infer<typeof MarketHubSparkPoint>;

export const MarketHubSparkSeries = z.object({
  points: z.array(MarketHubSparkPoint).max(64),
  feedClass: z.enum(['synthetic_sim', 'broker_paper']),
});
export type MarketHubSparkSeries = z.infer<typeof MarketHubSparkSeries>;

export const MarketHubSymbolViz = z.object({
  symbol: z.string().max(12),
  spark: MarketHubSparkSeries,
  /** Algorithm direction (spark endpoints or trend/movers band). */
  direction: z.enum(['up', 'down', 'flat']),
  strengthBand: QualitativeBand,
  /** Non-color strength: 0–3 filled ticks. */
  strengthTicks: z.number().int().min(0).max(3),
  /** Operator relevance / leadership band (orange→lime ticks when not held). */
  relevanceBand: QualitativeBand,
  /**
   * Mark vs avg cost. Non-null ⇒ held P&L color wins; suppress relevance color.
   */
  heldVsCost: z.enum(['up', 'down', 'flat']).nullable(),
  markCents: z.union([z.number().int(), z.string()]).nullable(),
  avgCostCents: z.union([z.number().int(), z.string()]).nullable(),
  unrealizedPnlCents: z.string().nullable(),
});
export type MarketHubSymbolViz = z.infer<typeof MarketHubSymbolViz>;

export const MarketHubChartSlice = z.object({
  id: z.string().max(40),
  label: z.string().max(80),
  /** Share in basis points of the parent series (0–10000). */
  shareBps: z.number().int().min(0).max(10_000),
  /** Optional absolute count or notional cents as string for tooltips. */
  valueLabel: z.string().max(40),
});
export type MarketHubChartSlice = z.infer<typeof MarketHubChartSlice>;

export const MarketHubCharts = z.object({
  allocation: z.array(MarketHubChartSlice).max(24).default([]),
  watchlistTiers: z.array(MarketHubChartSlice).max(12).default([]),
  trendStrength: z.array(MarketHubChartSlice).max(8).default([]),
  moverDirections: z.array(MarketHubChartSlice).max(8).default([]),
  sourceReady: z.array(MarketHubChartSlice).max(8).default([]),
});
export type MarketHubCharts = z.infer<typeof MarketHubCharts>;

export const MarketHubMovers = z.object({
  status: z.enum(['ready', 'missing', 'expired']),
  title: z.string().max(300).nullable(),
  sealId: z.string().max(128).nullable(),
  corroborationBand: QualitativeBand.nullable(),
  items: z.array(MarketHubMoversItem).max(48),
  /** Parallel ticker viz for symbol-bearing movers items (D-109). */
  itemViz: z.array(MarketHubSymbolViz).max(48).default([]),
  verifiedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  reportConceptId: z.string().uuid().nullable(),
  /** Board-level sources that verified this seal (D-155). */
  sourceChips: z.array(MarketHubSourceChip).max(12).default([]),
});
export type MarketHubMovers = z.infer<typeof MarketHubMovers>;

export const MarketHubWatchlistItem = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  moduleName: z.string().max(120),
  moduleType: z.string().max(40).optional(),
  symbol: z.string().max(12),
  bias: z.enum(['long', 'short', 'neutral']),
  note: z.string().max(500),
  sourceClass: z.string().max(40),
  status: z.string().max(40),
  updatedAt: z.string().datetime(),
  engines: z.array(MarketHubEngineChip).max(12).default([]),
  viz: MarketHubSymbolViz.optional(),
  /** Provenance chips — must say api / library / system / setting (D-155). */
  sourceChips: z.array(MarketHubSourceChip).max(8).default([]),
});
export type MarketHubWatchlistItem = z.infer<typeof MarketHubWatchlistItem>;

export const MarketHubTrendCandidate = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  symbol: z.string().max(12),
  direction: z.enum(['up', 'down', 'flat']),
  strengthBand: z.enum(['weak', 'moderate', 'strong']),
  status: z.string().max(40),
  tradingModuleId: z.string().uuid().nullable().optional(),
  engineInstanceId: z.string().uuid().nullable().optional(),
  engines: z.array(MarketHubEngineChip).max(12).default([]),
  scannedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  viz: MarketHubSymbolViz.optional(),
});
export type MarketHubTrendCandidate = z.infer<typeof MarketHubTrendCandidate>;

export const MarketHubPosition = z.object({
  id: z.string().uuid(),
  moduleId: z.string().uuid(),
  moduleName: z.string().max(120),
  moduleType: z.string().max(40).optional(),
  symbol: z.string().max(12),
  qty: z.string(),
  avgCostCents: z.union([z.number().int(), z.string()]),
  markCents: z.union([z.number().int(), z.string()]),
  unrealizedPnlCents: z.string(),
  realizedPnlCents: z.union([z.number().int(), z.string()]).optional(),
  /** Engines whose member modules preside over this holding. */
  engines: z.array(MarketHubEngineChip).max(12).default([]),
  updatedAt: z.string().datetime(),
  viz: MarketHubSymbolViz,
  /** Mark / ledger provenance chips (D-155). */
  sourceChips: z.array(MarketHubSourceChip).max(8).default([]),
});
export type MarketHubPosition = z.infer<typeof MarketHubPosition>;

export const MarketHubLeadStub = z.object({
  id: z.string().uuid(),
  symbol: z.string().max(12),
  status: z.string().max(40),
  direction: z.enum(['up', 'down', 'flat']),
  strategyFamily: z.string().max(120),
  createdAt: z.string().datetime(),
});
export type MarketHubLeadStub = z.infer<typeof MarketHubLeadStub>;

export const MarketHubTreeStub = z.object({
  id: z.string().uuid(),
  leadId: z.string().uuid(),
  symbol: z.string().max(12),
  status: z.string().max(40),
  recoveryLadder: z.array(z.string().max(80)).max(24),
  createdAt: z.string().datetime(),
});
export type MarketHubTreeStub = z.infer<typeof MarketHubTreeStub>;

export const MarketHubPipelineBySymbol = z.object({
  symbol: z.string().max(12),
  lead: MarketHubLeadStub.nullable(),
  tree: MarketHubTreeStub.nullable(),
});
export type MarketHubPipelineBySymbol = z.infer<typeof MarketHubPipelineBySymbol>;

export const MarketHubEquityPoint = z.object({
  t: z.string().datetime(),
  equityCents: z.string(),
  /** Optional selected-position mark path (same timestamps). */
  positionMarkCents: z.string().nullable().optional(),
});
export type MarketHubEquityPoint = z.infer<typeof MarketHubEquityPoint>;

export const MarketHubEquity = z.object({
  status: z.enum(['fresh', 'stale', 'unavailable']),
  equityCents: z.string().nullable(),
  asOfIso: z.string().datetime().nullable(),
  version: z.number().int().nonnegative(),
  /** Company equity (ledger balance-after) time series for chart. */
  series: z.array(MarketHubEquityPoint).max(120),
  /** Ledger / seed provenance (D-155). */
  sourceChips: z.array(MarketHubSourceChip).max(8).default([]),
});
export type MarketHubEquity = z.infer<typeof MarketHubEquity>;

export const MarketHubReportLink = z.object({
  id: z.string().uuid(),
  title: z.string().max(200),
  kind: z.enum([
    'movers_report',
    'sector_bulletin',
    'daily_summary',
    'posture_narrative',
    'other',
  ]),
  /** Seal expiry when known — orientation only. */
  expiresAt: z.string().datetime().nullable().optional(),
});
export type MarketHubReportLink = z.infer<typeof MarketHubReportLink>;

export const MarketHubFreshness = z.object({
  moversExpiresAt: z.string().datetime().nullable(),
  sectorExpiresAt: z.string().datetime().nullable().optional(),
  dailyExpiresAt: z.string().datetime().nullable().optional(),
  fetchedAt: z.string().datetime(),
});
export type MarketHubFreshness = z.infer<typeof MarketHubFreshness>;

/** Latest synthesis run snapshot for Model / overlay awareness (D-120). */
export const MarketHubSynthesisSnapshot = z.object({
  runId: z.string().uuid().nullable(),
  status: z
    .enum(['pending', 'running', 'succeeded', 'failed', 'partial'])
    .nullable(),
  narrativeConceptId: z.string().uuid().nullable(),
  stagesDone: z.number().int().nonnegative().default(0),
  stagesTotal: z.number().int().nonnegative().default(0),
  errorCode: z.string().max(80).nullable().optional(),
});
export type MarketHubSynthesisSnapshot = z.infer<typeof MarketHubSynthesisSnapshot>;

/** Operator-visible provider surfaces for Market posture / movers compound (D-103). */
export const MarketHubSourceRow = z.object({
  kind: z.string().max(40),
  domain: z.string().max(40),
  label: z.string().max(120),
  authMode: z.enum(['none', 'research_key', 'broker_paper']),
  /** Credential-ready (or public) for this company owner. */
  status: z.enum(['ready', 'missing_key']),
  /** True when the latest movers seal included evidence from this kind. */
  contributed: z.boolean().default(false),
});
export type MarketHubSourceRow = z.infer<typeof MarketHubSourceRow>;

export const MarketHubSources = z.object({
  /** Movers-lane kinds: entitled + missing-key honesty. */
  lanes: z.array(MarketHubSourceRow).max(32),
  /** Kinds that contributed on the latest sealed movers scan. */
  contributedKinds: z.array(z.string().max(40)).max(32).default([]),
  /** Position mark path honesty until live broker marks. */
  markFeedClass: z.enum(['synthetic', 'broker_paper']),
  scannedAt: z.string().datetime().nullable(),
});
export type MarketHubSources = z.infer<typeof MarketHubSources>;

/**
 * Company capital inventory for Posture left rail (D-131 / D-138 / D-139).
 * Root funds + execution splits only — not fund_route hop inventory.
 * Amounts are ValueRef-resolved or ledger-derived — never LLM-emitted.
 */
export const MarketHubCapitalSource = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  /** Module row, engine envelope, or synthetic company pool row. */
  entityType: z.enum(['module', 'engine', 'company']),
  moduleType: z.string().max(40).nullable(),
  /**
   * company_pool / holding_fund = company root funds.
   * trading_desk / engine_envelope = execution module splits.
   * fund_router / other kept for parse compat — projector omits routers (D-139).
   */
  kind: z.enum([
    'company_pool',
    'holding_fund',
    'trading_desk',
    'fund_router',
    'engine_envelope',
    'other',
  ]),
  /** company_root = pool + holding funds; execution_split = trading/engine spend. */
  tier: z.enum(['company_root', 'execution_split']),
  /** Orientation label (fund source enum or setup state). */
  sourceLabel: z.string().max(80),
  status: z.enum(['configured', 'draft', 'unavailable']),
  /** Policy / ValueRef id when present — orientation only. */
  allocationRef: z.string().max(120).nullable(),
  /** Resolved allocation in USD cents (string bigint). */
  allocationCents: z.string().nullable(),
  /** Share of company pool when resolvable (0–10000 bps). */
  allocationShareBps: z.number().int().min(0).max(10_000).nullable(),
  allocationStatus: z.enum([
    'resolved',
    'missing_ref',
    'missing_base',
    'unconfigured',
  ]),
  /** Latest module ledger balance-after when scoped. */
  ledgerBalanceCents: z.string().nullable(),
  engineId: z.string().uuid().nullable(),
  engineLabel: z.string().max(120).nullable(),
});
export type MarketHubCapitalSource = z.infer<typeof MarketHubCapitalSource>;

/**
 * Sector / news seal board for day overlay (D-138).
 * Parallel to movers — Analyze reseals stock compound + news lanes together.
 */
export const MarketHubNews = z.object({
  status: z.enum(['ready', 'missing', 'expired']),
  title: z.string().max(300).nullable(),
  sealId: z.string().max(128).nullable(),
  corroborationBand: QualitativeBand.nullable(),
  items: z.array(MarketHubMoversItem).max(48).default([]),
  verifiedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  reportConceptId: z.string().uuid().nullable(),
  /** Board-level sources that verified this seal (D-155). */
  sourceChips: z.array(MarketHubSourceChip).max(12).default([]),
});
export type MarketHubNews = z.infer<typeof MarketHubNews>;

/**
 * MarketModel awareness projection for the day overlay (D-122 / D-131).
 * Orientation only — feedClass honesty, no raw dollars for LLM paths.
 */
export const MarketHubMarketModelAwareness = z.object({
  symbols: z.array(z.string().max(12)).max(64).default([]),
  feedClasses: z.array(z.string().max(40)).max(16).default([]),
  usedLiveCount: z.number().int().min(0),
  syntheticCount: z.number().int().min(0),
  asOfIso: z.string().datetime(),
  notes: z.array(z.string().max(200)).max(8).default([]),
});
export type MarketHubMarketModelAwareness = z.infer<typeof MarketHubMarketModelAwareness>;

/**
 * Synthesis Model hydration graph inputs (D-147).
 * Live hydrators + library shelves that feed Analyze; each row carries an
 * operator-visible operation and amount (counts/status — never LLM dollars).
 */
export const MarketHubModelLiveSource = z.object({
  kind: z.string().max(40),
  label: z.string().max(120),
  domain: z.string().max(40),
  /**
   * stream = continuous market/news feed (Live ingest).
   * query = on-demand search / research API (Process research extension).
   */
  sourceClass: z.enum(['stream', 'query']).default('stream'),
  status: z.enum(['ready', 'missing_key', 'stub', 'researched', 'public']),
  authMode: z.enum(['none', 'research_key', 'broker_paper']),
  canvasBoundCount: z.number().int().nonnegative(),
  contributed: z.boolean(),
  /** e.g. hydrate | idle | need key | stub */
  operation: z.string().max(80),
  /** e.g. "3 canvas · sealed" or "0 bound" */
  amount: z.string().max(40),
  /**
   * Canvas-parity module chrome (D-223) — live sources render as live_api family.
   */
  moduleType: z.literal('live_api').optional(),
  /** Operator subtype chip (kind / venue / feed class). */
  subtypeChip: z.string().max(60).nullable().optional(),
});
export type MarketHubModelLiveSource = z.infer<typeof MarketHubModelLiveSource>;

export const MarketHubModelLibrarySource = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  topicScope: z.string().max(80),
  shelf: z.enum(['system', 'company', 'engine_hub', 'baseline']),
  conceptCount: z.number().int().nonnegative(),
  admittedCount: z.number().int().nonnegative(),
  /** e.g. corpus feed | baseline shelf | hub nest */
  operation: z.string().max(80),
  /** e.g. "12 admitted / 40 concepts" */
  amount: z.string().max(40),
  /** Canvas-parity library module chrome (D-223). */
  moduleType: z.literal('library').optional(),
  /** Shelf / libraryClass chip. */
  subtypeChip: z.string().max(60).nullable().optional(),
  libraryClass: z.string().max(40).nullable().optional(),
});
export type MarketHubModelLibrarySource = z.infer<typeof MarketHubModelLibrarySource>;

export const MarketHubModelStageOp = z.object({
  stageId: z.enum([
    'providers',
    'gather',
    'thresholds',
    'defaults',
    'universe',
    'rs',
    'rank',
    'verify',
    'seal_movers',
    'sector',
    'daily',
    'narrative',
    'hub_ready',
  ]),
  operation: z.string().max(80),
  amount: z.string().max(40),
});
export type MarketHubModelStageOp = z.infer<typeof MarketHubModelStageOp>;

/**
 * Per-API / library processing flow for the synthesis Model (D-156).
 * Each service has its own adapter path into specific analysis stages —
 * not a dump into a single aggregator.
 */
export const MarketHubModelProcessingFlow = z.object({
  /** Stable flow id (e.g. alpaca_bars:ohlc, gdelt_news:headline). */
  id: z.string().max(80),
  /** ResearchSourceKind or library:{uuid}. */
  kind: z.string().max(80),
  /** Human adapter name (GDELT headline gather, Alpaca OHLC fetch, …). */
  adapterLabel: z.string().max(120),
  /** Roles this adapter plays (news_corpus, relative_strength, …). */
  analysisRoles: z.array(z.string().max(40)).max(8).default([]),
  operation: z.string().max(80),
  amount: z.string().max(40),
  /**
   * Route-specific process chain this adapter owns (D-162).
   * e.g. news_headline, bars_ohlc — granular steps live on processSteps[].
   */
  route: z.string().max(40).optional(),
  /** Ordered process step ids for this flow (D-162). */
  processStepIds: z.array(z.string().max(80)).max(12).default([]),
  /** Pipeline stages this flow feeds (milestones after route steps). */
  targetStages: z
    .array(
      z.enum([
        'providers',
        'gather',
        'thresholds',
        'defaults',
        'universe',
        'rs',
        'rank',
        'verify',
        'seal_movers',
        'sector',
        'daily',
        'narrative',
        'hub_ready',
      ]),
    )
    .max(12),
  /** Which Analyze jobs consume this flow. */
  pipelines: z.array(z.enum(['movers', 'sector'])).max(4),
  /** Live source readiness for this kind when known. */
  status: z
    .enum(['ready', 'missing_key', 'stub', 'researched', 'public', 'idle'])
    .default('idle'),
  contributed: z.boolean().default(false),
});
export type MarketHubModelProcessingFlow = z.infer<typeof MarketHubModelProcessingFlow>;

/**
 * Granular route process step for the synthesis Model (D-162 / D-169).
 * Replaces generic gather/rs/rank blobs with route-specific processing nodes.
 */
export const MarketHubModelProcessFunction = z.enum([
  'fetch',
  'normalize',
  'extract',
  'corroborate',
  'entitle',
  'announce',
  'score',
  'rank',
  'verify',
  'seal',
  'compose',
  'load',
  'defaults',
  'thresholds',
  'context',
  /** Pre-library analysis module (organize / route / score). */
  'organize',
  'route',
  'analyze',
  /** Research ENGINE article pipeline (live → library articles). */
  'gather',
  'validate',
  'synthesize',
  'admit',
]);
export type MarketHubModelProcessFunction = z.infer<typeof MarketHubModelProcessFunction>;

/**
 * Canvas research module projected onto the synthesis Model (D-214 / D-223).
 * One row per research module (desk specialty, filings, regime lab, …) — same
 * module type, different config (`researchSubtype`). Live APIs feed
 * gather→validate→synthesize→admit → library articles.
 */
export const MarketHubModelResearchEngine = z.object({
  id: z.string().uuid(),
  label: z.string().max(120),
  status: z.enum(['active', 'paused', 'error', 'draft']),
  /** Always research — Model chrome uses MODULE_VISUALS.research (D-223). */
  moduleType: z.literal('research').default('research'),
  /** Config subtype (specialty_desk, external_filings, microstructure_context, …). */
  researchSubtype: z.string().max(40).nullable().optional(),
  /** Operator-visible chip (humanized subtype). */
  subtypeChip: z.string().max(60).nullable().optional(),
  /** Owning ENGINE instance when this module is an engine member. */
  engineInstanceId: z.string().uuid().nullable().optional(),
  /** Bound corpus shelves (hub / company libraries). */
  boundLibraryIds: z.array(z.string().uuid()).max(16).default([]),
  /** Live source kinds that feed this engine (same ENGINE or company contrib). */
  liveSourceKinds: z.array(z.string().max(40)).max(32).default([]),
  topicCount: z.number().int().nonnegative().default(0),
  articleCount: z.number().int().nonnegative().default(0),
  operation: z.string().max(80),
  amount: z.string().max(40),
});
export type MarketHubModelResearchEngine = z.infer<typeof MarketHubModelResearchEngine>;

/**
 * Non-research canvas modules on the Model strip (D-223).
 * Same PreviewModule-style chrome as desk research — type + config chip.
 */
export const MarketHubModelScopedModule = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  moduleType: z.string().max(40),
  subtypeChip: z.string().max(60).nullable(),
  engineInstanceId: z.string().uuid().nullable().optional(),
  stageScreenId: z.enum(['capital', 'live', 'library', 'process', 'outlook', 'day']),
  operation: z.string().max(80),
  amount: z.string().max(40),
  status: z.enum(['active', 'paused', 'error', 'draft']),
});
export type MarketHubModelScopedModule = z.infer<typeof MarketHubModelScopedModule>;

export const MarketHubModelProcessStep = z.object({
  /** Stable id (e.g. gdelt_news:tickers, compound:rank_sort). */
  id: z.string().max(80),
  /** Route family (news_headline, bars_ohlc, universe_build, …). */
  route: z.string().max(40),
  label: z.string().max(120),
  operation: z.string().max(80),
  amount: z.string().max(40),
  analysisRole: z.string().max(40),
  /**
   * Function class for Model chrome (D-169) — fetch vs normalize vs score, etc.
   */
  processFunction: MarketHubModelProcessFunction.default('fetch'),
  sortOrder: z.number().int().nonnegative(),
  /** Owning live kind or library:{id} or "shared". */
  kind: z.string().max(80),
  pipelines: z.array(z.enum(['movers', 'sector', 'daily', 'compose'])).max(4),
  /** Milestone stages this step ultimately feeds. */
  feedStages: z
    .array(
      z.enum([
        'providers',
        'gather',
        'thresholds',
        'defaults',
        'universe',
        'rs',
        'rank',
        'verify',
        'seal_movers',
        'sector',
        'daily',
        'narrative',
        'hub_ready',
      ]),
    )
    .max(8)
    .default([]),
  status: z
    .enum(['ready', 'missing_key', 'stub', 'researched', 'public', 'idle'])
    .default('idle'),
});
export type MarketHubModelProcessStep = z.infer<typeof MarketHubModelProcessStep>;

/**
 * Operator panel surface hydrated from synthesis / hub boards (D-161 / D-179).
 */
export const MarketHubModelPanelSurface = z.object({
  id: z.enum([
    'equity',
    'movers',
    'news',
    'positions',
    'watchlists',
    'capital',
    'reports',
    'charts',
    /** Linkage hybrid Posture levels (D-175 / D-179). */
    'awareness_evidence',
    'awareness_links',
    'awareness_trends',
    'awareness_recommendations',
  ]),
  label: z.string().max(80),
  /** Where the operator reads this surface. */
  panel: z.enum(['rail', 'overlay', 'both']),
  status: z.string().max(40),
  operation: z.string().max(80),
  amount: z.string().max(40),
  /** Pipeline stage that last sealed / projected this board. */
  sourceStageId: z
    .enum([
      'providers',
      'gather',
      'thresholds',
      'defaults',
      'universe',
      'rs',
      'rank',
      'verify',
      'seal_movers',
      'sector',
      'daily',
      'narrative',
      'hub_ready',
    ])
    .nullable()
    .default(null),
  /**
   * Extra stages that emit metrics into this surface mid-pipeline (D-179).
   * Model draws dashed `emit` edges from these in addition to sourceStageId.
   */
  emitFromStages: z
    .array(
      z.enum([
        'providers',
        'gather',
        'thresholds',
        'defaults',
        'universe',
        'rs',
        'rank',
        'verify',
        'seal_movers',
        'sector',
        'daily',
        'narrative',
        'hub_ready',
      ]),
    )
    .max(8)
    .default([]),
  /** Prefer emit edges from process nodes with these processFunction values. */
  emitFromFunctions: z.array(MarketHubModelProcessFunction).max(8).default([]),
  updatedAt: z.string().datetime().nullable(),
  /**
   * When true, Model node emphasizes amount as an operator capital readout (D-163).
   * Amounts are hub-resolved display strings (never LLM-authored dollars).
   */
  capitalBearing: z.boolean().default(false),
});
export type MarketHubModelPanelSurface = z.infer<typeof MarketHubModelPanelSurface>;

/**
 * Capital fund row projected onto the Model as a data-source node (D-163).
 * Amount is a display string from resolved cents — not for LLM prompts.
 */
export const MarketHubModelCapitalSource = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  tier: z.enum(['company_root', 'execution_split']),
  kind: z.string().max(40),
  operation: z.string().max(80),
  /** Formatted allocation / ledger readout for inline Model display. */
  amount: z.string().max(40),
  status: z.enum(['configured', 'draft', 'unavailable']),
  /** Canvas module type for Model chrome (holding_fund / trading / null pool). */
  moduleType: z.string().max(40).nullable().optional(),
  subtypeChip: z.string().max(60).nullable().optional(),
});
export type MarketHubModelCapitalSource = z.infer<typeof MarketHubModelCapitalSource>;

export const MarketHubModelHydration = z.object({
  liveSources: z.array(MarketHubModelLiveSource).max(64).default([]),
  librarySources: z.array(MarketHubModelLibrarySource).max(64).default([]),
  /**
   * Research modules that turn live API evidence into library articles (D-214 / D-223).
   * One entry per research module (desk specialty vs filings vs niche — same type,
   * different config). Strip shows gather→validate→synthesize→admit beside shelves.
   */
  researchEngines: z.array(MarketHubModelResearchEngine).max(32).default([]),
  /**
   * Other canvas-scoped modules (librarian, trend, trading, analyzer, …) for
   * section chrome (D-223). Same module node design; config drives subtype chip.
   */
  scopedModules: z.array(MarketHubModelScopedModule).max(64).default([]),
  /**
   * Capital-bearing fund rows shown as Model data sources (D-163).
   * Filtered to configured / draft with resolvable amounts when present.
   */
  capitalSources: z.array(MarketHubModelCapitalSource).max(32).default([]),
  /** Per-service adapter → analysis stage flows (D-156). */
  processingFlows: z.array(MarketHubModelProcessingFlow).max(64).default([]),
  /**
   * Route-granular process steps (D-162) — news/bars/macro/library/compound
   * chains, not generic gather/rs/rank blobs.
   */
  processSteps: z.array(MarketHubModelProcessStep).max(128).default([]),
  stageOps: z.array(MarketHubModelStageOp).max(32).default([]),
  totals: z.object({
    liveReady: z.number().int().nonnegative(),
    liveTotal: z.number().int().nonnegative(),
    libraryCount: z.number().int().nonnegative(),
    admittedConcepts: z.number().int().nonnegative(),
    contributedKinds: z.number().int().nonnegative(),
    usedLiveMarks: z.number().int().nonnegative(),
    syntheticMarks: z.number().int().nonnegative(),
  }),
  /**
   * Projection clock for Model refresh/pulse (D-160).
   * Hub GET time — client compares across Sync/Analyze to pulse edges.
   */
  asOfIso: z.string().datetime(),
  /**
   * Silent live-poll patch clock (D-161). Updates panel surfaces / mark-linked
   * stageOps without bumping asOfIso (avoids full Sync pulse storms).
   */
  livePatchedAt: z.string().datetime().nullable().optional(),
  /** Seal freshness stamps for track stale/active styling (D-160). */
  sealStamps: z
    .object({
      moversVerifiedAt: z.string().datetime().nullable(),
      moversExpiresAt: z.string().datetime().nullable(),
      newsVerifiedAt: z.string().datetime().nullable(),
      newsExpiresAt: z.string().datetime().nullable(),
      dailyExpiresAt: z.string().datetime().nullable(),
    })
    .default({
      moversVerifiedAt: null,
      moversExpiresAt: null,
      newsVerifiedAt: null,
      newsExpiresAt: null,
      dailyExpiresAt: null,
    }),
  /**
   * Panel board projections the Model hydrates into (D-161).
   * Left rail + overlay day surfaces — amounts/status mirror hub boards.
   */
  panelSurfaces: z.array(MarketHubModelPanelSurface).max(16).default([]),
});
export type MarketHubModelHydration = z.infer<typeof MarketHubModelHydration>;

export const MarketHubResponse = z.object({
  sectorFocuses: z.array(z.string().max(80)).max(64).default([]),
  universeExcludes: z.array(z.string().max(12)).max(200).default([]),
  equity: MarketHubEquity,
  movers: MarketHubMovers,
  /**
   * Multi-level linkage analysis for expanded Posture window (D-175).
   * Evidence → Links → Trends → Recommendations; Model is secondary.
   */
  awarenessAnalysis: MarketHubAwarenessAnalysis.optional(),
  reports: z.array(MarketHubReportLink).max(24).default([]),
  watchlists: z.array(MarketHubWatchlistItem).max(200),
  trendCandidates: z.array(MarketHubTrendCandidate).max(50),
  positions: z.array(MarketHubPosition).max(100),
  pipeline: z.array(MarketHubPipelineBySymbol).max(100),
  /** Holding funds / routers / engines / desks with resolved amounts (D-138). */
  capitalSources: z.array(MarketHubCapitalSource).max(64).default([]),
  /** Sector news seal board — stock movers live under `movers` (D-138). */
  news: MarketHubNews.default({
    status: 'missing',
    title: null,
    sealId: null,
    corroborationBand: null,
    items: [],
    verifiedAt: null,
    expiresAt: null,
    reportConceptId: null,
    sourceChips: [],
  }),
  freshness: MarketHubFreshness,
  /** Latest Analyze synthesis run for Model awareness dock (D-120). */
  synthesis: MarketHubSynthesisSnapshot.optional(),
  /**
   * Shared MarketModel substrate for day overlay (D-122 Phase 2).
   * Same quote path as paper dispatch / exits — posture hub consumer.
   */
  marketModelAwareness: MarketHubMarketModelAwareness.optional(),
  /**
   * Baseline live + library sources for the synthesis Model graph (D-147).
   * Each node on the Model shows operation + amount from this projection.
   */
  modelHydration: MarketHubModelHydration.optional(),
  sources: MarketHubSources.default({
    lanes: [],
    contributedKinds: [],
    markFeedClass: 'synthetic',
    scannedAt: null,
  }),
  charts: MarketHubCharts.default({
    allocation: [],
    watchlistTiers: [],
    trendStrength: [],
    moverDirections: [],
    sourceReady: [],
  }),
});
export type MarketHubResponse = z.infer<typeof MarketHubResponse>;

export const MarketHubRefreshResponse = z.object({
  enqueued: z.boolean(),
  kind: z.literal('library.system_movers'),
  drained: z
    .object({
      claimed: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      deadlineHit: z.boolean(),
    })
    .optional(),
  drainError: z.string().optional(),
});
export type MarketHubRefreshResponse = z.infer<typeof MarketHubRefreshResponse>;

/**
 * Master Analyze — full posture pass with LLM threshold proposal (D-111).
 * Distinct from hub Sync (GET-only live projection).
 */
export const MarketHubAnalyzeJobKind = z.enum([
  'library.system_movers',
  'library.system_sector_news',
  'library.system_daily_summaries',
  'library.posture_narrative',
]);
export type MarketHubAnalyzeJobKind = z.infer<typeof MarketHubAnalyzeJobKind>;

export const MarketHubAnalyzeResponse = z.object({
  enqueued: z.boolean(),
  /** Durable synthesis run for live Model canvas (D-120). */
  runId: z.string().uuid(),
  /**
   * Current-moment analyze cadence slot (D-181) — resolved from injectable clock +
   * XNYS session; drives daily seal subject key and narrative emphasis.
   */
  analyzePhase: MarketHubAnalyzePhase.optional(),
  /** Human label for the resolved analyzePhase (UI chrome). */
  analyzePhaseLabel: z.string().max(40).optional(),
  /** Venue-local ISO orientation timestamp used for phase resolution. */
  asOfIso: z.string().datetime().optional(),
  jobs: z
    .array(
      z.object({
        kind: MarketHubAnalyzeJobKind,
        forceReseal: z.boolean().optional(),
      }),
    )
    .max(8),
  /** Tactical LLM threshold proposal runs inside system_movers when gateway entitled. */
  llmStage: z.literal('suggestion_threshold_profile'),
  drained: z
    .object({
      claimed: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      deadlineHit: z.boolean(),
    })
    .optional(),
  drainError: z.string().optional(),
});
export type MarketHubAnalyzeResponse = z.infer<typeof MarketHubAnalyzeResponse>;

/**
 * Lightweight live projection (D-112) — equity + position marks only.
 * Polled silently; does not replace seals, reports, charts, or Model canvas.
 */
export const MarketHubLivePosition = z.object({
  id: z.string().uuid(),
  symbol: z.string().max(12),
  qty: z.string(),
  avgCostCents: z.union([z.number().int(), z.string()]),
  markCents: z.union([z.number().int(), z.string()]),
  unrealizedPnlCents: z.string(),
  viz: MarketHubSymbolViz,
});
export type MarketHubLivePosition = z.infer<typeof MarketHubLivePosition>;

export const MarketHubLiveResponse = z.object({
  fetchedAt: z.string().datetime(),
  equity: MarketHubEquity,
  positions: z.array(MarketHubLivePosition).max(100),
});
export type MarketHubLiveResponse = z.infer<typeof MarketHubLiveResponse>;
