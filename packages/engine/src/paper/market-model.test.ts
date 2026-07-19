import { describe, expect, it, vi } from 'vitest';
import type { QuoteSnapshot } from '@hftr/contracts';
import { projectMarketModelToAwareness } from './awareness-adapters';
import {
  fuseQuoteCandidates,
  previewHonestyTagsFromResolvedQuote,
  resolveDispatchMarketQuote,
  resolveMarketQuote,
} from './market-model';

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

describe('resolveDispatchMarketQuote (D-171 / D-177)', () => {
  const db = {} as never;

  it('uses owner Alpaca teacher when adapter is paper_sim / unbound', async () => {
    const owner: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 19000,
      askCents: 19010,
      lastCents: 19005,
      asOfIso: clock.nowIso(),
      feedClass: 'alpaca_iex_paper',
    };
    const loadOwnerQuote = vi.fn(async () => owner);
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'AAPL',
      adapter: { venue: 'paper_sim' } as never,
      loadOwnerQuote,
      skipValueRefs: true,
    });
    expect(loadOwnerQuote).toHaveBeenCalledOnce();
    expect(resolved.usedLive).toBe(true);
    expect(resolved.quote.lastCents).toBe(19005);
    expect(resolved.sourceClass).toBe('broker_state');
  });

  it('skips owner teacher when bound adapter already supplied live quote', async () => {
    const bound: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 20000,
      askCents: 20010,
      lastCents: 20005,
      asOfIso: clock.nowIso(),
      feedClass: 'alpaca_iex_paper',
    };
    const loadOwnerQuote = vi.fn(async () => {
      throw new Error('should not be called');
    });
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'AAPL',
      adapter: {
        venue: 'alpaca',
        getQuote: async () => bound,
      } as never,
      loadOwnerQuote,
      skipValueRefs: true,
    });
    expect(loadOwnerQuote).not.toHaveBeenCalled();
    expect(resolved.usedLive).toBe(true);
    expect(resolved.quote.lastCents).toBe(20005);
  });

  it('fail-opens to synthetic when owner quote throws / missing', async () => {
    const loadOwnerQuote = vi.fn(async () => {
      throw new Error('network');
    });
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'MSFT',
      loadOwnerQuote,
      skipValueRefs: true,
    });
    expect(resolved.usedLive).toBe(false);
    expect(resolved.sourceClass).toBe('synthetic_sim');
  });

  it('drops stale live teacher quotes during RTH and falls back to synthetic', async () => {
    const stale: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 19000,
      askCents: 19010,
      lastCents: 19005,
      asOfIso: '2026-07-18T14:00:00.000Z', // >90s before clock
      feedClass: 'alpaca_iex_paper',
    };
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'AAPL',
      loadOwnerQuote: async () => stale,
      skipValueRefs: true,
      sessionPhaseOverride: 'open',
    });
    expect(resolved.usedLive).toBe(false);
    expect(resolved.sourceClass).toBe('synthetic_sim');
  });

  it('rebuckets stale venue marks off-hours as prior_session_mark (D-177)', async () => {
    const stale: QuoteSnapshot = {
      symbol: 'AAPL',
      bidCents: 19000,
      askCents: 19010,
      lastCents: 19005,
      asOfIso: '2026-07-17T20:00:00.000Z',
      feedClass: 'alpaca_iex_paper',
    };
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'AAPL',
      loadOwnerQuote: async () => stale,
      skipValueRefs: true,
      sessionPhaseOverride: 'closed',
    });
    expect(resolved.usedLive).toBe(true);
    expect(resolved.priorSessionMark).toBe(true);
    expect(resolved.quote.lastCents).toBe(19005);
    expect(resolved.quote.asOfIso).toBe(clock.nowIso());
  });

  it('prefers fresh live_api ValueRef candidates over synthetic (skip owner)', async () => {
    const mark: QuoteSnapshot = {
      symbol: 'NVDA',
      bidCents: 120_000,
      askCents: 120_020,
      lastCents: 120_010,
      asOfIso: clock.nowIso(),
      feedClass: 'live_api_mark',
    };
    const resolved = await resolveDispatchMarketQuote({
      db,
      clock,
      companyId: '00000000-0000-4000-8000-000000000001',
      symbol: 'NVDA',
      candidates: [mark],
      skipValueRefs: true,
      loadOwnerQuote: async () => null,
    });
    expect(resolved.usedLive).toBe(true);
    expect(resolved.quote.lastCents).toBe(120_010);
    expect(resolved.quote.feedClass).toBe('live_api_mark');
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

describe('previewHonestyTagsFromResolvedQuote (D-192)', () => {
  it('tags live + prior session + funds_only', () => {
    const tags = previewHonestyTagsFromResolvedQuote(
      {
        quote: {
          symbol: 'AAPL',
          lastCents: 100,
          asOfIso: clock.nowIso(),
          feedClass: 'alpaca_iex_paper',
        },
        sourceClass: 'broker_state',
        usedLive: true,
        priorSessionMark: true,
      },
      { routingMode: 'funds_only' },
    );
    expect(tags).toEqual([
      'live_market_quote',
      'prior_session_mark',
      'funds_only_routing',
    ]);
  });

  it('tags synthetic without funds_only when omitted', () => {
    const tags = previewHonestyTagsFromResolvedQuote({
      quote: {
        symbol: 'MSFT',
        lastCents: 50,
        asOfIso: clock.nowIso(),
        feedClass: 'synthetic_sim',
      },
      sourceClass: 'synthetic_sim',
      usedLive: false,
    });
    expect(tags).toEqual(['synthetic_quote']);
  });
});
