import { describe, expect, it } from 'vitest';
import type { QuoteSnapshot } from '@hftr/contracts';
import { projectMarketModelToAwareness } from './awareness-adapters';
import { fuseQuoteCandidates, resolveMarketQuote } from './market-model';

const clock = {
  nowMs: () => Date.parse('2026-07-18T15:00:00.000Z'),
  nowIso: () => '2026-07-18T15:00:00.000Z',
};

describe('resolveMarketQuote (D-122)', () => {
  it('uses live quote when present', () => {
    const live: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 10000,
      askCents: 10010,
      lastCents: 10005,
      asOfIso: clock.nowIso(),
      feedClass: 'alpaca_iex_paper',
    };
    const resolved = resolveMarketQuote({ symbol: 'AAPL', clock, liveQuote: live });
    expect(resolved.usedLive).toBe(true);
    expect(resolved.sourceClass).toBe('broker_state');
    expect(resolved.quote.lastCents).toBe(10005);
  });

  it('falls back to synthetic when live missing', () => {
    const resolved = resolveMarketQuote({ symbol: 'MSFT', clock, liveQuote: null });
    expect(resolved.usedLive).toBe(false);
    expect(resolved.sourceClass).toBe('synthetic_sim');
    expect(resolved.quote.feedClass).toBe('synthetic_sim');
  });

  it('fuses candidates preferring fresher live over synthetic', () => {
    const olderLive: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 10000,
      askCents: 10010,
      lastCents: 10000,
      asOfIso: '2026-07-18T14:00:00.000Z',
      feedClass: 'alpaca_iex_paper',
    };
    const newerLive: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 10100,
      askCents: 10110,
      lastCents: 10105,
      asOfIso: '2026-07-18T15:00:00.000Z',
      feedClass: 'alpaca_iex_paper',
    };
    const synthetic: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 9999,
      askCents: 10001,
      lastCents: 10000,
      asOfIso: '2026-07-18T15:01:00.000Z',
      feedClass: 'synthetic_sim',
    };
    expect(fuseQuoteCandidates([olderLive, newerLive, synthetic])?.lastCents).toBe(10105);
    const resolved = resolveMarketQuote({
      symbol: 'AAPL',
      clock,
      candidates: [olderLive, newerLive, synthetic],
    });
    expect(resolved.usedLive).toBe(true);
    expect(resolved.quote.lastCents).toBe(10105);
  });
});

describe('awareness adapters (D-122 Phase 2)', () => {
  it('projects posture hub and current awareness surfaces', () => {
    const live = resolveMarketQuote({
      symbol: 'AAPL',
      clock,
      liveQuote: {
        symbol: 'AAPL',
        bidCents: 10000,
        askCents: 10010,
        lastCents: 10005,
        asOfIso: clock.nowIso(),
        feedClass: 'alpaca_iex_paper',
      },
    });
    const synth = resolveMarketQuote({ symbol: 'MSFT', clock, liveQuote: null });
    const projections = projectMarketModelToAwareness([live, synth], clock);
    expect(projections.map((p) => p.surface)).toEqual([
      'market_posture_hub',
      'current_awareness_topics',
    ]);
    expect(projections[0]?.usedLiveCount).toBe(1);
    expect(projections[0]?.syntheticCount).toBe(1);
    expect(projections[0]?.symbols).toEqual(['AAPL', 'MSFT']);
    expect(projections[0]?.notes.some((n) => n.includes('Live market model'))).toBe(true);
  });
});
