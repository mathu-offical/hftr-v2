import { describe, expect, it } from 'vitest';
import { dailySummaryPhaseFromSession } from '../handlers/library-system-daily-summaries';
import { normalizeAnalyzePhase } from '@hftr/contracts';

describe('dailySummaryPhaseFromSession (legacy → D-181)', () => {
  it('maps SessionPhase onto seven-slot analyze cadence', () => {
    expect(dailySummaryPhaseFromSession('pre_market')).toBe('pre_market');
    expect(dailySummaryPhaseFromSession('open')).toBe('mid_morning');
    expect(dailySummaryPhaseFromSession('midday')).toBe('midday');
    expect(dailySummaryPhaseFromSession('power_hour')).toBe('market_close');
    expect(dailySummaryPhaseFromSession('closed')).toBe('evening');
    expect(dailySummaryPhaseFromSession('overnight')).toBe('evening');
  });
});

describe('normalizeAnalyzePhase', () => {
  it('accepts new slots and remaps legacy four-slot tags', () => {
    expect(normalizeAnalyzePhase('wake_up')).toBe('wake_up');
    expect(normalizeAnalyzePhase('pre_open')).toBe('pre_market');
    expect(normalizeAnalyzePhase('close')).toBe('market_close');
    expect(normalizeAnalyzePhase('post_analysis')).toBe('evening');
    expect(normalizeAnalyzePhase('nope')).toBeNull();
  });
});
