import { describe, expect, it } from 'vitest';
import { simHonestyChips, simHonestyTickerLabel } from './sim-honesty-label';

describe('simHonestyChips (D-187 / D-194)', () => {
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
      'Inline fill',
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

  it('builds ticker label (top 3)', () => {
    expect(
      simHonestyTickerLabel(['live_market_quote', 'prior_session_mark', 'funds_only_routing']),
    ).toBe('Live mark · Prior session · Funds-only');
  });

  it('labels no-queue, both-verify, and pre-block', () => {
    expect(
      simHonestyChips(['no_queue_position', 'both_verify_linked', 'pre_dispatch_block']).map(
        (c) => c.label,
      ),
    ).toEqual(['No queue', 'Both-verify', 'Pre-block']);
    expect(simHonestyChips(['both_verify_no_provider']).map((c) => c.label)).toEqual([
      'Both-verify (no provider)',
    ]);
  });

  it('labels inline fill, no venue latency, and on-service routing (D-194)', () => {
    expect(
      simHonestyChips([
        'live_market_quote',
        'inline_fill_model',
        'no_venue_latency',
        'execute_on_service_routing',
      ]).map((c) => c.label),
    ).toEqual(['Live mark', 'On service', 'Inline fill', 'No venue latency']);
  });
});
