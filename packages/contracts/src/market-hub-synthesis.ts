/**
 * Market posture synthesis run + stages (D-120).
 * Live Model canvas polls these; stages do not 1:1 map to queue job kinds.
 */

import { z } from 'zod';

/** Stable stage keys — must match Model graph node ids. */
export const MarketHubSynthesisStageId = z.enum([
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
]);
export type MarketHubSynthesisStageId = z.infer<typeof MarketHubSynthesisStageId>;

export const MARKET_HUB_SYNTHESIS_STAGE_ORDER: readonly MarketHubSynthesisStageId[] = [
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
] as const;

export const MarketHubSynthesisStageKind = z.enum([
  'data',
  'llm',
  'deterministic',
  'output',
]);
export type MarketHubSynthesisStageKind = z.infer<typeof MarketHubSynthesisStageKind>;

export const MarketHubSynthesisStageStatus = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export type MarketHubSynthesisStageStatus = z.infer<typeof MarketHubSynthesisStageStatus>;

export const MarketHubSynthesisRunStatus = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'partial',
]);
export type MarketHubSynthesisRunStatus = z.infer<typeof MarketHubSynthesisRunStatus>;

export const MarketHubSynthesisStage = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  stageId: MarketHubSynthesisStageId,
  label: z.string().max(120),
  kind: MarketHubSynthesisStageKind,
  status: MarketHubSynthesisStageStatus,
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  /** Operator-facing text/bands only — never raw financial digits from LLM. */
  summary: z.string().max(2000).nullable(),
  justificationLines: z.array(z.string().max(400)).max(12).default([]),
  jobId: z.string().uuid().nullable(),
  sortOrder: z.number().int().nonnegative(),
});
export type MarketHubSynthesisStage = z.infer<typeof MarketHubSynthesisStage>;

export const MarketHubSynthesisRun = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  status: MarketHubSynthesisRunStatus,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  errorCode: z.string().max(80).nullable(),
  stages: z.array(MarketHubSynthesisStage).max(32),
});
export type MarketHubSynthesisRun = z.infer<typeof MarketHubSynthesisRun>;

export const MarketHubSynthesisRunResponse = MarketHubSynthesisRun;
export type MarketHubSynthesisRunResponse = MarketHubSynthesisRun;

/** Default labels/kinds for seed + UI when a stage row is missing. */
export const MARKET_HUB_SYNTHESIS_STAGE_META: Record<
  MarketHubSynthesisStageId,
  { label: string; kind: MarketHubSynthesisStageKind }
> = {
  providers: { label: 'Provider surfaces', kind: 'data' },
  gather: { label: 'Gather evidence', kind: 'data' },
  thresholds: { label: 'Threshold profile', kind: 'llm' },
  defaults: { label: 'Typical defaults', kind: 'deterministic' },
  universe: { label: 'Universe build', kind: 'deterministic' },
  rs: { label: 'Rel-strength / volume', kind: 'deterministic' },
  rank: { label: 'Compound score', kind: 'deterministic' },
  verify: { label: 'Verify gates', kind: 'deterministic' },
  seal_movers: { label: 'Seal movers board', kind: 'deterministic' },
  sector: { label: 'Sector bulletin', kind: 'deterministic' },
  daily: { label: 'Daily summary phase', kind: 'deterministic' },
  narrative: { label: 'Posture narrative', kind: 'llm' },
  hub_ready: { label: 'Market hub ready', kind: 'output' },
};
