import { describe, expect, it } from 'vitest';
import { enforceScopeStrict } from '../pipeline/levers';
import { evaluateGuardrails } from '../guardrails/evaluate';
import { evaluateLiveGateChecklist, LIVE_GATE_EVIDENCE_MAX_AGE_MS } from '../live-gates/checklist';
import { isLiveArmingAllowed } from '../live-gates/evidence';

const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const NOW_MS = 1_750_000_000_000;

describe('live gate checklist fail-closed', () => {
  it('fails when evidence is missing', () => {
    const evidence = evaluateLiveGateChecklist({ companyId: COMPANY_ID, nowMs: NOW_MS });
    expect(evidence.overallPass).toBe(false);
    expect(evidence.checklist.some((g) => !g.pass)).toBe(true);
    expect(isLiveArmingAllowed(evidence, NOW_MS)).toBe(false);
  });

  it('fails when evidence is stale (>24h)', () => {
    const evidence = evaluateLiveGateChecklist({
      companyId: COMPANY_ID,
      nowMs: NOW_MS,
      brokerConnectionVerified: true,
      brokerEntitlementsValid: true,
      paperTradingDays: 45,
      verificationPassRate: 0.95,
      activeGuardrailPackageIds: ['grd-001'],
      liveArmedAtMs: NOW_MS - 1000,
      evidenceAsOfMs: NOW_MS - LIVE_GATE_EVIDENCE_MAX_AGE_MS - 1,
    });
    expect(evidence.checklist.find((g) => g.gateId === 'evidence_freshness')!.pass).toBe(false);
    expect(evidence.overallPass).toBe(false);
  });

  it('passes only when all required gates pass with fresh evidence', () => {
    const evidence = evaluateLiveGateChecklist({
      companyId: COMPANY_ID,
      nowMs: NOW_MS,
      brokerConnectionVerified: true,
      brokerEntitlementsValid: true,
      paperTradingDays: 45,
      verificationPassRate: 0.95,
      activeGuardrailPackageIds: ['grd-001', 'grd-003'],
      liveArmedAtMs: NOW_MS - 60_000,
      evidenceAsOfMs: NOW_MS - 60_000,
    });
    expect(evidence.overallPass).toBe(true);
    expect(isLiveArmingAllowed(evidence, NOW_MS)).toBe(true);
  });
});

describe('unknown lever scope block', () => {
  it('rejects unknown band ids fail-closed', () => {
    expect(() =>
      enforceScopeStrict('strategic', {
        totally_unknown_band: { mode: 'band', bandId: 'totally_unknown_band', position: 'typical' },
      }),
    ).toThrow(/unknown_lever/);
  });
});

describe('guardrail evaluation', () => {
  it('blocks liquidity guardrail when spread above ceiling', () => {
    const evaluations = evaluateGuardrails({
      nowMs: NOW_MS,
      sessionPhase: 'open',
      mode: 'paper',
      activePackageIds: ['grd-003'],
      spreadAboveCeiling: true,
    });
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]!.outcome).toBe('block');
    expect(evaluations[0]!.failureCodes).toContain('SPREAD_CEILING_BREACH');
  });
});
