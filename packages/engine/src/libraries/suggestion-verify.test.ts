import { describe, expect, it } from 'vitest';
import { evaluateSuggestionVerifyGates, suggestionVerifyPasses } from './suggestion-verify';
import { resolveSuggestionThresholds } from './suggestion-thresholds';
import type { CompoundSymbolScore } from '@hftr/contracts';

const baseScore = (over: Partial<CompoundSymbolScore> = {}): CompoundSymbolScore => ({
  symbol: 'AAPL',
  leadershipBand: 'high',
  volumeBand: 'medium',
  libraryFitBand: 'medium',
  newsFitBand: 'low',
  macroAlignBand: 'medium',
  bookFitBand: 'high',
  corroborationBand: 'high',
  corroborationDomains: 3,
  relStrengthAbsBps: 80,
  direction: 'up',
  admitsSearch: true,
  ...over,
});

describe('suggestion-verify', () => {
  it('passes when universe + corroboration floors clear', () => {
    const thresholds = resolveSuggestionThresholds({
      profile: { corroborationFloor: 'dual' },
      sourceClass: 'typical_defaults',
    });
    const gates = evaluateSuggestionVerifyGates({
      score: baseScore(),
      thresholds,
      universe: ['SPY', 'AAPL'],
      nowMs: 1_000_000,
      evidenceScannedAtMs: 900_000,
    });
    expect(suggestionVerifyPasses(gates)).toBe(true);
  });

  it('fails corroboration_floor when domains below resolved min', () => {
    const thresholds = resolveSuggestionThresholds({
      profile: { corroborationFloor: 'multi' },
      sourceClass: 'typical_defaults',
    });
    const gates = evaluateSuggestionVerifyGates({
      score: baseScore({ corroborationDomains: 2, corroborationBand: 'medium' }),
      thresholds,
      universe: ['AAPL'],
      nowMs: 1_000_000,
    });
    expect(gates.find((g) => g.gate === 'corroboration_floor')?.result).toBe('fail');
    expect(suggestionVerifyPasses(gates)).toBe(false);
  });
});
