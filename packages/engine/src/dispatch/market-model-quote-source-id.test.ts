import { describe, expect, it } from 'vitest';
import { marketModelQuoteSourceId } from '../dispatch/paper-trade';

describe('marketModelQuoteSourceId (D-187)', () => {
  it('uses alpaca_iex_paper source for live alpaca feed', () => {
    expect(
      marketModelQuoteSourceId({
        venue: 'paper_sim',
        symbol: 'aapl',
        usedLive: true,
        feedClass: 'alpaca_iex_paper',
      }),
    ).toBe('alpaca_iex_paper:quote:AAPL');
  });

  it('uses live_api source for live_api_mark', () => {
    expect(
      marketModelQuoteSourceId({
        venue: 'paper_sim',
        symbol: 'MSFT',
        usedLive: true,
        feedClass: 'live_api_mark',
      }),
    ).toBe('live_api:quote:MSFT');
  });

  it('uses synthetic_sim when not live', () => {
    expect(
      marketModelQuoteSourceId({
        venue: 'paper_sim',
        symbol: 'X',
        usedLive: false,
        feedClass: 'alpaca_iex_paper',
      }),
    ).toBe('synthetic_sim:X');
  });
});
