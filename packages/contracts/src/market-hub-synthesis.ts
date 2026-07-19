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

/**
 * Vertical bands on the Model canvas (D-160).
 * sources → adapters → pipeline → output.
 */
export const MarketHubModelLayer = z.enum([
  'sources',
  'adapters',
  'pipeline',
  'output',
]);
export type MarketHubModelLayer = z.infer<typeof MarketHubModelLayer>;

/**
 * Horizontal analysis tracks (D-160).
 * Distinct data-handling lanes through the synthesis DAG.
 */
export const MarketHubModelTrack = z.enum([
  'entitle',
  'compound',
  'sector',
  'daily',
  'compose',
]);
export type MarketHubModelTrack = z.infer<typeof MarketHubModelTrack>;

/** Connection semantic type for Model edges (D-160). */
export const MarketHubModelEdgeType = z.enum([
  'hydrate',
  'adapt',
  'pipeline',
  'entitle',
  'corpus',
  'parallel',
]);
export type MarketHubModelEdgeType = z.infer<typeof MarketHubModelEdgeType>;

/** Live transfer state on a Model edge (D-160). */
export const MarketHubModelEdgeActivation = z.enum([
  'idle',
  'armed',
  'active',
  'pulsing',
  'blocked',
  'stale',
]);
export type MarketHubModelEdgeActivation = z.infer<typeof MarketHubModelEdgeActivation>;

/** Outcome / readiness status for a Model edge (D-160). */
export const MarketHubModelEdgeStatus = z.enum([
  'idle',
  'ready',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'blocked',
]);
export type MarketHubModelEdgeStatus = z.infer<typeof MarketHubModelEdgeStatus>;

/** Default labels/kinds/track/layer for seed + UI when a stage row is missing. */
export const MARKET_HUB_SYNTHESIS_STAGE_META: Record<
  MarketHubSynthesisStageId,
  {
    label: string;
    kind: MarketHubSynthesisStageKind;
    track: MarketHubModelTrack;
    layer: MarketHubModelLayer;
    /** One-line data-handling role for inspector / stageOps. */
    dataRole: string;
  }
> = {
  providers: {
    label: 'Provider surfaces',
    kind: 'data',
    track: 'entitle',
    layer: 'pipeline',
    dataRole: 'Entitle ready lanes; no payload merge',
  },
  gather: {
    label: 'Gather evidence',
    kind: 'data',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'Pull entitled packages into evidence bag',
  },
  thresholds: {
    label: 'Threshold profile',
    kind: 'llm',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'LLM integer presets only (no dollars)',
  },
  defaults: {
    label: 'Typical defaults',
    kind: 'deterministic',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'Fail-closed typical bands when LLM absent',
  },
  universe: {
    label: 'Universe build',
    kind: 'deterministic',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'Seed tickers from news + book + watch',
  },
  rs: {
    label: 'Rel-strength / volume',
    kind: 'deterministic',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'OHLC marks → RS / volume expansion scores',
  },
  rank: {
    label: 'Compound score',
    kind: 'deterministic',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'Rank board from RS + corroboration + corpus',
  },
  verify: {
    label: 'Verify gates',
    kind: 'deterministic',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'Promote / hold gates before seal',
  },
  seal_movers: {
    label: 'Seal movers board',
    kind: 'deterministic',
    track: 'compound',
    layer: 'pipeline',
    dataRole: 'Persist movers seal + contributing kinds',
  },
  sector: {
    label: 'Sector bulletin',
    kind: 'deterministic',
    track: 'sector',
    layer: 'pipeline',
    dataRole: 'Parallel news/sector seal from headline lanes',
  },
  daily: {
    label: 'Daily summary phase',
    kind: 'deterministic',
    track: 'daily',
    layer: 'pipeline',
    dataRole: 'Calendar-phase daily summary seal',
  },
  narrative: {
    label: 'Posture narrative',
    kind: 'llm',
    track: 'compose',
    layer: 'pipeline',
    dataRole: 'Book↔tape rollup after seals terminal',
  },
  hub_ready: {
    label: 'Market hub ready',
    kind: 'output',
    track: 'compose',
    layer: 'output',
    dataRole: 'Project hub boards from seals + narrative',
  },
};

export const MARKET_HUB_MODEL_TRACK_META: Record<
  MarketHubModelTrack,
  { label: string; summary: string }
> = {
  entitle: { label: 'Entitle', summary: 'Provider readiness rollup' },
  compound: { label: 'Compound', summary: 'Movers gather → RS → seal' },
  sector: { label: 'Sector', summary: 'News / sector bulletin lane' },
  daily: { label: 'Daily', summary: 'Calendar-phase summary lane' },
  compose: { label: 'Compose', summary: 'Narrative → hub projection' },
};
