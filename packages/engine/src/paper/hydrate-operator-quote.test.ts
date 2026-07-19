import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteSnapshot } from '@hftr/contracts';

const recordPolledQuotesAsValueRefs = vi.fn();

vi.mock('../live-api/record-poll-quotes', () => ({
  recordPolledQuotesAsValueRefs: (...args: unknown[]) =>
    recordPolledQuotesAsValueRefs(...args),
}));

import { hydrateOperatorQuoteValueRefs } from './market-model';

const clock = {
  nowMs: () => Date.parse('2026-07-19T15:00:00.000Z'),
  nowIso: () => '2026-07-19T15:00:00.000Z',
};

describe('hydrateOperatorQuoteValueRefs (D-194)', () => {
  beforeEach(() => {
    recordPolledQuotesAsValueRefs.mockReset();
    recordPolledQuotesAsValueRefs.mockResolvedValue({ recorded: 1 });
  });

  it('persists owner teacher quote as ValueRefs', async () => {
    const owner: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 10000,
      askCents: 10010,
      lastCents: 10005,
      asOfIso: clock.nowIso(),
      feedClass: 'alpaca_iex_paper',
    };
    const result = await hydrateOperatorQuoteValueRefs({
      db: {} as never,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      moduleId: '00000000-0000-4000-8000-000000000002',
      symbol: 'aapl',
      adapter: null,
      loadOwnerQuote: async () => owner,
    });
    expect(result).toEqual({ hydrated: true });
    expect(recordPolledQuotesAsValueRefs).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: '00000000-0000-4000-8000-000000000001',
        moduleId: '00000000-0000-4000-8000-000000000002',
        quotes: [['AAPL', owner]],
      }),
    );
  });

  it('fail-opens when no quote is available', async () => {
    const result = await hydrateOperatorQuoteValueRefs({
      db: {} as never,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'ZZZZ',
      adapter: null,
      loadOwnerQuote: async () => null,
    });
    expect(result).toEqual({ hydrated: false });
    expect(recordPolledQuotesAsValueRefs).not.toHaveBeenCalled();
  });

  it('fail-opens when record throws', async () => {
    recordPolledQuotesAsValueRefs.mockRejectedValue(new Error('db down'));
    const owner: QuoteSnapshot = {
      symbol: 'MSFT',
      lastCents: 50,
      asOfIso: clock.nowIso(),
      feedClass: 'alpaca_iex_paper',
    };
    const result = await hydrateOperatorQuoteValueRefs({
      db: {} as never,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'MSFT',
      loadOwnerQuote: async () => owner,
    });
    expect(result).toEqual({ hydrated: false });
  });
});
