import { describe, expect, it } from 'vitest';
import { DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS } from '@hftr/contracts';
import { getBoundedRangeBand, bandValueAtPosition } from '../pipeline/bands';
import {
  participationImpactBps,
  resolvePaperFillSlippage,
} from './resolve-slippage-bps';

describe('resolvePaperFillSlippage (D-177)', () => {
  it('uses catalog typical max_slippage_bps_band when no participation', () => {
    const band = getBoundedRangeBand('max_slippage_bps_band', 'liquid_regular')!;
    const expected = Math.round(bandValueAtPosition(band, 'typical'));
    const resolved = resolvePaperFillSlippage({ slippagePosition: 'typical' });
    expect(resolved.bandSlippageBps).toBe(expected);
    expect(resolved.impactBps).toBe(0);
    expect(resolved.usedMarketImpactProxy).toBe(false);
    expect(resolved.totalSlippageBps).toBe(expected);
    expect(resolved.totalSlippageBps).toBeGreaterThanOrEqual(DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS);
  });

  it('adds capped square-root impact when participationPct set', () => {
    const resolved = resolvePaperFillSlippage({
      slippagePosition: 'typical',
      participationPct: 40,
    });
    expect(resolved.impactBps).toBe(participationImpactBps(40));
    expect(resolved.usedMarketImpactProxy).toBe(true);
    expect(resolved.totalSlippageBps).toBe(resolved.bandSlippageBps + resolved.impactBps);
  });

  it('caps impact at 25 bps', () => {
    expect(participationImpactBps(10_000)).toBe(25);
  });

  it('ignores non-positive participation', () => {
    expect(participationImpactBps(0)).toBe(0);
    expect(participationImpactBps(-1)).toBe(0);
  });
});
