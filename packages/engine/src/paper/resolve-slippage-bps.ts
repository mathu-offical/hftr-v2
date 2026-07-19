/**
 * Resolve InternalPaperCore slippage from catalog max_slippage_bps_band (D-177).
 * Optional participation → square-root impact proxy (honest tags when applied).
 */

import type { PhilosophyBandPosition } from '@hftr/contracts';
import { DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS } from '@hftr/contracts';
import { bandValueAtPosition, getBoundedRangeBand } from '../pipeline/bands';

export interface ResolvePaperFillSlippageOpts {
  /** Philosophy / lever band position for max_slippage_bps_band. */
  slippagePosition?: PhilosophyBandPosition;
  /** Nested catalog profile (default liquid_regular). */
  liquidityProfile?: string;
  /**
   * Participation rate as percent of volume (0–100), when known from compile valves.
   * When set and > 0, adds a capped square-root impact proxy.
   */
  participationPct?: number;
}

export interface ResolvedPaperFillSlippage {
  /** Total bps applied in computeInternalPaperFill (slippage + impact). */
  totalSlippageBps: number;
  /** Catalog band portion only. */
  bandSlippageBps: number;
  /** Square-root participation impact proxy (0 when not applied). */
  impactBps: number;
  /** True when impact proxy contributed > 0. */
  usedMarketImpactProxy: boolean;
}

/**
 * Square-root impact proxy: ~sqrt(participationPct) * 1.5, capped at 25 bps.
 * Literature-aligned starting point (Gatheral-style); not a live microstructure proof.
 */
export function participationImpactBps(participationPct: number): number {
  if (!Number.isFinite(participationPct) || participationPct <= 0) return 0;
  return Math.min(25, Math.max(0, Math.round(Math.sqrt(participationPct) * 1.5)));
}

export function resolvePaperFillSlippage(
  opts: ResolvePaperFillSlippageOpts = {},
): ResolvedPaperFillSlippage {
  const band = getBoundedRangeBand(
    'max_slippage_bps_band',
    opts.liquidityProfile ?? 'liquid_regular',
  );
  const position = opts.slippagePosition ?? 'typical';
  const bandSlippageBps = band
    ? Math.max(0, Math.round(bandValueAtPosition(band, position)))
    : DEFAULT_INTERNAL_PAPER_SLIPPAGE_BPS;
  const impactBps =
    opts.participationPct !== undefined
      ? participationImpactBps(opts.participationPct)
      : 0;
  return {
    bandSlippageBps,
    impactBps,
    totalSlippageBps: bandSlippageBps + impactBps,
    usedMarketImpactProxy: impactBps > 0,
  };
}
