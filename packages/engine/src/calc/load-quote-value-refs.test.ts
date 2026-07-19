import { describe, expect, it } from 'vitest';
import {
  quoteSourceIdsForSymbol,
  valueRefPriceToQuoteSnapshot,
} from './load-quote-value-refs';

describe('load-quote-value-refs (D-177)', () => {
  it('builds source ids for fusion', () => {
    expect(quoteSourceIdsForSymbol('aapl')).toEqual([
      'alpaca_iex_paper:quote:AAPL',
      'alpaca:quote:AAPL',
      'live_api:quote:AAPL',
      'paper_sim:quote:AAPL',
      'synthetic_sim:AAPL',
    ]);
  });

  it('synthesizes bid/ask around last with live_api feedClass', () => {
    const q = valueRefPriceToQuoteSnapshot({
      symbol: 'MSFT',
      lastCents: 40_000,
      asOfIso: '2026-07-19T15:00:00.000Z',
      sourceClass: 'live_feed',
      sourceId: 'live_api:quote:MSFT',
    });
    expect(q).not.toBeNull();
    expect(q!.feedClass).toBe('live_api_mark');
    expect(q!.lastCents).toBe(40_000);
    expect(q!.bidCents).toBeLessThan(q!.lastCents);
    expect(q!.askCents).toBeGreaterThan(q!.lastCents);
  });

  it('rejects non-positive prices', () => {
    expect(
      valueRefPriceToQuoteSnapshot({
        symbol: 'X',
        lastCents: 0,
        asOfIso: '2026-07-19T15:00:00.000Z',
        sourceClass: 'live_feed',
        sourceId: 'live_api:quote:X',
      }),
    ).toBeNull();
  });
});
