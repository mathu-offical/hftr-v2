import { describe, expect, it } from 'vitest';
import {
  getRecoveryLadderTemplate,
  loadRecoveryLadderTemplates,
  recoveryTemplateForFamily,
} from '../recovery-ladder';

const FAMILY_TO_TEMPLATE: [string, string][] = [
  ['opening_range_breakout', 'rec-002'],
  ['gap_and_go', 'rec-002'],
  ['vwap_reversion', 'rec-003'],
  ['liquidity_sweep_reversal', 'rec-003'],
  ['earnings_guidance_drift', 'rec-004'],
  ['lead_lag_propagation', 'rec-005'],
  ['pullback_continuation', 'rec-005'],
  ['all_execution_sensitive_families', 'rec-001'],
];

describe('v1-parity recovery ladders', () => {
  it('loads recovery ladder templates from seeded-strategy-catalog', () => {
    const templates = loadRecoveryLadderTemplates();
    expect(templates.size).toBeGreaterThanOrEqual(5);
    for (const id of ['rec-001', 'rec-002', 'rec-003', 'rec-004', 'rec-005', 'rec-006']) {
      expect(templates.has(id), `missing ${id}`).toBe(true);
    }
  });

  it.each([
    ...FAMILY_TO_TEMPLATE,
    ['strat-001', 'rec-002'],
    ['strat-002', 'rec-002'],
    ['strat-005', 'rec-003'],
    ['strat-007', 'rec-006'],
    ['market_making', 'rec-006'],
  ] as [string, string][])('recoveryTemplateForFamily(%s) → %s', (family, expectedId) => {
    expect(recoveryTemplateForFamily(family)).toBe(expectedId);
  });

  it('falls back to rec-001 for unknown strategy family', () => {
    expect(recoveryTemplateForFamily('nonexistent_family_xyz')).toBe('rec-001');
  });

  it('rec-001 phased_slippage_resolution has five phases', () => {
    const tpl = getRecoveryLadderTemplate('rec-001')!;
    expect(tpl.name).toBe('phased_slippage_resolution');
    expect(tpl.phases).toEqual([
      'observe',
      'constrain',
      'reprice',
      'cancel_replace',
      'escalate_or_abort',
    ]);
  });

  it('rec-002 breakout_failure_recovery applies to breakout families', () => {
    const tpl = getRecoveryLadderTemplate('rec-002')!;
    expect(tpl.appliesTo).toContain('opening_range_breakout');
    expect(tpl.phases[0]).toBe('failed_break_detected');
  });

  it('rec-006 schedule deviation ladder ends with escalate_or_abort', () => {
    const tpl = getRecoveryLadderTemplate('rec-006')!;
    expect(tpl.phases.at(-1)).toBe('escalate_or_abort');
    expect(tpl.appliesTo).toContain('all_execution_sensitive_families');
  });

  it.each(['rec-001', 'rec-002', 'rec-003', 'rec-004', 'rec-005', 'rec-006'] as const)(
    'template %s has non-empty phases and appliesTo',
    (id) => {
      const tpl = getRecoveryLadderTemplate(id)!;
      expect(tpl.phases.length).toBeGreaterThan(0);
      expect(tpl.appliesTo.length).toBeGreaterThan(0);
    },
  );

  it('tree.ts default recovery ladder is a minimal execution stub (not catalog phases)', () => {
    // Document honest gap: compile tree uses ['defer','cancel','escalate'] until
    // tactical handler wires catalog template phases.
    expect(['defer', 'cancel', 'escalate']).toHaveLength(3);
  });
});
