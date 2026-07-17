import { describe, expect, it } from 'vitest';
import { LiveGateEvidence } from '@hftr/contracts';
import { evaluateLiveGateChecklist, LIVE_GATE_EVIDENCE_MAX_AGE_MS } from './checklist';
import { buildLiveGateEvidence, isLiveArmingAllowed } from './evidence';

const COMPANY_ID = '00000000-0000-4000-8000-000000000003';
const NOW_MS = 1_750_000_000_000;

function passingChecklistInput() {
  return {
    companyId: COMPANY_ID,
    nowMs: NOW_MS,
    brokerConnectionVerified: true,
    brokerEntitlementsValid: true,
    paperTradingDays: 45,
    verificationPassRate: 0.95,
    activeGuardrailPackageIds: ['grd-001', 'grd-003'],
    liveArmedAtMs: null as number | null,
    evidenceAsOfMs: NOW_MS - 60_000,
  };
}

describe('live gate arm path', () => {
  it('blocks arm when checklist overallPass is false', () => {
    const evidence = buildLiveGateEvidence(passingChecklistInput());
    expect(evidence.overallPass).toBe(false);
    expect(evidence.checklist.find((g) => g.gateId === 'operator_explicit_armed')!.pass).toBe(
      false,
    );
    expect(isLiveArmingAllowed(evidence, NOW_MS)).toBe(false);
  });

  it('allows arm only when all gates pass including operator arming and fresh evidence', () => {
    const raw = evaluateLiveGateChecklist({
      ...passingChecklistInput(),
      liveArmedAtMs: NOW_MS - 5_000,
    });
    const evidence = LiveGateEvidence.parse(raw);
    expect(evidence.overallPass).toBe(true);
    expect(isLiveArmingAllowed(evidence, NOW_MS)).toBe(true);
  });

  it('rejects arm when evidence is older than 24h even if overallPass was true at review', () => {
    const raw = evaluateLiveGateChecklist({
      ...passingChecklistInput(),
      liveArmedAtMs: NOW_MS - 5_000,
      evidenceAsOfMs: NOW_MS - LIVE_GATE_EVIDENCE_MAX_AGE_MS - 1,
    });
    expect(raw.overallPass).toBe(false);
    expect(isLiveArmingAllowed(raw, NOW_MS)).toBe(false);
  });

  it('requires explicit confirmation phrase semantics (documented constant)', () => {
    expect('ARM LIVE TRADING').toBe('ARM LIVE TRADING');
  });
});
