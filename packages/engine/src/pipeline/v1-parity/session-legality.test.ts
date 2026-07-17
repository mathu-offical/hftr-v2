import { describe, expect, it } from 'vitest';
import type { SessionPhase } from '@hftr/contracts';
import { computeOperatingLimits } from '../../limits/compute';
import type { LimitContext } from '../../limits/context';
import { evaluateGates, gatesPass } from '../gates';
import {
  classifyTradingSession,
  formatVerifiedPatternRef,
  isPatternReuseSessionLegal,
  isPatternVersionCurrent,
  isRegularSessionOpen,
  isSessionTradingAllowed,
  parseVerifiedPatternRef,
  resolvePatternReuseResumeCondition,
  TREE_VERSION_AGE_MS,
} from '../session-legality';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const NOW_MS = 1_750_000_000_000;

function limitCtx(overrides: Partial<LimitContext> = {}): LimitContext {
  return {
    companyId: COMPANY_ID,
    moduleId: null,
    mode: 'paper',
    nowMs: NOW_MS,
    sessionPhase: 'open',
    virtualBalanceCents: 100_000n,
    brokerBuyingPowerCents: 80_000n,
    equityCents: 100_000n,
    realizedLossCents: 0n,
    brokerEnvelopeId: 'bpe-001',
    recentTraceTimestampsMs: [],
    ...overrides,
  };
}

const ALL_PHASES: SessionPhase[] = [
  'pre_market',
  'open',
  'midday',
  'power_hour',
  'closed',
  'overnight',
];

