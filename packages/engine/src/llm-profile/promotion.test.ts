import { describe, expect, it } from 'vitest';
import { evaluateModelProfilePromotion } from './promotion';

const passingInput = {
  currentProfileId: 'privacy_cost',
  verificationPassRate: 0.9,
  leakCleanWindow: true,
  paperTradeCount: 10,
  intentAlignmentScore: 0.8,
} as const;

describe('evaluateModelProfilePromotion', () => {
  it('promotes privacy_cost to strict_compile when all thresholds pass', () => {
    const result = evaluateModelProfilePromotion(passingInput);
    expect(result).toEqual({
      promote: true,
      nextProfileId: 'strict_compile',
      evidence: expect.stringContaining('D-037'),
    });
  });

  it('does not promote when current profile is not privacy_cost', () => {
    const result = evaluateModelProfilePromotion({
      ...passingInput,
      currentProfileId: 'strict_compile',
    });
    expect(result.promote).toBe(false);
    expect(result.nextProfileId).toBeNull();
    expect(result.evidence).toContain('privacy_cost');
  });

  it('does not promote when verification pass rate is below threshold', () => {
    const result = evaluateModelProfilePromotion({
      ...passingInput,
      verificationPassRate: 0.5,
    });
    expect(result.promote).toBe(false);
    expect(result.evidence).toContain('verificationPassRate');
  });

  it('does not promote when leak window is not clean', () => {
    const result = evaluateModelProfilePromotion({
      ...passingInput,
      leakCleanWindow: false,
    });
    expect(result.promote).toBe(false);
    expect(result.evidence).toContain('leakCleanWindow');
  });

  it('does not promote when paper trade count is insufficient', () => {
    const result = evaluateModelProfilePromotion({
      ...passingInput,
      paperTradeCount: 2,
    });
    expect(result.promote).toBe(false);
    expect(result.evidence).toContain('paperTradeCount');
  });

  it('does not promote when intent alignment is below threshold', () => {
    const result = evaluateModelProfilePromotion({
      ...passingInput,
      intentAlignmentScore: 0.4,
    });
    expect(result.promote).toBe(false);
    expect(result.evidence).toContain('intentAlignmentScore');
  });
});
