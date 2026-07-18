import { describe, expect, it, vi } from 'vitest';
import type { BrokerAdapter, QuoteSnapshot } from '@hftr/contracts';
import { createFixedClock } from '../clock';
import { resolveLookbackQuotes } from './lookback-quotes';

function mockAdapter(
  getQuoteAt: (symbol: string, atIso: string) => Promise<QuoteSnapshot>,
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
    getQuote: async () => {
      throw new Error('unused');
    },
    getQuoteAt,
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
  };
}

describe('resolveLookbackQuotes', () => {
  const clock = createFixedClock(1_750_000_000_000);
  const atMs = clock.nowMs() - 60 * 60_000;

  it('uses adapter getQuoteAt when present', async () => {
    const getQuoteAt = vi.fn(async (symbol: string): Promise<QuoteSnapshot> => ({
      symbol: symbol.toUpperCase(),
      bidCents: 9_900,
      askCents: 9_950,
      lastCents: 9_925,
      asOfIso: new Date(atMs).toISOString(),
      feedClass: 'alpaca_iex_paper',
    }));
    const result = await resolveLookbackQuotes({
      instruments: ['AAPL'],
      atMs,
      clock,
      adapter: mockAdapter(getQuoteAt),
    });
    expect(getQuoteAt).toHaveBeenCalledOnce();
    expect(result.statuses).toEqual([
      { symbol: 'AAPL', feedClass: 'alpaca_iex_paper', ok: true },
    ]);
    expect(result.quotes.get('AAPL')?.lastCents).toBe(9_925);
  });

  it('falls back to synthetic when adapter lacks getQuoteAt', async () => {
    const adapter = mockAdapter(async () => {
      throw new Error('unused');
    });
    delete adapter.getQuoteAt;
    const result = await resolveLookbackQuotes({
      instruments: ['MSFT'],
      atMs,
      clock,
      adapter,
    });
    expect(result.statuses[0]?.feedClass).toBe('synthetic_sim');
    expect(result.quotes.has('MSFT')).toBe(true);
  });

  it('marks lookback_unavailable when getQuoteAt throws', async () => {
    const result = await resolveLookbackQuotes({
      instruments: ['ZZZZ'],
      atMs,
      clock,
      adapter: mockAdapter(async () => {
        throw new Error('alpaca_quote_at_unavailable');
      }),
    });
    expect(result.statuses).toEqual([
      { symbol: 'ZZZZ', feedClass: 'lookback_unavailable', ok: false },
    ]);
    expect(result.quotes.has('ZZZZ')).toBe(false);
  });
});
