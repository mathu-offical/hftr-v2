import { describe, expect, it } from 'vitest';
import { simHonestyChips, simHonestyTickerLabel } from './sim-honesty-label';

describe('simHonestyChips (D-187)', () => {
  it('labels live + prior session + funds-only', () => {
    const chips = simHonestyChips([
      'live_market_quote',
      'prior_session_mark',
      'no_market_impact',
      'funds_only_routing',
      'inline_fill_model',
    ]);
    expect(chips.map((c) => c.label)).toEqual([
      'Live mark',
      'Prior session',
      'Funds-only',
    ]);
  });

  it('labels synthetic and impact proxy', () => {
    const chips = simHonestyChips([
      'synthetic_quote',
      'square_root_impact_proxy',
      'child_slice_drain',
    ]);
    expect(chips.map((c) => c.kind)).toEqual([
      'synthetic',
      'impact_proxy',
      'child_drain',
    ]);
  });

  it('builds ticker label', () => {
    expect(
      simHonestyTickerLabel(['live_market_quote', 'prior_session_mark', 'funds_only_routing']),
    ).toBe('Live mark · Prior session · Funds-only');
  });
});