describe('v1-parity session legality', () => {
  describe('isRegularSessionOpen / isSessionTradingAllowed', () => {
    it.each(['open', 'midday', 'power_hour'] as const)('regular open phase %s', (phase) => {
      expect(isRegularSessionOpen(phase)).toBe(true);
      expect(isSessionTradingAllowed(phase, 'live')).toBe(true);
      expect(isSessionTradingAllowed(phase, 'paper')).toBe(true);
    });

    it.each(['pre_market', 'closed', 'overnight'] as const)(
      'closed phase %s blocks live',
      (phase) => {
        expect(isRegularSessionOpen(phase)).toBe(false);
        expect(isSessionTradingAllowed(phase, 'live')).toBe(false);
        expect(isSessionTradingAllowed(phase, 'paper')).toBe(true);
      },
    );
  });

  describe('gates and limits agree on paper waiver', () => {
    it.each(ALL_PHASES)('paper mode session_fit passes for %s', (sessionPhase) => {
      const gates = evaluateGates({
        symbol: 'AAPL',
        direction: 'up',
        scannedAtMs: NOW_MS - 1_000,
        nowMs: NOW_MS,
        sessionPhase,
        mode: 'paper',
      });
      const sessionGate = gates.find((g) => g.gate === 'session_fit')!;
      expect(sessionGate.result).toBe('pass');
      expect(isSessionTradingAllowed(sessionPhase, 'paper')).toBe(true);
    });

    it.each(['closed', 'overnight', 'pre_market'] as const)(
      'live mode blocks %s in gates and limits',
      (sessionPhase) => {
        const gates = evaluateGates({
          symbol: 'AAPL',
          direction: 'up',
          scannedAtMs: NOW_MS - 1_000,
          nowMs: NOW_MS,
          sessionPhase,
          mode: 'live',
          brokerConnected: true,
          brokerConnectionMode: 'live',
        });
        expect(gates.find((g) => g.gate === 'session_fit')!.result).toBe('fail');
        expect(gatesPass(gates)).toBe(false);

        const snapshot = computeOperatingLimits(limitCtx({ mode: 'live', sessionPhase }));
        expect(snapshot.limits.find((l) => l.domain === 'session_legality')!.status).toBe('block');
      },
    );

    it('live open session passes limits session_legality', () => {
      const snapshot = computeOperatingLimits(limitCtx({ mode: 'live', sessionPhase: 'open' }));
      expect(snapshot.limits.find((l) => l.domain === 'session_legality')!.status).toBe('pass');
    });
  });

  describe('classifyTradingSession (ET wall clock)', () => {
    // Wed 2025-07-16 times (DST) — deterministic UTC instants
    const cases: [string, number, 'regular' | 'extended' | 'overnight'][] = [
      ['regular midday', Date.parse('2025-07-16T17:00:00.000Z'), 'regular'], // 13:00 ET
      ['pre-market', Date.parse('2025-07-16T12:00:00.000Z'), 'extended'], // 08:00 ET
      ['after-hours', Date.parse('2025-07-16T21:00:00.000Z'), 'extended'], // 17:00 ET
      ['overnight', Date.parse('2025-07-17T02:00:00.000Z'), 'overnight'], // 22:00 ET prior day
      ['early overnight', Date.parse('2025-07-16T07:00:00.000Z'), 'overnight'], // 03:00 ET
    ];

    it.each(cases)('%s → %s', (_label, nowMs, expected) => {
      expect(classifyTradingSession(nowMs)).toBe(expected);
    });
  });

  describe('verified pattern ref parsing', () => {
    it('formats and parses round-trip', () => {
      const ref = formatVerifiedPatternRef('tree-abc', 3, 'extended');
      expect(ref).toBe('tree-abc:v3:extended');
      expect(parseVerifiedPatternRef(ref)).toEqual({
        treeId: 'tree-abc',
        version: 3,
        sessionClass: 'extended',
      });
    });

    it('defaults session class to regular when omitted', () => {
      expect(parseVerifiedPatternRef('tree-xyz:v2')).toEqual({
        treeId: 'tree-xyz',
        version: 2,
        sessionClass: 'regular',
      });
    });

    it.each(['', 'bad-ref', 'tree:v0', 'tree:v1:invalid'] as const)(
      'returns null for invalid ref %j',
      (ref) => {
        expect(parseVerifiedPatternRef(ref)).toBeNull();
      },
    );
  });

  describe('pattern reuse legality', () => {
    const regularRef = formatVerifiedPatternRef('t1', 2, 'regular');
    const extendedRef = formatVerifiedPatternRef('t1', 2, 'extended');

    it('allows reuse when session class matches', () => {
      expect(isPatternReuseSessionLegal(regularRef, 'regular')).toBe(true);
      expect(isPatternReuseSessionLegal(extendedRef, 'extended')).toBe(true);
    });

    it('blocks extended-verified pattern in regular-only current session edge', () => {
      expect(isPatternReuseSessionLegal(extendedRef, 'regular')).toBe(false);
    });

    it('blocks any reuse into non-regular current session', () => {
      expect(isPatternReuseSessionLegal(regularRef, 'overnight')).toBe(false);
      expect(isPatternReuseSessionLegal(regularRef, 'extended')).toBe(false);
    });
  });

  describe('pattern version currency', () => {
    const ref = formatVerifiedPatternRef('t1', 5, 'regular');

    it('matches exact tree version', () => {
      expect(isPatternVersionCurrent(ref, 5)).toBe(true);
    });

    it('rejects stale tree version', () => {
      expect(isPatternVersionCurrent(ref, 4)).toBe(false);
      expect(isPatternVersionCurrent(ref, 6)).toBe(false);
    });
  });

  describe('resolvePatternReuseResumeCondition', () => {
    const ref = formatVerifiedPatternRef('t1', 2, 'regular');

    it('returns reuse when ref current and session legal', () => {
      expect(resolvePatternReuseResumeCondition(ref, 2, 'regular')).toBe(
        'reuse_last_verified_pattern',
      );
    });

    it.each([
      [null, 2, 'regular'],
      [ref, 3, 'regular'],
      [ref, 2, 'overnight'],
    ] as const)('returns tier_retune for blocked inputs', (patternRef, version, session) => {
      expect(resolvePatternReuseResumeCondition(patternRef, version, session)).toBe('tier_retune');
    });
  });

  it('exports TREE_VERSION_AGE_MS constant (30 min)', () => {
    expect(TREE_VERSION_AGE_MS).toBe(30 * 60 * 1000);
  });
});
