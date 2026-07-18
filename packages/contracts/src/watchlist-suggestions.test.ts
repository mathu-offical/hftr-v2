import { describe, expect, it } from 'vitest';
import {
  ResolvedSuggestionThresholds,
  SuggestionThresholdProfile,
  WatchlistItemStatus,
  WatchlistSourceClass,
} from './watchlist-suggestions';

describe('watchlist-suggestions contracts', () => {
  it('parses SuggestionThresholdProfile defaults', () => {
    const p = SuggestionThresholdProfile.parse({});
    expect(p.driftFlatPreset).toBe('typical');
    expect(p.corroborationFloor).toBe('dual');
    expect(p.libraryFitFloor).toBe('medium');
  });

  it('rejects free-form drift numbers on profile', () => {
    expect(() =>
      SuggestionThresholdProfile.parse({
        driftFlatPreset: 20,
      }),
    ).toThrow();
  });

  it('accepts resolved threshold ints', () => {
    const r = ResolvedSuggestionThresholds.parse({
      flatBps: 20,
      strongBps: 60,
      universeCap: 12,
      suggestionCap: 15,
      libraryFitMinBand: 'medium',
      corroborationMinDomains: 2,
      freshnessWindowMs: 24 * 60 * 60 * 1000,
      lookbackMinutes: 60,
      volumeMediumMin: 1,
      volumeHighMin: 1.5,
      profile: SuggestionThresholdProfile.parse({}),
      sourceClass: 'typical_defaults',
    });
    expect(r.flatBps).toBe(20);
  });

  it('includes suggestion tiers and movers_rank source', () => {
    expect(WatchlistItemStatus.options).toContain('suggested_search');
    expect(WatchlistItemStatus.options).toContain('suggested_verified');
    expect(WatchlistSourceClass.options).toContain('movers_rank');
  });
});
