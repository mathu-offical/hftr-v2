import { describe, expect, it } from 'vitest';
import { buildPostureContextRollup } from './posture-context-rollup';

describe('buildPostureContextRollup', () => {
  it('crosswalks held symbols onto movers board without raw numbers', () => {
    const rollup = buildPostureContextRollup({
      heldSymbols: ['AAPL', 'MSFT'],
      watchSymbols: ['NVDA'],
      pipelineSymbols: ['AMD'],
      moverSymbols: ['AAPL', 'NVDA', 'SPY'],
      moversTitle: 'Daily movers',
      moversBand: 'medium',
      sectorTitle: 'Sector daily bulletin',
      sectorBand: 'low',
      dailyTitle: 'Daily session summary',
      dailyBand: 'medium',
      phase: 'midday',
    });

    expect(rollup.body).toContain('Held names also on movers board: AAPL');
    expect(rollup.body).toContain('Held names not on movers board: MSFT');
    expect(rollup.body).toContain('On movers board: NVDA');
    expect(rollup.body).not.toMatch(/\d+\.\d{2}/);
    expect(rollup.summaryLines.some((l) => l.includes('Held on tape: 1/2'))).toBe(true);
  });

  it('handles empty book', () => {
    const rollup = buildPostureContextRollup({
      heldSymbols: [],
      watchSymbols: [],
      pipelineSymbols: [],
      moverSymbols: [],
      moversTitle: null,
      moversBand: null,
      sectorTitle: null,
      sectorBand: null,
      dailyTitle: null,
      dailyBand: null,
      phase: 'pre_open',
    });
    expect(rollup.body).toContain('No open holdings');
    expect(rollup.body).toContain('Movers board seal not available');
  });
});
