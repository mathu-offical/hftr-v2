import { describe, expect, it } from 'vitest';
import {
  amalgamationMassFromTexts,
  conceptSimilarityText,
  linkDistanceForSimilarity,
  overlapToSimilarityBand,
  tokenOverlapRatio,
  tokenizeQualitativeText,
} from './galaxy-similarity';

describe('galaxy-similarity', () => {
  it('maps overlap ratio to similarity bands', () => {
    expect(overlapToSimilarityBand(0.5)).toBe('high');
    expect(overlapToSimilarityBand(0.35)).toBe('high');
    expect(overlapToSimilarityBand(0.2)).toBe('medium');
    expect(overlapToSimilarityBand(0.12)).toBe('medium');
    expect(overlapToSimilarityBand(0.05)).toBe('low');
  });

  it('orders link distances high < medium < low', () => {
    expect(linkDistanceForSimilarity('high')).toBeLessThan(linkDistanceForSimilarity('medium'));
    expect(linkDistanceForSimilarity('medium')).toBeLessThan(linkDistanceForSimilarity('low'));
  });

  it('normalizes numeric leaks before tokenize (LLM-assist regex)', () => {
    const tokens = tokenizeQualitativeText('drawdown 12.5% on 2024-01-15');
    expect(tokens).toContain('qualitative_numeric_descriptor');
    expect(tokens).toContain('qualitative_temporal_descriptor');
    expect(tokens.some((t) => /^\d/.test(t))).toBe(false);
  });

  it('computes Jaccard overlap on token sets', () => {
    const left = tokenizeQualitativeText('alpha beta gamma');
    const right = tokenizeQualitativeText('beta gamma delta');
    const ratio = tokenOverlapRatio(left, right);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });

  it('increases amalgamation mass with more distinct vocabulary', () => {
    const small = amalgamationMassFromTexts(['one two three']);
    const medium = amalgamationMassFromTexts(['one two three four five six seven eight']);
    const large = amalgamationMassFromTexts([
      'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega',
    ]);

    expect(small).toBeGreaterThanOrEqual(2);
    expect(large).toBeLessThanOrEqual(24);
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });

  it('builds concept similarity text from title tags and body slice', () => {
    const body = 'x'.repeat(900);
    const text = conceptSimilarityText({
      title: 'Momentum thesis',
      tags: ['trend', 'equity'],
      body,
    });
    expect(text).toContain('Momentum thesis');
    expect(text).toContain('trend equity');
    expect(text).toContain('x'.repeat(800));
    expect(text).not.toContain('x'.repeat(801));
  });
});
