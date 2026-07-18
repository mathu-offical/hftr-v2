import { describe, expect, it } from 'vitest';
import {
  calculateCompanyEquity,
  type EquityCashInput,
  type EquityConfirmedPosition,
  type EquityMarkCandidate,
} from './equity';

const NOW_MS = 1_750_000_000_000;
const TTL_MS = 15_000;

function cash(cashCents: bigint): EquityCashInput {
  return { cashCents };
}

function position(
  symbol: string,
  qty: bigint,
  overrides: Partial<Omit<EquityConfirmedPosition, 'symbol' | 'qty'>> = {},
): EquityConfirmedPosition {
  return { symbol, qty, ...overrides };
}

function mark(overrides: EquityMarkCandidate): EquityMarkCandidate {
  return overrides;
}

function freshCapturedAt(): number {
  return NOW_MS - 1_000;
}

describe('calculateCompanyEquity', () => {
  it('returns cash-only equity with zero position value', () => {
    const result = calculateCompanyEquity({
      cash: cash(1_000_000n),
      positions: [],
      marks: [],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 1_000_000n,
      positionValueCents: 0n,
      usedSourceIds: [],
    });
  });

  it('sums two open positions using per-share marks', () => {
    const result = calculateCompanyEquity({
      cash: cash(100_000n),
      positions: [
        position('AAPL', 10n, { venue: 'NASDAQ' }),
        position('MSFT', 5n, { venue: 'NASDAQ' }),
      ],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'MSFT',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 40_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 450_000n,
      positionValueCents: 350_000n,
      usedSourceIds: ['venue-nasdaq'],
    });
  });

  it('excludes zero-quantity positions from mark requirements', () => {
    const result = calculateCompanyEquity({
      cash: cash(50_000n),
      positions: [
        position('AAPL', 0n, { venue: 'NASDAQ' }),
        position('MSFT', 2n, { venue: 'NASDAQ' }),
      ],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'MSFT',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 10_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 70_000n,
      positionValueCents: 20_000n,
      usedSourceIds: ['venue-nasdaq'],
    });
  });

  it('prefers broker-reported market value over venue and paper quotes', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ', connectionId: 'broker-1' })],
      marks: [
        mark({
          sourceId: 'broker-1-position',
          symbol: 'AAPL',
          connectionId: 'broker-1',
          kind: 'broker_market_value',
          valueCents: 200_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 12_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-b',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 14_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['broker-1-position'],
    });
  });

  it('prefers a fresh venue quote over paper median marks', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ' })],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_500n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 10_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-b',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 20_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 155_000n,
      positionValueCents: 155_000n,
      usedSourceIds: ['venue-nasdaq'],
    });
  });

  it('uses deterministic median of fresh compatible paper quotes', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n)],
      marks: [
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 10_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-b',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 20_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-c',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 30_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['paper-a', 'paper-b', 'paper-c'],
    });
  });

  it('deduplicates duplicate source ids before median selection', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n)],
      marks: [
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 10_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 99_000n,
          capturedAtMs: freshCapturedAt() - 500,
        }),
        mark({
          sourceId: 'paper-b',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 30_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['paper-a', 'paper-b'],
    });
  });

  it('returns unavailable when any nonzero position lacks a fresh mark', () => {
    const result = calculateCompanyEquity({
      cash: cash(100_000n),
      positions: [
        position('AAPL', 10n, { venue: 'NASDAQ' }),
        position('MSFT', 5n, { venue: 'NASDAQ' }),
      ],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'missing_fresh_marks',
      missingSymbols: ['MSFT'],
    });
  });

  it('treats stale marks as missing', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ' })],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_000n,
          capturedAtMs: NOW_MS - TTL_MS - 1,
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'missing_fresh_marks',
      missingSymbols: ['AAPL'],
    });
  });

  it('rejects negative cash', () => {
    const result = calculateCompanyEquity({
      cash: cash(-1n),
      positions: [],
      marks: [],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'negative_cash',
      missingSymbols: [],
    });
  });

  it('rejects negative marks', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ' })],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: -100n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'negative_mark',
      missingSymbols: [],
    });
  });

  it('never falls back to paper median for broker-backed positions', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ', connectionId: 'broker-1' })],
      marks: [
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 12_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-b',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 14_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'missing_fresh_marks',
      missingSymbols: ['AAPL'],
    });
  });

  it('allows broker-backed positions to use matching venue quote without paper fallback', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ', connectionId: 'broker-1' })],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_000n,
          capturedAtMs: freshCapturedAt(),
        }),
        mark({
          sourceId: 'paper-a',
          symbol: 'AAPL',
          kind: 'paper_quote',
          valueCents: 99_000n,
          capturedAtMs: freshCapturedAt(),
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'fresh',
      equityCents: 150_000n,
      positionValueCents: 150_000n,
      usedSourceIds: ['venue-nasdaq'],
    });
  });

  it('treats future capturedAtMs as not fresh', () => {
    const result = calculateCompanyEquity({
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ' })],
      marks: [
        mark({
          sourceId: 'venue-nasdaq',
          symbol: 'AAPL',
          venue: 'NASDAQ',
          kind: 'venue_quote',
          valueCents: 15_000n,
          capturedAtMs: NOW_MS + 1,
        }),
      ],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'missing_fresh_marks',
      missingSymbols: ['AAPL'],
    });
  });

  it('rejects malformed timing inputs with stable reason', () => {
    const base = {
      cash: cash(0n),
      positions: [] as EquityConfirmedPosition[],
      marks: [] as EquityMarkCandidate[],
    };

    expect(calculateCompanyEquity({ ...base, nowMs: Number.NaN, ttlMs: TTL_MS })).toEqual({
      status: 'unavailable',
      reason: 'invalid_timing',
      missingSymbols: [],
    });

    expect(calculateCompanyEquity({ ...base, nowMs: -1, ttlMs: TTL_MS })).toEqual({
      status: 'unavailable',
      reason: 'invalid_timing',
      missingSymbols: [],
    });

    expect(calculateCompanyEquity({ ...base, nowMs: NOW_MS, ttlMs: 0 })).toEqual({
      status: 'unavailable',
      reason: 'invalid_timing',
      missingSymbols: [],
    });

    expect(
      calculateCompanyEquity({ ...base, nowMs: NOW_MS, ttlMs: Number.POSITIVE_INFINITY }),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalid_timing',
      missingSymbols: [],
    });

    expect(
      calculateCompanyEquity({
        cash: cash(0n),
        positions: [position('AAPL', 1n, { venue: 'NASDAQ' })],
        marks: [
          mark({
            sourceId: 'venue-nasdaq',
            symbol: 'AAPL',
            venue: 'NASDAQ',
            kind: 'venue_quote',
            valueCents: 15_000n,
            capturedAtMs: Number.NaN,
          }),
        ],
        nowMs: NOW_MS,
        ttlMs: TTL_MS,
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalid_timing',
      missingSymbols: [],
    });

    expect(
      calculateCompanyEquity({
        cash: cash(0n),
        positions: [position('AAPL', 1n, { venue: 'NASDAQ' })],
        marks: [
          mark({
            sourceId: 'venue-nasdaq',
            symbol: 'AAPL',
            venue: 'NASDAQ',
            kind: 'venue_quote',
            valueCents: 15_000n,
            capturedAtMs: -1,
          }),
        ],
        nowMs: NOW_MS,
        ttlMs: TTL_MS,
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'invalid_timing',
      missingSymbols: [],
    });
  });

  it('rejects negative position quantity', () => {
    const result = calculateCompanyEquity({
      cash: cash(50_000n),
      positions: [position('AAPL', -1n, { venue: 'NASDAQ' })],
      marks: [],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    });

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'negative_position_qty',
      missingSymbols: [],
    });
  });

  it('chooses newest broker mark deterministically regardless of input order', () => {
    const older = mark({
      sourceId: 'broker-a',
      symbol: 'AAPL',
      connectionId: 'broker-1',
      kind: 'broker_market_value',
      valueCents: 100_000n,
      capturedAtMs: freshCapturedAt() - 2_000,
    });
    const newer = mark({
      sourceId: 'broker-b',
      symbol: 'AAPL',
      connectionId: 'broker-1',
      kind: 'broker_market_value',
      valueCents: 200_000n,
      capturedAtMs: freshCapturedAt(),
    });
    const input = {
      cash: cash(0n),
      positions: [position('AAPL', 10n, { connectionId: 'broker-1' })],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    };

    expect(calculateCompanyEquity({ ...input, marks: [older, newer] })).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['broker-b'],
    });

    expect(calculateCompanyEquity({ ...input, marks: [newer, older] })).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['broker-b'],
    });
  });

  it('tie-breaks equal capturedAtMs broker marks by sourceId lexicographically', () => {
    const markZ = mark({
      sourceId: 'broker-z',
      symbol: 'AAPL',
      connectionId: 'broker-1',
      kind: 'broker_market_value',
      valueCents: 111_000n,
      capturedAtMs: freshCapturedAt(),
    });
    const markA = mark({
      sourceId: 'broker-a',
      symbol: 'AAPL',
      connectionId: 'broker-1',
      kind: 'broker_market_value',
      valueCents: 222_000n,
      capturedAtMs: freshCapturedAt(),
    });
    const input = {
      cash: cash(0n),
      positions: [position('AAPL', 10n, { connectionId: 'broker-1' })],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    };

    expect(calculateCompanyEquity({ ...input, marks: [markZ, markA] })).toEqual({
      status: 'fresh',
      equityCents: 222_000n,
      positionValueCents: 222_000n,
      usedSourceIds: ['broker-a'],
    });

    expect(calculateCompanyEquity({ ...input, marks: [markA, markZ] })).toEqual({
      status: 'fresh',
      equityCents: 222_000n,
      positionValueCents: 222_000n,
      usedSourceIds: ['broker-a'],
    });
  });

  it('chooses newest venue mark deterministically regardless of input order', () => {
    const older = mark({
      sourceId: 'venue-old',
      symbol: 'AAPL',
      venue: 'NASDAQ',
      kind: 'venue_quote',
      valueCents: 10_000n,
      capturedAtMs: freshCapturedAt() - 2_000,
    });
    const newer = mark({
      sourceId: 'venue-new',
      symbol: 'AAPL',
      venue: 'NASDAQ',
      kind: 'venue_quote',
      valueCents: 20_000n,
      capturedAtMs: freshCapturedAt(),
    });
    const input = {
      cash: cash(0n),
      positions: [position('AAPL', 10n, { venue: 'NASDAQ' })],
      nowMs: NOW_MS,
      ttlMs: TTL_MS,
    };

    expect(calculateCompanyEquity({ ...input, marks: [older, newer] })).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['venue-new'],
    });

    expect(calculateCompanyEquity({ ...input, marks: [newer, older] })).toEqual({
      status: 'fresh',
      equityCents: 200_000n,
      positionValueCents: 200_000n,
      usedSourceIds: ['venue-new'],
    });
  });
});
