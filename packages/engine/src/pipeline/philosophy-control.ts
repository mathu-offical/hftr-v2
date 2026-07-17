import {
  normalizePhilosophyProfile,
  philosophyProfileToLeverState,
  philosophySizingBasisBps,
  type PhilosophyProfile,
} from '@hftr/contracts';
import { enforceAllLayers } from './levers';

export interface PhilosophyControlSnapshot {
  policyEnvelopeVersion: string;
  sizingBasisBps: number;
  sizingBasis: string;
  philosophyProfile: PhilosophyProfile;
  leverState: ReturnType<typeof philosophyProfileToLeverState>;
  strategyFamily: string;
  sourceClass: 'deterministic_placeholder';
  freshnessWindow: string;
}

export interface ResolvePhilosophyControlInput {
  philosophyProfile: unknown;
  /** Linked policy module config.policyEnvelopeRef when present. */
  policyEnvelopeRef?: string | null;
  /** Trading module config.strategyFamilies[0] when present. */
  strategyFamily?: string | null;
}

const DEFAULT_POLICY = 'paper_balanced_general_v1';
const DEFAULT_STRATEGY = 'trend_following_v1';

/**
 * Resolve operator philosophy + module config into a replayable control snapshot.
 * Lever state is fail-closed through enforceAllLayers.
 */
export function resolvePhilosophyControl(
  input: ResolvePhilosophyControlInput,
): PhilosophyControlSnapshot {
  const profile = normalizePhilosophyProfile(input.philosophyProfile);
  const leverState = enforceAllLayers(philosophyProfileToLeverState(profile));
  const sizingBasisBps = philosophySizingBasisBps(profile);
  const strategyFamily =
    typeof input.strategyFamily === 'string' && input.strategyFamily.length > 0
      ? input.strategyFamily
      : DEFAULT_STRATEGY;
  const policyEnvelopeVersion =
    typeof input.policyEnvelopeRef === 'string' && input.policyEnvelopeRef.length > 0
      ? input.policyEnvelopeRef
      : DEFAULT_POLICY;

  return {
    policyEnvelopeVersion,
    sizingBasisBps,
    sizingBasis: `risk_appetite_${profile.axes.risk_appetite ?? 'typical'}_bps_${sizingBasisBps}`,
    philosophyProfile: profile,
    leverState,
    strategyFamily,
    sourceClass: 'deterministic_placeholder',
    freshnessWindow: profile.axes.evidence_bar === 'max' ? 'strict_12h' : 'default_24h',
  };
}
