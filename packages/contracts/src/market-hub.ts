import { z } from 'zod';
import { QualitativeBand } from './system-libraries';
import { SystemNormalizedViewItem } from './verified-normalize';

/**
 * Market posture hub projection (D-081).
 * Left-panel live operating awareness: movers seal, watchlists, trend candidates,
 * positions, and pipeline continuation/exit stubs. Facts only — no LLM narrative.
 */

export const MarketHubMoversItem = SystemNormalizedViewItem;
export type MarketHubMoversItem = z.infer<typeof MarketHubMoversItem>;

export const MarketHubMovers = z.object({
  status: z.enum(['ready', 'missing', 'expired']),
  title: z.string().max(300).nullable(),
  sealId: z.string().max(128).nullable(),
  corroborationBand: QualitativeBand.nullable(),
  items: z.array(MarketHubMoversItem).max(48),
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
  scannedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type MarketHubTrendCandidate = z.infer<typeof MarketHubTrendCandidate>;

export const MarketHubPosition = z.object({
  id: z.string().uuid(),
  symbol: z.string().max(12),
  qty: z.string(),
  avgCostCents: z.union([z.number().int(), z.string()]),
  markCents: z.union([z.number().int(), z.string()]),
  unrealizedPnlCents: z.string(),
  realizedPnlCents: z.union([z.number().int(), z.string()]).optional(),
  updatedAt: z.string().datetime(),
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

export const MarketHubFreshness = z.object({
  moversExpiresAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
});
export type MarketHubFreshness = z.infer<typeof MarketHubFreshness>;

export const MarketHubResponse = z.object({
  movers: MarketHubMovers,
  watchlists: z.array(MarketHubWatchlistItem).max(200),
  trendCandidates: z.array(MarketHubTrendCandidate).max(50),
  positions: z.array(MarketHubPosition).max(100),
  pipeline: z.array(MarketHubPipelineBySymbol).max(100),
  freshness: MarketHubFreshness,
});
export type MarketHubResponse = z.infer<typeof MarketHubResponse>;

export const MarketHubRefreshResponse = z.object({
  enqueued: z.boolean(),
  kind: z.literal('library.system_movers'),
});
export type MarketHubRefreshResponse = z.infer<typeof MarketHubRefreshResponse>;
