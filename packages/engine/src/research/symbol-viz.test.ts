import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock';
import {
  buildSyntheticSparkSeries,
  buildSymbolViz,
  directionFromSpark,
  heldVsCostFromMarks,
  mapTrendStrengthToBand,
  strengthTicksFromBand,
} from './symbol-viz';

describe('symbol-viz', () => {
  const clock = createFixedClock(Date.parse('2026-07-18T17:00:00.000Z'));

  it('builds deterministic synthetic spark series', () => {
    const a = buildSyntheticSparkSeries('AAPL', clock, { count: 8 });
    const b = buildSyntheticSparkSeries('AAPL', clock, { count: 8 });
    expect(a.feedClass).toBe('synthetic_sim');
    expect(a.points).toHaveLength(8);
    expect(a.points).toEqual(b.points);
    expect(Number(a.points[0]!.valueCents)).toBeGreaterThan(0);
  });

  it('maps held vs cost and strength ticks', () => {
    expect(heldVsCostFromMarks(11000, 10000)).toBe('up');
    expect(heldVsCostFromMarks(9000, 10000)).toBe('down');
    expect(heldVsCostFromMarks(10010, 10000)).toBe('flat');
    expect(strengthTicksFromBand('low')).toBe(1);
    expect(strengthTicksFromBand('high')).toBe(3);
    expect(mapTrendStrengthToBand('strong')).toBe('high');
  });

  it('builds held viz with heldVsCost winning role', () => {
    const viz = buildSymbolViz({
      symbol: 'spy',
      clock,
      strengthBand: 'medium',
      relevanceBand: 'high',
      held: { markCents: 50_000, avgCostCents: 48_000, unrealizedPnlCents: '2000' },
    });
    expect(viz.symbol).toBe('SPY');
    expect(viz.heldVsCost).toBe('up');
    expect(viz.avgCostCents).toBe(48_000);
    expect(directionFromSpark(viz.spark)).toMatch(/up|down|flat/);
  });
});
