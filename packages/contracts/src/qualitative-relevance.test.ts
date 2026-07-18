import { describe, expect, it } from 'vitest';
import {
  QUALITATIVE_NUMERIC_PLACEHOLDER,
  QUALITATIVE_TEMPORAL_PLACEHOLDER,
  qualitativeNormalizeForCompare,
} from './qualitative-normalize';
import {
  scoreRelevanceBand,
  similarityBandBetweenTexts,
  tokenizeQualitativeText,
} from './qualitative-relevance';

describe('qualitative-relevance (LLM-assist normalize + Jaccard)', () => {
  it('collapses numerics and datetimes before tokenize', () => {
    const normalized = qualitativeNormalizeForCompare('drawdown 12.5% on 2024-01-15');
    expect(normalized).toContain(QUALITATIVE_NUMERIC_PLACEHOLDER);
    expect(normalized).toContain(QUALITATIVE_TEMPORAL_PLACEHOLDER);
    const tokens = tokenizeQualitativeText('drawdown 12.5% on 2024-01-15');
    expect(tokens).toContain(QUALITATIVE_NUMERIC_PLACEHOLDER);
    expect(tokens).toContain(QUALITATIVE_TEMPORAL_PLACEHOLDER);
    expect(tokens.some((t) => /^\d/.test(t))).toBe(false);
  });

  it('scores shared vocabulary as medium/high', () => {
    const { band } = scoreRelevanceBand({
      queryText: 'momentum trend following equity sectors',
      topicScope: 'trend following research',
      corpusTexts: ['momentum trend following for equity sectors'],
    });
    expect(band === 'medium' || band === 'high').toBe(true);
  });

  it('pairwise similarity uses the same band thresholds', () => {
    expect(similarityBandBetweenTexts('alpha beta gamma', 'unrelated words only')).toBe('low');
  });
});
