import { z } from 'zod';

/**
 * Operator analyze cadence slots (D-181 / D-183) — wall-clock / session-aware.
 * Distinct from calendar SessionPhase (dispatch/RTH).
 */
export const MarketHubAnalyzePhase = z.enum([
  /** Deep overnight: Asia/Europe tape + overnight news. */
  'overnight',
  /** Early morning: previous night summary. */
  'wake_up',
  /** Pre-bell: morning news, other time zones, condition data. */
  'pre_market',
  /** First minutes of RTH: open print / gap reaction. */
  'open_bell',
  /** Early RTH: initial movements after open. */
  'mid_morning',
  /** Session mid: progress check-in + strategy alignment. */
  'midday',
  /** Late session: pre-close exits + pre-close analysis. */
  'afternoon',
  /** Last hour RTH: power-hour liquidity / exit pressure. */
  'power_hour',
  /** Around/after bell: full day summary. */
  'market_close',
  /** Evening: news grounded in market-day movements. */
  'evening',
]);
export type MarketHubAnalyzePhase = z.infer<typeof MarketHubAnalyzePhase>;

export const MARKET_HUB_ANALYZE_PHASES = MarketHubAnalyzePhase.options;

/** Gather / emphasis bias for timing-tailored analysis (D-183). */
export const AnalyzePhaseGatherBias = z.enum([
  'overnight_tape',
  'prior_session',
  'condition_data',
  'open_reaction',
  'initial_moves',
  'strategy_align',
  'pre_close',
  'power_hour',
  'day_rollup',
  'post_session_news',
]);
export type AnalyzePhaseGatherBias = z.infer<typeof AnalyzePhaseGatherBias>;

export const MARKET_HUB_ANALYZE_PHASE_META: Record<
  MarketHubAnalyzePhase,
  {
    label: string;
    summary: string;
    /** America/New_York schedule trigger */
    etCron: string;
    gatherBias: AnalyzePhaseGatherBias;
    /** Qualitative focus areas for report / narrative copy. */
    focusAreas: readonly string[];
    /** Preferred gather query fragments (no digits). */
    queryHints: readonly string[];
  }
> = {
  overnight: {
    label: 'Overnight',
    summary: 'Asia/Europe session spillover and overnight news flow',
    etCron: 'et:22:00',
    gatherBias: 'overnight_tape',
    focusAreas: ['asia europe cross-session', 'overnight headlines', 'FX crypto macro'],
    queryHints: ['overnight markets asia europe', 'cross session spillover', 'fx crypto overnight'],
  },
  wake_up: {
    label: 'Wake-up',
    summary: 'Previous night summary and overnight orientation',
    etCron: 'et:05:00',
    gatherBias: 'prior_session',
    focusAreas: ['prior close themes', 'overnight gap context', 'macro calendar'],
    queryHints: ['overnight summary prior session', 'pre market gap context', 'macro calendar'],
  },
  pre_market: {
    label: 'Pre-market',
    summary: 'Morning news, other time zones, market-condition data',
    etCron: 'et:07:30',
    gatherBias: 'condition_data',
    focusAreas: ['premarket news', 'sector conditions', 'global futures tone'],
    queryHints: ['premarket news sector conditions', 'global futures tone', 'morning brief'],
  },
  open_bell: {
    label: 'Open bell',
    summary: 'Open print, gap reaction, and first liquidity pulse',
    etCron: 'et:09:35',
    gatherBias: 'open_reaction',
    focusAreas: ['open auction', 'gap follow-through', 'first prints leadership'],
    queryHints: ['market open gap reaction', 'opening range leadership', 'first hour tape'],
  },
  mid_morning: {
    label: 'Mid-morning',
    summary: 'Initial RTH movements and leadership tape',
    etCron: 'et:10:30',
    gatherBias: 'initial_moves',
    focusAreas: ['relative strength', 'volume expansion', 'news-linked movers'],
    queryHints: ['mid morning movers relative strength', 'volume expansion leadership'],
  },
  midday: {
    label: 'Midday',
    summary: 'Progress check-in and strategy alignment',
    etCron: 'et:12:00',
    gatherBias: 'strategy_align',
    focusAreas: ['book vs tape', 'watchlist alignment', 'sector rotation'],
    queryHints: ['midday sector rotation', 'strategy alignment watchlist', 'leadership continuity'],
  },
  afternoon: {
    label: 'Afternoon',
    summary: 'Pre-close exit strategies and pre-close analysis',
    etCron: 'et:14:00',
    gatherBias: 'pre_close',
    focusAreas: ['exit readiness', 'late session risk', 'held-name stress'],
    queryHints: ['afternoon pre close risk', 'exit readiness late session'],
  },
  power_hour: {
    label: 'Power hour',
    summary: 'Final-hour liquidity, rebalancing, and exit pressure',
    etCron: 'et:15:05',
    gatherBias: 'power_hour',
    focusAreas: ['power hour liquidity', 'rebalance flows', 'close positioning'],
    queryHints: ['power hour liquidity', 'closing auction positioning', 'rebalance flows'],
  },
  market_close: {
    label: 'Market close',
    summary: 'Full day summary at/near the bell',
    etCron: 'et:16:05',
    gatherBias: 'day_rollup',
    focusAreas: ['full day leadership', 'breadth vs concentration', 'session outcome'],
    queryHints: ['market close day summary', 'session leadership breadth'],
  },
  evening: {
    label: 'Evening',
    summary: 'Additional news grounded in market-day movements',
    etCron: 'et:18:30',
    gatherBias: 'post_session_news',
    focusAreas: ['after-hours news', 'day move follow-ups', 'next-session setup'],
    queryHints: ['after hours news day movers', 'evening market wrap', 'next session setup'],
  },
};

/** Seal subject key for a phase (daily_summary_phase kind). */
export function analyzePhaseSubjectKey(phase: MarketHubAnalyzePhase): string {
  return `phase_${phase}`;
}

/**
 * Accept legacy D-070 / D-181 tags and map onto the current analyze cadence.
 */
export function normalizeAnalyzePhase(raw: string | undefined | null): MarketHubAnalyzePhase | null {
  if (!raw) return null;
  const parsed = MarketHubAnalyzePhase.safeParse(raw);
  if (parsed.success) return parsed.data;
  switch (raw) {
    case 'pre_open':
      return 'pre_market';
    case 'midday':
      return 'midday';
    case 'close':
      return 'market_close';
    case 'post_analysis':
      return 'evening';
    default:
      return null;
  }
}

/** Build phase-biased movers gather query text (model-free, no digits). */
export function analyzePhaseQueryText(phase: MarketHubAnalyzePhase): string {
  const meta = MARKET_HUB_ANALYZE_PHASE_META[phase];
  return ['cross sectional leadership movers', ...meta.queryHints].join(' ');
}
