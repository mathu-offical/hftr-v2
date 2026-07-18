import { z } from 'zod';
import { QualitativeBand } from './system-libraries';
import { SystemNormalizedViewItem } from './verified-normalize';

/**
 * Market posture hub projection (D-081 / D-085 / D-101).
 * Live operating dashboard: equity series, movers, positions with engine chips,
 * watchlists / trends / pipeline categories, and report navigation targets.
 */

export const MarketHubMoversItem = SystemNormalizedViewItem;
export type MarketHubMoversItem = z.infer<typeof MarketHubMoversItem>;

export const MarketHubEngineChip = z.object({
  id: z.string().uuid(),
  label: z.string().max(120),
});
export type MarketHubEngineChip = z.infer<typeof MarketHubEngineChip>;

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

export const MarketHubResponse = z.object({
  sectorFocuses: z.array(z.string().max(80)).max(64).default([]),
  universeExcludes: z.array(z.string().max(12)).max(200).default([]),
  equity: MarketHubEquity,
  movers: MarketHubMovers,
  reports: z.array(MarketHubReportLink).max(24).default([]),
  watchlists: z.array(MarketHubWatchlistItem).max(200),
  trendCandidates: z.array(MarketHubTrendCandidate).max(50),
  positions: z.array(MarketHubPosition).max(100),
  pipeline: z.array(MarketHubPipelineBySymbol).max(100),
  freshness: MarketHubFreshness,
  /** Latest Analyze synthesis run for Model awareness dock (D-120). */
  synthesis: MarketHubSynthesisSnapshot.optional(),
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
