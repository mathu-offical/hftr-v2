/**
 * Model profile promotion evaluator (privacy_cost → strict_compile).
 *
 * D-037 promotion thresholds (research baseline):
 * - verificationPassRate >= 0.85
 * - leakCleanWindow === true
 * - paperTradeCount >= 5
 * - intentAlignmentScore >= 0.7
 * - currentProfileId === 'privacy_cost'
 */

export interface ModelProfilePromotionInput {
  currentProfileId: string;
  verificationPassRate: number;
  leakCleanWindow: boolean;
  paperTradeCount: number;
  intentAlignmentScore: number;
}

export interface ModelProfilePromotionResult {
  promote: boolean;
  nextProfileId: 'strict_compile' | null;
  evidence: string;
}

const VERIFICATION_PASS_RATE_MIN = 0.85;
const PAPER_TRADE_COUNT_MIN = 5;
const INTENT_ALIGNMENT_SCORE_MIN = 0.7;

export function evaluateModelProfilePromotion(
  input: ModelProfilePromotionInput,
): ModelProfilePromotionResult {
  if (input.currentProfileId !== 'privacy_cost') {
    return {
      promote: false,
      nextProfileId: null,
      evidence: `promotion only from privacy_cost (current: ${input.currentProfileId})`,
    };
  }

  const gaps: string[] = [];
  if (input.verificationPassRate < VERIFICATION_PASS_RATE_MIN) {
    gaps.push(`verificationPassRate ${input.verificationPassRate} < ${VERIFICATION_PASS_RATE_MIN}`);
  }
  if (!input.leakCleanWindow) {
    gaps.push('leakCleanWindow is false');
  }
  if (input.paperTradeCount < PAPER_TRADE_COUNT_MIN) {
    gaps.push(`paperTradeCount ${input.paperTradeCount} < ${PAPER_TRADE_COUNT_MIN}`);
  }
  if (input.intentAlignmentScore < INTENT_ALIGNMENT_SCORE_MIN) {
    gaps.push(`intentAlignmentScore ${input.intentAlignmentScore} < ${INTENT_ALIGNMENT_SCORE_MIN}`);
  }

  if (gaps.length > 0) {
    return {
      promote: false,
      nextProfileId: null,
      evidence: gaps.join('; '),
    };
  }

  return {
    promote: true,
    nextProfileId: 'strict_compile',
    evidence:
      'verificationPassRate, leakCleanWindow, paperTradeCount, and intentAlignmentScore meet D-037 thresholds',
  };
}
