/**
 * Multi-way weighted valves — continuous modulators inside catalog envelopes.
 * Used for HFT-oriented retail pacing (participation × urgency × vol × schedule)
 * and as the learning-system write surface (weight deltas stay in-band).
 *
 * Model-free. Not boolean switches.
 */

import type { PhilosophyBandPosition } from '@hftr/contracts';
import { bandValueAtPosition, getBoundedRangeBand, type NumericBand } from './bands';

export type ValveId =
  | 'participation_rate'
  | 'is_urgency_scalar'
  | 'portfolio_heat'
  | 'trail_multiplier'
  | 'signal_polarization';

export interface ValveReading {
  valveId: ValveId;
  /** Continuous weight in [0, 1] after blending inputs. */
  weight: number;
  /** Resolved numeric inside catalog band. */
  value: number;
  band: NumericBand;
  position: PhilosophyBandPosition;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function bandOrDefault(bandId: string, fallback: NumericBand): NumericBand {
  return getBoundedRangeBand(bandId) ?? fallback;
}

/**
 * Blend multiple [0,1] drivers into one weight (equal when weights omitted).
 * Learning systems adjust driverWeights inside envelopes — never invent new axes.
 */
export function blendValveDrivers(
  drivers: ReadonlyArray<{ score: number; weight?: number }>,
): number {
  if (drivers.length === 0) return 0.5;
  let num = 0;
  let den = 0;
  for (const d of drivers) {
    const w = d.weight != null && d.weight > 0 ? d.weight : 1;
    num += clamp01(d.score) * w;
    den += w;
  }
  return den > 0 ? clamp01(num / den) : 0.5;
}

/** Map blended weight → band position (thirds). */
export function weightToBandPosition(weight: number): PhilosophyBandPosition {
  const w = clamp01(weight);
  if (w < 1 / 3) return 'min';
  if (w < 2 / 3) return 'typical';
  return 'max';
}

/**
 * Almgren–Chriss style participation valve:
 * effective_pov = clamp(base × urgency × schedule × vol, band.min, band.max)
 */
export function resolveParticipationValve(args: {
  urgencyWeight: number;
  scheduleWeight?: number;
  volRegimeWeight?: number;
  position?: PhilosophyBandPosition;
}): ValveReading {
  const band = bandOrDefault('participation_rate_band', {
    min: 3,
    typical: 8,
    max: 20,
    unit: 'pct_volume',
  });
  const position = args.position ?? 'typical';
  const base = bandValueAtPosition(band, position);
  const urgency = Math.max(0.2, Math.min(3, args.urgencyWeight));
  const schedule =
    args.scheduleWeight != null ? Math.max(0.25, Math.min(1.5, args.scheduleWeight)) : 1;
  const vol =
    args.volRegimeWeight != null ? Math.max(0.25, Math.min(1.25, args.volRegimeWeight)) : 1;
  // Normalize urgency 0.2..3 → ~0.5..1.5 scalar around 1.0
  const urgencyScalar = 0.5 + (urgency / 3) * 1.0;
  const raw = base * urgencyScalar * schedule * vol;
  const value = Math.min(band.max, Math.max(band.min, raw));
  const weight = clamp01((value - band.min) / Math.max(1e-9, band.max - band.min));
  return {
    valveId: 'participation_rate',
    weight,
    value,
    band,
    position,
  };
}

/** Urgency valve from IS / signal polarization / recovery phase pressure. */
export function resolveUrgencyValve(args: {
  polarizationScore?: number;
  recoveryPressure?: number;
  position?: PhilosophyBandPosition;
}): ValveReading {
  const band = bandOrDefault('is_urgency_scalar_band', {
    min: 0.2,
    typical: 1.0,
    max: 3.0,
  });
  const position = args.position ?? 'typical';
  const blended = blendValveDrivers([
    { score: args.polarizationScore ?? 0.55, weight: 0.5 },
    { score: args.recoveryPressure ?? 0.4, weight: 0.5 },
  ]);
  // Interpolate value across band by blended weight
  const value = band.min + blended * (band.max - band.min);
  const clamped = Math.min(band.max, Math.max(band.min, value));
  return {
    valveId: 'is_urgency_scalar',
    weight: blended,
    value: clamped,
    band,
    position,
  };
}

/**
 * Learning-facing delta: propose a new band position from outcome scores.
 * Caller persists via control_snapshot / training path — this only computes.
 */
export function proposeValvePositionDelta(args: {
  current: PhilosophyBandPosition;
  /** Positive → tighten/aggressive; negative → loosen. Clamped. */
  outcomeScore: number;
}): PhilosophyBandPosition {
  const order: PhilosophyBandPosition[] = ['min', 'typical', 'max'];
  const idx = order.indexOf(args.current);
  const step = args.outcomeScore > 0.25 ? 1 : args.outcomeScore < -0.25 ? -1 : 0;
  const next = Math.max(0, Math.min(2, idx + step));
  return order[next]!;
}
