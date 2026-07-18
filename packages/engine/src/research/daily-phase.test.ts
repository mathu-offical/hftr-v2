import { describe, expect, it } from 'vitest';
import { dailySummaryPhaseFromSession } from '../handlers/library-system-daily-summaries';
import { systemDocKindForView } from './seal-persist';

describe('dailySummaryPhaseFromSession', () => {
  it('maps calendar phases to daily summary tags', () => {
    expect(dailySummaryPhaseFromSession('pre_market')).toBe('pre_open');
    expect(dailySummaryPhaseFromSession('open')).toBe('midday');
    expect(dailySummaryPhaseFromSession('midday')).toBe('midday');
    expect(dailySummaryPhaseFromSession('power_hour')).toBe('close');
    expect(dailySummaryPhaseFromSession('closed')).toBe('post_analysis');
    expect(dailySummaryPhaseFromSession('overnight')).toBe('post_analysis');
  });
});

describe('systemDocKindForView', () => {
  it('maps sealed view kinds to SystemDocKind', () => {
    expect(systemDocKindForView('movers_board')).toBe('movers_report');
    expect(systemDocKindForView('sector_bulletin')).toBe('sector_bulletin');
    expect(systemDocKindForView('daily_summary_phase')).toBe('daily_summary');
  });
});
