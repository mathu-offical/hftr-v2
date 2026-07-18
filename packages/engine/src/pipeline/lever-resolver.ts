import type { LeverSetting, LeverState, PhilosophyBandPosition } from '@hftr/contracts';
import { RISK_APPETITE_SIZING_BPS } from '@hftr/contracts';
import { bandValueAtPosition, getBoundedRangeBand } from './bands';

/**
 * Deterministic lever resolution from LeverState band positions.
 * Maps philosophy-owned bands to numeric sizing basis (bps of equity).
 * Model-free: only band positions and catalog constants — no literals from LLM output.
 */

const RISK_BAND_ID = 'risk_per_trade_pct_band';
const ATR_MULT_BAND_ID = 'atr_stop_multiplier_band';
const HEAT_BAND_ID = 'portfolio_heat_pct_band';
const TRAIL_BAND_ID = 'trail_multiplier_band';

export function resolveLeverSetting(state: LeverState, bandId: string): LeverSetting | null {
  return state[bandId] ?? null;
}

export function resolveBandPosition(
  state: LeverState,
  bandId: string,
  fallback: PhilosophyBandPosition = 'typical',
): PhilosophyBandPosition {
  const setting = resolveLeverSetting(state, bandId);
  if (!setting || setting.mode !== 'band') return fallback;
  return setting.position;
}

/** risk_per_trade_pct_band position → sizing basis bps (RISK_APPETITE_SIZING_BPS). */
export function resolveSizingBasisBps(state: LeverState): number {
  const position = resolveBandPosition(state, RISK_BAND_ID, 'typical');
  return RISK_APPETITE_SIZING_BPS[position];
}

/**
 * Catalog risk_per_trade_pct (% equity) at the lever position.
 * Falls back to typical anchors 0.25 / 0.75 / 2.0 when band missing.
 */
export function resolveRiskPerTradePct(
  state: LeverState | null | undefined,
  fallback: PhilosophyBandPosition = 'typical',
): number {
  const position = state
    ? resolveBandPosition(state, RISK_BAND_ID, fallback)
    : fallback;
  const band = getBoundedRangeBand(RISK_BAND_ID);
  if (band) return bandValueAtPosition(band, position);
  switch (position) {
    case 'min':
      return 0.25;
    case 'typical':
      return 0.75;
    case 'max':
      return 2.0;
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}

/** Catalog atr_stop_multiplier at lever position (default typical 2.25). */
export function resolveAtrStopMultiplier(
  state: LeverState | null | undefined,
  fallback: PhilosophyBandPosition = 'typical',
): number {
  const position = state
    ? resolveBandPosition(state, ATR_MULT_BAND_ID, fallback)
    : fallback;
  const band = getBoundedRangeBand(ATR_MULT_BAND_ID);
  if (band) return bandValueAtPosition(band, position);
  switch (position) {
    case 'min':
      return 1.5;
    case 'typical':
      return 2.25;
    case 'max':
      return 3.0;
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}

/** Catalog portfolio_heat_pct (% equity open risk) at lever position. */
export function resolvePortfolioHeatPct(
  state: LeverState | null | undefined,
  fallback: PhilosophyBandPosition = 'typical',
): number {
  const position = state
    ? resolveBandPosition(state, HEAT_BAND_ID, fallback)
    : fallback;
  const band = getBoundedRangeBand(HEAT_BAND_ID);
  if (band) return bandValueAtPosition(band, position);
  switch (position) {
    case 'min':
      return 1.5;
    case 'typical':
      return 4.0;
    case 'max':
      return 8.0;
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}

/**
 * Heat hard-cap for compile admission: use band.max so typical lever
 * still allows room, while never exceeding catalog ceiling.
 */
export function resolvePortfolioHeatCapPct(
  state: LeverState | null | undefined,
): number {
  const band = getBoundedRangeBand(HEAT_BAND_ID);
  if (band) return band.max;
  return resolvePortfolioHeatPct(state, 'max');
}

/** Catalog trail_multiplier (chandelier × ATR) at lever position. */
export function resolveTrailMultiplier(
  state: LeverState | null | undefined,
  fallback: PhilosophyBandPosition = 'typical',
): number {
  const position = state
    ? resolveBandPosition(state, TRAIL_BAND_ID, fallback)
    : fallback;
  const band = getBoundedRangeBand(TRAIL_BAND_ID);
  if (band) return bandValueAtPosition(band, position);
  switch (position) {
    case 'min':
      return 1.5;
    case 'typical':
      return 2.5;
    case 'max':
      return 4.0;
    default: {
      const _exhaustive: never = position;
      return _exhaustive;
    }
  }
}
