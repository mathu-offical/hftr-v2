import type { LeverSetting, LeverState, PhilosophyBandPosition } from '@hftr/contracts';
import { RISK_APPETITE_SIZING_BPS } from '@hftr/contracts';

/**
 * Deterministic lever resolution from LeverState band positions.
 * Maps philosophy-owned bands to numeric sizing basis (bps of equity).
 * Model-free: only band positions and catalog constants — no literals from LLM output.
 */

const RISK_BAND_ID = 'risk_per_trade_pct_band';

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
