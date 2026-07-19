/**
 * Model-free compile admission cascade (D-174):
 * heat gate → urgency/participation valves → POV child-slice plan.
 * Agents control high-level band positions; this layer enforces envelopes.
 */

import {
  planChildSlices,
  normalizeChildSliceFraction,
  type ChildSlicePlan,
} from '../dispatch/child-order-scheduler';
import { getBoundedRangeBand } from '../pipeline/bands';
import { projectHeatAfterEntry } from '../pipeline/portfolio-heat';
import {
  resolveParticipationValve,
  resolveUrgencyValve,
  type ValveReading,
} from '../pipeline/weighted-valves';

export type TradingSubtype = 'day' | 'swing' | 'position' | 'hft' | string;

export type HeatProjection = ReturnType<typeof projectHeatAfterEntry>;

export interface CompileAdmissionInput {
  quantity: number;
  priceCents: number;
  atrCents: number;
  atrMultiplier: number;
  existingOpenRiskCents: number;
  equityCents: bigint;
  heatCapPct: number;
  polarizationScore: number;
  /** From trading module config.subtype — shapes POV defaults. */
  tradingSubtype?: TradingSubtype;
}

export interface CompileAdmissionOk {
  blocked: false;
  heatProjection: HeatProjection;
  urgency: ValveReading;
  participation: ValveReading;
  childPlan: ChildSlicePlan;
  childSliceFraction: number;
}

export interface CompileAdmissionBlocked {
  blocked: true;
  blockReason: 'portfolio_heat_exceeded';
  heatProjection: HeatProjection;
}

export type CompileAdmissionResult = CompileAdmissionOk | CompileAdmissionBlocked;

/** HFT paper desks prefer denser child slices (lower max-fraction → more legs). */
export function childSliceFractionForSubtype(subtype: TradingSubtype | undefined): number {
  const band = getBoundedRangeBand('child_slice_band');
  const typical = band?.typical ?? 60;
  if (subtype === 'hft') {
    const denser = Math.min(typical, band?.min != null ? Math.max(band.min, 25) : 25);
    return normalizeChildSliceFraction(denser);
  }
  return normalizeChildSliceFraction(typical);
}

/**
 * Run heat + valve + POV cascade for a candidate entry qty.
 * Fail-closed on portfolio_heat_exceeded.
 */
export function runCompileAdmissionCascade(
  input: CompileAdmissionInput,
): CompileAdmissionResult {
  const heatProjection = projectHeatAfterEntry({
    existingOpenRiskCents: input.existingOpenRiskCents,
    entryQty: input.quantity,
    entryPriceCents: input.priceCents,
    atrMultiplier: input.atrMultiplier,
    equityCents: input.equityCents,
    heatCapPct: input.heatCapPct,
    entryAtrCents: input.atrCents,
  });

  if (heatProjection.exceeds) {
    return {
      blocked: true,
      blockReason: 'portfolio_heat_exceeded',
      heatProjection,
    };
  }

  const urgency = resolveUrgencyValve({
    polarizationScore: input.polarizationScore,
    recoveryPressure: heatProjection.projectedHeatPct / Math.max(input.heatCapPct, 1e-9),
  });
  const participation = resolveParticipationValve({
    urgencyWeight: urgency.value,
  });
  const childSliceFraction = childSliceFractionForSubtype(input.tradingSubtype);
  const childPlan = planChildSlices({
    parentQty: input.quantity,
    participationPct: participation.value,
    urgencyScalar: urgency.value,
    childSliceFraction,
  });

  return {
    blocked: false,
    heatProjection,
    urgency,
    participation,
    childPlan,
    childSliceFraction,
  };
}
