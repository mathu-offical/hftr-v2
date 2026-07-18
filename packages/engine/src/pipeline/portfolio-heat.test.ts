import { describe, expect, it } from 'vitest';
import {
  computePositionOpenRiskCents,
  portfolioHeatPct,
  projectHeatAfterEntry,
  sumOpenRiskCents,
} from './portfolio-heat';

describe('portfolio-heat', () => {
  it('computes per-position open risk from ATR geometry', () => {
    // avg 10000, atr 50 bps → 50, ×2.25 → 112; qty 10 → 1120
    expect(computePositionOpenRiskCents(10n, 10_000, 2.25)).toBe(1_120);
  });

  it('sums open risk across positions', () => {
    expect(
      sumOpenRiskCents(
        [
          { qty: 10n, avgCostCents: 10_000 },
          { qty: 5n, avgCostCents: 10_000 },
        ],
        2.25,
      ),
    ).toBe(1_120 + 560);
  });

  it('reports heat as pct of equity', () => {
    expect(portfolioHeatPct(4_000, 100_000n)).toBe(4);
  });

  it('blocks entry when projected heat exceeds cap', () => {
    const result = projectHeatAfterEntry({
      existingOpenRiskCents: 7_000,
      entryQty: 20,
      entryPriceCents: 10_000,
      atrMultiplier: 2.25,
      equityCents: 100_000n,
      heatCapPct: 8,
    });
    // entry risk = 20 * 112 = 2240 → projected 9240 → 9.24% > 8
    expect(result.exceeds).toBe(true);
    expect(result.projectedHeatPct).toBeGreaterThan(8);
  });

  it('admits entry when projected heat stays under cap', () => {
    const result = projectHeatAfterEntry({
      existingOpenRiskCents: 1_000,
      entryQty: 2,
      entryPriceCents: 10_000,
      atrMultiplier: 2.25,
      equityCents: 100_000n,
      heatCapPct: 8,
    });
    expect(result.exceeds).toBe(false);
  });
});
