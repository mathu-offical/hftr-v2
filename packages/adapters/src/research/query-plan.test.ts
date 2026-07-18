import { describe, expect, it } from 'vitest';
import { buildResearchQueryPlan } from './query-plan';

describe('buildResearchQueryPlan', () => {
  it('builds sector-aware news queries and symbol-focused bar queries', () => {
    const plan = buildResearchQueryPlan({
      topicScope: 'semiconductor cycle',
      topicSectors: ['Semiconductors'],
      queryText: 'foundry utilization',
      symbols: ['NVDA', 'TSM'],
    });

    expect(plan.symbols).toEqual(['NVDA', 'TSM']);
    expect(plan.bySource.gdelt_news).toContain('Semiconductors');
    expect(plan.bySource.gdelt_news).toContain('foundry utilization');
    expect(plan.bySource.gdelt_news).toContain('$NVDA');
    expect(plan.bySource.alpaca_bars).toBe('NVDA TSM');
    expect(plan.bySource.fred_macro).toContain('semiconductor cycle');
    expect(plan.bySource.sec_edgar).toContain('SEC filings');
    expect(plan.bySource.library).toBe('semiconductor cycle');
    expect(plan.bySource.catalog).toBe('semiconductor cycle');
  });

  it('extracts symbols from query text when none supplied', () => {
    const plan = buildResearchQueryPlan({
      topicScope: 'equities',
      queryText: 'update on $AAPL',
    });

    expect(plan.symbols).toEqual(['AAPL']);
    expect(plan.bySource.twelve_data).toBe('AAPL');
  });

  it('falls back to topic scope for macro sources', () => {
    const plan = buildResearchQueryPlan({
      topicScope: 'macro rates',
      cadence: 'every:1440',
    });

    expect(plan.bySource.world_bank_indicator).toContain('macro economy indicators');
    expect(plan.bySource.world_bank_indicator).toContain('rates');
    expect(plan.bySource.world_bank_indicator).toContain('every:1440');
  });
});
