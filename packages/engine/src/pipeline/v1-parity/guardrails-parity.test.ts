import { describe, expect, it } from 'vitest';
import type { SessionPhase } from '@hftr/contracts';
import {
  evaluateGuardrails,
  guardrailsBlock,
  type GuardrailEvalContext,
} from '../../guardrails/evaluate';
import { getGuardrailPackage, listGuardrailPackageIds } from '../../guardrails/registry';

const NOW_MS = 1_750_000_000_000;

function ctx(overrides: Partial<GuardrailEvalContext> = {}): GuardrailEvalContext {
  return {
    nowMs: NOW_MS,
    sessionPhase: 'open',
    mode: 'paper',
    activePackageIds: [],
    ...overrides,
  };
}

const EVALUATED_PACKAGES = ['grd-001', 'grd-002', 'grd-003', 'grd-007'] as const;

describe('v1-parity guardrails', () => {
  it('loads guardrail packages from seed catalog', () => {
    const ids = listGuardrailPackageIds();
    for (const id of EVALUATED_PACKAGES) {
      expect(ids).toContain(id);
      expect(getGuardrailPackage(id)?.id).toBe(id);
    }
  });

  it('skips unknown package ids without throwing', () => {
    const results = evaluateGuardrails(ctx({ activePackageIds: ['grd-999', 'grd-001'] }));
    expect(results).toHaveLength(1);
    expect(results[0]?.packageRef.packageId).toBe('grd-001');
  });

  describe('grd-001 event_conflict_blackout', () => {
    it('passes when no event blackout active', () => {
      const [ev] = evaluateGuardrails(ctx({ activePackageIds: ['grd-001'] }));
      expect(ev?.outcome).toBe('pass');
      expect(ev?.firedTriggers).toHaveLength(0);
    });

    it('blocks when eventBlackoutActive', () => {
      const [ev] = evaluateGuardrails(
        ctx({ activePackageIds: ['grd-001'], eventBlackoutActive: true }),
      );
      expect(ev?.outcome).toBe('block');
      expect(ev?.failureCodes).toContain('EVT_BLACKOUT_ACTIVE');
      expect(ev?.firedTriggers).toContain('unconfirmed_event_cluster');
    });
  });

  describe('grd-002 macro_blackout', () => {
    it('passes when macro blackout inactive', () => {
      const [ev] = evaluateGuardrails(ctx({ activePackageIds: ['grd-002'] }));
      expect(ev?.outcome).toBe('pass');
    });

    it('blocks when macroBlackoutActive', () => {
      const [ev] = evaluateGuardrails(
        ctx({ activePackageIds: ['grd-002'], macroBlackoutActive: true }),
      );
      expect(ev?.outcome).toBe('block');
      expect(ev?.failureCodes).toContain('MACRO_BLACKOUT_ACTIVE');
    });
  });

  describe('grd-003 liquidity_and_spread', () => {
    it.each([
      ['spreadAboveCeiling', { spreadAboveCeiling: true }, 'SPREAD_CEILING_BREACH'],
      ['quoteFreshnessStale', { quoteFreshnessStale: true }, 'QUOTE_FRESHNESS_INVALID'],
      ['offHoursLiquidityAbsent', { offHoursLiquidityAbsent: true }, 'LIQUIDITY_TOO_THIN'],
    ] as const)('blocks on %s trigger', (_label, triggerCtx, code) => {
      const [ev] = evaluateGuardrails(ctx({ activePackageIds: ['grd-003'], ...triggerCtx }));
      expect(ev?.outcome).toBe('block');
      expect(ev?.failureCodes).toContain(code);
    });

    it('passes when all liquidity triggers clear', () => {
      const [ev] = evaluateGuardrails(ctx({ activePackageIds: ['grd-003'] }));
      expect(ev?.outcome).toBe('pass');
    });
  });

  describe('grd-007 session_legality_guardrail', () => {
    const closedPhases: SessionPhase[] = ['closed', 'overnight', 'pre_market'];

    it.each(closedPhases)('blocks live orders in %s session', (sessionPhase) => {
      const [ev] = evaluateGuardrails(
        ctx({ activePackageIds: ['grd-007'], mode: 'live', sessionPhase }),
      );
      expect(ev?.outcome).toBe('block');
      expect(ev?.failureCodes).toContain('SESSION_ILLEGAL_ORDER_FORM');
    });

    it.each(closedPhases)('paper mode passes session guardrail in %s', (sessionPhase) => {
      const [ev] = evaluateGuardrails(
        ctx({ activePackageIds: ['grd-007'], mode: 'paper', sessionPhase }),
      );
      expect(ev?.outcome).toBe('pass');
    });

    it.each(['open', 'midday', 'power_hour'] as const)(
      'live mode passes in open phase %s',
      (sessionPhase) => {
        const [ev] = evaluateGuardrails(
          ctx({ activePackageIds: ['grd-007'], mode: 'live', sessionPhase }),
        );
        expect(ev?.outcome).toBe('pass');
      },
    );
  });

  it('evaluates multiple packages independently', () => {
    const results = evaluateGuardrails(
      ctx({
        activePackageIds: ['grd-001', 'grd-002', 'grd-003'],
        eventBlackoutActive: true,
        macroBlackoutActive: true,
        spreadAboveCeiling: true,
      }),
    );
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.outcome === 'block')).toHaveLength(3);
  });

  it('guardrailsBlock is true when any evaluation blocks', () => {
    const results = evaluateGuardrails(
      ctx({ activePackageIds: ['grd-001', 'grd-002'], macroBlackoutActive: true }),
    );
    expect(guardrailsBlock(results)).toBe(true);
    const passOnly = evaluateGuardrails(ctx({ activePackageIds: ['grd-001', 'grd-002'] }));
    expect(guardrailsBlock(passOnly)).toBe(false);
  });

  it('includes catalog version in packageRef', () => {
    const [ev] = evaluateGuardrails(ctx({ activePackageIds: ['grd-001'] }));
    expect(ev?.packageRef.catalogVersion).toBeTruthy();
    expect(ev?.packageRef.name).toBe(getGuardrailPackage('grd-001')?.name);
  });
});
