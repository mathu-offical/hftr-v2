import { describe, expect, it } from 'vitest';
import { nextEquityFields } from './recompute';

const asOf = new Date('2026-07-17T12:00:00.000Z');

describe('nextEquityFields', () => {
  it('writes fresh cents and ref on successful calc', () => {
    const next = nextEquityFields(
      {
        equityCents: 100n,
        equityRef: 'nv_old',
        equityAsOf: asOf,
        equityStatus: 'fresh',
        equityVersion: 1,
      },
      {
        status: 'fresh',
        equityCents: 250_000n,
        positionValueCents: 0n,
        usedSourceIds: [],
      },
      asOf.getTime() + 1000,
      'nv_new',
    );
    expect(next).toEqual({
      equityCents: 250_000n,
      equityRef: 'nv_new',
      equityAsOf: new Date(asOf.getTime() + 1000),
      equityStatus: 'fresh',
      bumpVersion: true,
    });
  });

  it('preserves last good cents as stale when calc unavailable', () => {
    const next = nextEquityFields(
      {
        equityCents: 100_000n,
        equityRef: 'nv_old',
        equityAsOf: asOf,
        equityStatus: 'fresh',
        equityVersion: 2,
      },
      {
        status: 'unavailable',
        reason: 'missing_fresh_marks',
        missingSymbols: ['AAPL'],
      },
      asOf.getTime() + 5000,
      null,
    );
    expect(next.equityStatus).toBe('stale');
    expect(next.equityCents).toBe(100_000n);
    expect(next.equityRef).toBe('nv_old');
    expect(next.equityAsOf).toEqual(asOf);
  });

  it('marks unavailable when no prior successful equity', () => {
    const next = nextEquityFields(
      {
        equityCents: null,
        equityRef: null,
        equityAsOf: null,
        equityStatus: 'unavailable',
        equityVersion: 0,
      },
      {
        status: 'unavailable',
        reason: 'missing_fresh_marks',
        missingSymbols: ['AAPL'],
      },
      asOf.getTime(),
      null,
    );
    expect(next).toEqual({
      equityCents: null,
      equityRef: null,
      equityAsOf: null,
      equityStatus: 'unavailable',
      bumpVersion: true,
    });
  });
});
