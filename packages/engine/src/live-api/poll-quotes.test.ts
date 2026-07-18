import { describe, expect, it, vi } from 'vitest';
import type { BrokerAdapter, QuoteSnapshot } from '@hftr/contracts';
import { createFixedClock } from '../clock';
import { pollQuotes } from './poll-quotes';

function mockAdapter(
  getQuote: (symbol: string) => Promise<QuoteSnapshot>,
): BrokerAdapter {
  return {
    venue: 'alpaca',
    mode: 'paper',
    capabilities: () => ({
      venue: 'alpaca',
      assets: ['us_equity'],
      orderTypes: ['market'],
      sessions: 'extended',
      supportsPaper: true,
      supportsFractional: true,
      fundingUx: 'deep_link',
    }),
    verifyConnection: async () => 'connected',
    getBalances: async () => ({
      cashCents: 0,
      buyingPowerCents: 0,
      asOfIso: new Date().toISOString(),
    }),
    getQuote,
    submitOrder: async () => ({
      accepted: false,
      venueOrderId: null,
      rejectReason: 'test_stub',
    }),
    cancelOrder: async () => ({
      accepted: false,
      venueOrderId: null,
      rejectReason: 'test_stub',
    }),
    getFills: async () => [],
    getOrderByClientId: async () => null,
    getPositions: async () => [],
  };
}

describe('pollQuotes', () => {
  const clock = createFixedClock(1_750_000_000_000);

  it('caps symbols at eight and deduplicates', async () => {
    const result = await pollQuotes({
      instruments: ['aapl', 'AAPL', 'MSFT', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC'],
      clock,
    });
    expect(result.statuses).toHaveLength(8);
    expect(result.quotes.size).toBe(8);
    expect(result.statuses.every((s) => s.feedClass === 'synthetic_sim' && s.ok)).toBe(true);
  });

  it('uses adapter quotes with honest feedClass when present', async () => {
    const getQuote = vi.fn(async (symbol: string): Promise<QuoteSnapshot> => ({
      symbol: symbol.toUpperCase(),
      bidCents: 10_000,
      askCents: 10_100,
      lastCents: 10_050,
      asOfIso: clock.nowIso(),
      feedClass: 'alpaca_iex_paper',
    }));
    const result = await pollQuotes({
      instruments: ['AAPL'],
      clock,
      adapter: mockAdapter(getQuote),
    });
    expect(getQuote).toHaveBeenCalledWith('AAPL');
    expect(result.statuses).toEqual([
      { symbol: 'AAPL', feedClass: 'alpaca_iex_paper', ok: true },
    ]);
    expect(result.quotes.get('AAPL')?.lastCents).toBe(10_050);
  });

  it('marks failed adapter fetch without throwing', async () => {
    const result = await pollQuotes({
      instruments: ['ZZZZ'],
      clock,
      adapter: mockAdapter(async () => {
        throw new Error('alpaca_quote_unavailable');
      }),
    });
    expect(result.statuses).toEqual([
      { symbol: 'ZZZZ', feedClass: 'quote_unavailable', ok: false },
    ]);
    expect(result.quotes.has('ZZZZ')).toBe(false);
  });

  it('status rows never expose price fields', async () => {
    const result = await pollQuotes({
      instruments: ['AAPL'],
      clock,
    });
    for (const row of result.statuses) {
      expect(row).toEqual({
        symbol: expect.any(String),
        feedClass: expect.any(String),
        ok: expect.any(Boolean),
      });
    }
  });
});
