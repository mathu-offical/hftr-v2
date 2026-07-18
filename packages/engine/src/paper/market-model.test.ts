import { describe, expect, it } from 'vitest';
import type { QuoteSnapshot } from '@hftr/contracts';
import { resolveMarketQuote } from './market-model';

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
});
