import { LiveGateEvidence } from '@hftr/contracts';
import {
  evaluateLiveGateChecklist,
  LIVE_GATE_EVIDENCE_MAX_AGE_MS,
  type LiveGateChecklistInput,
} from './checklist';

export { LIVE_GATE_EVIDENCE_MAX_AGE_MS };

/** Build validated LiveGateEvidence from checklist evaluation. */
export function buildLiveGateEvidence(input: LiveGateChecklistInput): LiveGateEvidence {
  const raw = evaluateLiveGateChecklist(input);
  return LiveGateEvidence.parse(raw);
}

/** Fail-closed: checklist evidence fresh and overallPass (pre-arm review). */
export function isLiveArmingAllowed(
  evidence: LiveGateEvidence | null | undefined,
  nowMs: number,
): boolean {
  if (!evidence) return false;
  const parsed = LiveGateEvidence.safeParse(evidence);
  if (!parsed.success) return false;
  const ageMs = nowMs - parsed.data.evidenceAsOfMs;
  if (ageMs < 0 || ageMs > LIVE_GATE_EVIDENCE_MAX_AGE_MS) return false;
  return parsed.data.overallPass;
}
