import { z } from 'zod';
import { LeverSetting, type LeverState } from './pipeline';

/**
 * Slideable trading-philosophy control plane.
 * Axes map deterministically to LeverSetting band positions / sizing BPS.
 * Free-text philosophyPrompt remains narrative only — never sizes or times.
 * See agent-docs/testing/philosophy-axis-taxonomy.md.
 */

export const PhilosophyBandPosition = z.enum(['min', 'typical', 'max']);
export type PhilosophyBandPosition = z.infer<typeof PhilosophyBandPosition>;

export const PhilosophyAxisId = z.enum([
  'risk_appetite',
  'diversification',
  'horizon',
  'aggression',
  'regime_bias',
  'recovery_posture',
  'reinvestment',
  'compliance_tightness',
  'evidence_bar',
  'research_breadth',
]);
export type PhilosophyAxisId = z.infer<typeof PhilosophyAxisId>;

export const PHILOSOPHY_AXIS_IDS = PhilosophyAxisId.options;

export const PhilosophyAxisMeta = z.object({
  id: PhilosophyAxisId,
  label: z.string(),
  layer: z.enum(['strategic', 'tactical', 'execution', 'policy']),
  bandIds: z.array(z.string()).min(1),
  description: z.string(),
});
export type PhilosophyAxisMeta = z.infer<typeof PhilosophyAxisMeta>;

/** Catalog of user-facing axes grounded to seeded band ids. */
export const PHILOSOPHY_AXIS_CATALOG: readonly PhilosophyAxisMeta[] = [
  {
    id: 'risk_appetite',
    label: 'Risk appetite',
    layer: 'strategic',
    bandIds: ['risk_per_trade_pct_band', 'portfolio_heat_pct_band', 'portfolio_vol_target_band'],
    description: 'Per-trade risk, portfolio heat, and volatility target.',
  },
  {
    id: 'diversification',
    label: 'Diversification',
    layer: 'strategic',
    bandIds: ['sector_concentration_pct_band', 'max_concurrent_names_band'],
    description: 'Sector concentration and concurrent-name caps.',
  },
  {
    id: 'horizon',
    label: 'Hold horizon',
    layer: 'tactical',
    bandIds: ['time_stop_band', 'momentum_lookback_band'],
    description: 'Time stops and nomination lookback.',
  },
  {
    id: 'aggression',
    label: 'Execution aggression',
    layer: 'execution',
    bandIds: ['participation_rate_band', 'is_urgency_scalar_band', 'fill_timeout_ms_band'],
    description: 'Participation, urgency, and fill timeout.',
  },
  {
    id: 'regime_bias',
    label: 'Regime bias',
    layer: 'strategic',
    bandIds: ['regime_router_thresholds', 'vol_shock_regime_band'],
    description: 'Momentum vs mean-reversion vs risk-off sensitivity.',
  },
  {
    id: 'recovery_posture',
    label: 'Recovery posture',
    layer: 'tactical',
    bandIds: ['reentry_band', 'recovery_backoff_ms_band'],
    description: 'Re-entry count and recovery backoff.',
  },
  {
    id: 'reinvestment',
    label: 'Reinvestment',
    layer: 'policy',
    bandIds: ['portfolio_heat_pct_band'],
    description: 'How aggressively profits may re-enter risk (fund router when wired).',
  },
  {
    id: 'compliance_tightness',
    label: 'Compliance tightness',
    layer: 'policy',
    bandIds: ['max_slippage_bps_band'],
    description: 'Stricter admission and slippage envelopes.',
  },
  {
    id: 'evidence_bar',
    label: 'Evidence bar',
    layer: 'strategic',
    bandIds: ['correlation_health_band'],
    description: 'Freshness and confirmation strictness for promotion.',
  },
  {
    id: 'research_breadth',
    label: 'Research breadth',
    layer: 'strategic',
    bandIds: ['momentum_lookback_band'],
    description: 'Exploration breadth for research/trend cadence.',
  },
] as const;

export const PhilosophyProfile = z.object({
  version: z.literal(1),
  axes: z.record(PhilosophyAxisId, PhilosophyBandPosition),
});
export type PhilosophyProfile = z.infer<typeof PhilosophyProfile>;

export const DEFAULT_PHILOSOPHY_PROFILE: PhilosophyProfile = {
  version: 1,
  axes: {
    risk_appetite: 'typical',
    diversification: 'typical',
    horizon: 'typical',
    aggression: 'typical',
    regime_bias: 'typical',
    recovery_posture: 'typical',
    reinvestment: 'typical',
    compliance_tightness: 'typical',
    evidence_bar: 'typical',
    research_breadth: 'typical',
  },
};

/** risk_per_trade_pct_band 0.25 / 0.75 / 2.0 → sizing basis in bps of equity. */
export const RISK_APPETITE_SIZING_BPS: Record<PhilosophyBandPosition, number> = {
  min: 25,
  typical: 75,
  max: 200,
};

export function normalizePhilosophyProfile(input: unknown): PhilosophyProfile {
  if (input == null || typeof input !== 'object') {
    return DEFAULT_PHILOSOPHY_PROFILE;
  }
  const parsed = PhilosophyProfile.safeParse(input);
  if (parsed.success) {
    return {
      version: 1,
      axes: { ...DEFAULT_PHILOSOPHY_PROFILE.axes, ...parsed.data.axes },
    };
  }
  return DEFAULT_PHILOSOPHY_PROFILE;
}

/**
 * Map a philosophy profile to LeverState band positions.
 * Only known band ids from the axis catalog are emitted.
 */
export function philosophyProfileToLeverState(profile: PhilosophyProfile): LeverState {
  const state: LeverState = {};
  for (const meta of PHILOSOPHY_AXIS_CATALOG) {
    const position = profile.axes[meta.id] ?? 'typical';
    for (const bandId of meta.bandIds) {
      const setting: LeverSetting = { mode: 'band', bandId, position };
      state[bandId] = setting;
    }
  }
  return state;
}

export function philosophySizingBasisBps(profile: PhilosophyProfile): number {
  const pos = profile.axes.risk_appetite ?? 'typical';
  return RISK_APPETITE_SIZING_BPS[pos];
}
