import { describe, expect, it } from 'vitest';
import { evaluateMovementTrigger, type MovementSymbolSnap } from './movement-trigger';

function snap(
  symbols: Array<Partial<MovementSymbolSnap> & { symbol: string }>,
): { asOfIso: string; symbols: MovementSymbolSnap[] } {
  return {
    asOfIso: '2026-07-19T15:00:00.000Z',
    symbols: symbols.map((s) => ({
      leadershipBand: 'low',
      volumeBand: 'low',
      newsLinkBand: 'low',
      macroLinkBand: 'low',
      libraryLinkBand: 'low',
      trendLinkBand: 'low',
      corroborationBand: 'low',
      linkCoverageBand: 'low',
      direction: 'flat',
      relStrengthAbsBps: 0,
      ...s,
    })),
  };
}

describe('evaluateMovementTrigger (D-183)', () => {
  it('requires diversified families before triggering', () => {
    const previous = snap([
      { symbol: 'AAA', leadershipBand: 'low', volumeBand: 'low' },
      { symbol: 'BBB', leadershipBand: 'low', volumeBand: 'low' },
      { symbol: 'CCC', leadershipBand: 'low' },
      { symbol: 'DDD', leadershipBand: 'low' },
      { symbol: 'EEE', leadershipBand: 'low' },
      { symbol: 'FFF', leadershipBand: 'low' },
    ]);
    const current = snap([
      {
        symbol: 'AAA',
        leadershipBand: 'high',
        volumeBand: 'high',
        newsLinkBand: 'medium',
        macroLinkBand: 'medium',
        linkCoverageBand: 'high',
        corroborationBand: 'medium',
        trendLinkBand: 'high',
        direction: 'up',
        relStrengthAbsBps: 80,
      },
      {
        symbol: 'BBB',
        leadershipBand: 'high',
        volumeBand: 'medium',
        newsLinkBand: 'medium',
        macroLinkBand: 'medium',
        linkCoverageBand: 'medium',
        corroborationBand: 'medium',
        trendLinkBand: 'medium',
        direction: 'up',
        relStrengthAbsBps: 70,
      },
      {
        symbol: 'CCC',
        leadershipBand: 'medium',
        corroborationBand: 'medium',
        direction: 'up',
      },
      {
        symbol: 'DDD',
        leadershipBand: 'medium',
        corroborationBand: 'medium',
        direction: 'down',
      },
      { symbol: 'EEE', direction: 'up', corroborationBand: 'medium' },
      { symbol: 'FFF', direction: 'up', corroborationBand: 'medium' },
    ]);

    const result = evaluateMovementTrigger({
      previous,
      current,
      nowMs: Date.parse('2026-07-19T16:00:00.000Z'),
      lastTriggeredMs: null,
    });
    expect(result.shouldTrigger).toBe(true);
    expect(result.familiesFired.length).toBeGreaterThanOrEqual(3);
  });

  it('respects cooldown', () => {
    const current = snap([{ symbol: 'AAA', leadershipBand: 'high', direction: 'up' }]);
    const result = evaluateMovementTrigger({
      previous: null,
      current,
      nowMs: 1_000_000,
      lastTriggeredMs: 900_000,
      cooldownMs: 200_000,
    });
    expect(result.shouldTrigger).toBe(false);
    expect(result.reasons).toContain('cooldown_active');
  });
});
