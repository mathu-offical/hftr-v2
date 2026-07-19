import { describe, expect, it } from 'vitest';
import { buildMarketHubSourceChips, sourceChipClassWord } from './market-hub-source-chips';

describe('buildMarketHubSourceChips (D-155)', () => {
  it('maps api / library / system / setting and dedupes', () => {
    const chips = buildMarketHubSourceChips([
      'alpaca_bars',
      'library',
      'catalog',
      'operator',
      'alpaca_bars',
    ]);
    expect(chips.map((c) => c.class)).toEqual(['api', 'library', 'system', 'setting']);
    expect(chips).toHaveLength(4);
    expect(sourceChipClassWord('api')).toBe('api');
  });

  it('maps mark feed honesty kinds', () => {
    const chips = buildMarketHubSourceChips(['broker_paper', 'synthetic_sim']);
    expect(chips.find((c) => c.id === 'broker_paper')?.class).toBe('api');
    expect(chips.find((c) => c.id === 'synthetic_sim')?.class).toBe('system');
  });
});
