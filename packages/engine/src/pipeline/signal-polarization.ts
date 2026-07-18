/**
 * Deterministic signal polarization → capital leverage scalar.
 *
 * "Polarization" (D-124): how strongly a complex signal agrees on direction /
 * magnitude. Not Kelly (oq-036 deferred). Model-free — uses trend strengthBand
 * plus optional gate agreement and direction alignment.
 */

export type TrendStrengthBand = 'weak' | 'moderate' | 'strong';

/**
 * Fixed-fractional multipliers from qualitative strength (scan drift bands).
 * strong → more capital; weak → de-risk. Bounds stay inside compile 0.5–1.5×
 * envelope used by model sizingBand.
 */
export const STRENGTH_POLARIZATION_MULTIPLIER: Readonly<
  Record<TrendStrengthBand, number>
> = Object.freeze({
  weak: 0.6,
  moderate: 1.0,
  strong: 1.35,
});

const POLARIZATION_MIN_MULT = 0.5;
const POLARIZATION_MAX_MULT = 1.5;

export interface ComplexSignalPolarizationInput {
  strengthBand: TrendStrengthBand;
  /** Six-gate (or subset) passes for this promote, if known. */
  gatePassCount?: number;
  gateTotal?: number;
  /** Regime / lead direction aligned with trade direction. */
  directionAligned?: boolean;
}

export interface ComplexSignalPolarization {
  /** Agreement score in [0, 1]. */
  score: number;
  /** Capital leverage scalar applied to sizing BPS. */
  sizingMultiplier: number;
  components: {
    strength: number;
    gateAgreement: number;
    directionAlign: number;
  };
}

function strengthScore(band: TrendStrengthBand): number {
  switch (band) {
    case 'weak':
      return 0.25;
    case 'moderate':
      return 0.55;
    case 'strong':
      return 0.9;
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

function gateAgreementScore(passCount: number | undefined, total: number | undefined): number {
  if (total == null || total <= 0 || passCount == null) return 0.55;
  return Math.max(0, Math.min(1, passCount / total));
}

/**
 * Compose a complex-signal polarization score and sizing multiplier.
 * Weights: strength 50%, gate agreement 30%, direction align 20%.
 */
export function resolveComplexSignalPolarization(
  input: ComplexSignalPolarizationInput,
): ComplexSignalPolarization {
  const strength = strengthScore(input.strengthBand);
  const gateAgreement = gateAgreementScore(input.gatePassCount, input.gateTotal);
  const directionAlign =
    input.directionAligned === undefined ? 0.55 : input.directionAligned ? 1 : 0.15;

  const score = Math.max(
    0,
    Math.min(1, 0.5 * strength + 0.3 * gateAgreement + 0.2 * directionAlign),
  );

  // Map score → [0.5, 1.5] with typical≈1.0 near score 0.55.
  const sizingMultiplier = Math.max(
    POLARIZATION_MIN_MULT,
    Math.min(
      POLARIZATION_MAX_MULT,
      POLARIZATION_MIN_MULT + score * (POLARIZATION_MAX_MULT - POLARIZATION_MIN_MULT),
    ),
  );

  return {
    score,
    sizingMultiplier,
    components: { strength, gateAgreement, directionAlign },
  };
}

/** Apply polarization scalar to philosophy / risk-appetite BPS. */
export function applyPolarizationToSizingBps(sizingBasisBps: number, multiplier: number): number {
  const bps =
    Number.isFinite(sizingBasisBps) && sizingBasisBps > 0 ? sizingBasisBps : 100;
  const mult =
    Number.isFinite(multiplier) && multiplier > 0
      ? Math.max(POLARIZATION_MIN_MULT, Math.min(POLARIZATION_MAX_MULT, multiplier))
      : 1;
  return Math.max(1, Math.round(bps * mult));
}

/** Convenience: strength-only multiplier (when gates unknown). */
export function strengthPolarizationMultiplier(band: TrendStrengthBand): number {
  return STRENGTH_POLARIZATION_MULTIPLIER[band];
}
